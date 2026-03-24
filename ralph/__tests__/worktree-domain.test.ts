import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  provisionWorktree,
  resolveLatestWorktreeName,
  resolveUniqueWorktreeName,
  type WorktreeNamingContext,
} from "../domain/worktree.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

// Mock node:fs
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { execFileSync } from "node:child_process";

describe("worktree domain", () => {
  const mockRepoRoot = "/tmp/repo";
  const mockTicket: WorktreeNamingContext = {
    ref: "T-123",
    externalRefs: ["JIRA-999"],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (fs.existsSync as any).mockReturnValue(false);
  });

  describe("resolveUniqueWorktreeName", () => {
    it("should return base name if no collision", () => {
      // Mock git branch list to return empty
      (execFileSync as any).mockReturnValue("");

      const result = resolveUniqueWorktreeName(mockTicket, mockRepoRoot, false);
      expect(result).toBe("ralph/T-123");
      expect(execFileSync).toHaveBeenCalledWith(
        "git",
        ["branch", "--list", "--format=%(refname:short)"],
        expect.objectContaining({ cwd: mockRepoRoot }),
      );
    });

    it("should append -1 if collision exists", () => {
      // Mock git branch list to return the base name
      (execFileSync as any).mockReturnValue("ralph/T-123\nother-branch");

      const result = resolveUniqueWorktreeName(mockTicket, mockRepoRoot, false);
      expect(result).toBe("ralph/T-123-1");
    });

    it("should increment counter until unique name found", () => {
      // Mock git branch list to return base and -1
      (execFileSync as any).mockReturnValue("ralph/T-123\nralph/T-123-1");

      const result = resolveUniqueWorktreeName(mockTicket, mockRepoRoot, false);
      expect(result).toBe("ralph/T-123-2");
    });

    it("should use external ref if preferred and available", () => {
      (execFileSync as any).mockReturnValue("");
      const result = resolveUniqueWorktreeName(mockTicket, mockRepoRoot, true);
      expect(result).toBe("JIRA-999");
    });

    it("should fallback to ticket ref if external ref naming preferred but no external refs", () => {
      (execFileSync as any).mockReturnValue("");
      const result = resolveUniqueWorktreeName({ ref: "T-123", externalRefs: [] }, mockRepoRoot, true);
      expect(result).toBe("ralph/T-123");
    });

    it("should sanitize external ref naming", () => {
      (execFileSync as any).mockReturnValue("");
      const badTicket: WorktreeNamingContext = { ref: "T-123", externalRefs: ["ACME/Project:123"] };
      const result = resolveUniqueWorktreeName(badTicket, mockRepoRoot, true);
      expect(result).toBe("ACME-Project-123");
    });
  });

  describe("resolveLatestWorktreeName", () => {
    it("should return base name if no branches exist", () => {
      (execFileSync as any).mockReturnValue("");
      const result = resolveLatestWorktreeName(mockTicket, mockRepoRoot, false);
      expect(result).toBe("ralph/T-123");
    });

    it("should return base name if only base name exists", () => {
      (execFileSync as any).mockReturnValue("ralph/T-123\nother");
      const result = resolveLatestWorktreeName(mockTicket, mockRepoRoot, false);
      expect(result).toBe("ralph/T-123");
    });

    it("should return highest suffix if multiple exist", () => {
      (execFileSync as any).mockReturnValue("ralph/T-123\nralph/T-123-1\nralph/T-123-5");
      const result = resolveLatestWorktreeName(mockTicket, mockRepoRoot, false);
      expect(result).toBe("ralph/T-123-5");
    });

    it("should ignore non-numeric suffixes", () => {
      (execFileSync as any).mockReturnValue("ralph/T-123\nralph/T-123-foo\nralph/T-123-2");
      const result = resolveLatestWorktreeName(mockTicket, mockRepoRoot, false);
      expect(result).toBe("ralph/T-123-2");
    });

    it("should respect external ref naming", () => {
      (execFileSync as any).mockReturnValue("JIRA-999\nJIRA-999-3");
      const result = resolveLatestWorktreeName(mockTicket, mockRepoRoot, true);
      expect(result).toBe("JIRA-999-3");
    });
  });

  describe("provisionWorktree", () => {
    it("should return existing path if branch already checked out", () => {
      const branchName = "feature/test";
      const existingPath = "/tmp/repo/.ralph-worktrees/feature-test";

      // Mock git worktree list output
      const worktreeOutput = `worktree ${existingPath}
HEAD 123456
branch refs/heads/${branchName}

`;
      (execFileSync as any).mockReturnValue(worktreeOutput);

      const result = provisionWorktree(mockRepoRoot, branchName);

      expect(result).toBe(existingPath);
      // Should not call git worktree add
      expect(execFileSync).not.toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["worktree", "add"]),
        expect.anything(),
      );
    });

    it("should call git worktree add if not checked out", () => {
      const branchName = "feature/new";
      const expectedPath = path.join(mockRepoRoot, ".ralph-worktrees", "feature-new");

      // 1. Mock worktree list (empty or irrelevant)
      // 2. Mock branch list (branch does not exist, so create new)
      // We need to handle multiple calls to execFileSync with different args
      (execFileSync as any).mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("worktree") && args.includes("list")) {
          return ""; // No existing worktrees
        }
        if (args.includes("branch") && args.includes("--list")) {
          return ""; // Branch does not exist
        }
        if (args.includes("worktree") && args.includes("add")) {
          return ""; // Success
        }
        return "";
      });

      const result = provisionWorktree(mockRepoRoot, branchName);

      expect(result).toBe(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(mockRepoRoot, ".ralph-worktrees"), { recursive: true });

      // Should call git worktree add -b branchName path
      expect(execFileSync).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-b", branchName, expectedPath],
        expect.objectContaining({ cwd: mockRepoRoot }),
      );
    });

    it("should not use -b if branch exists but is not checked out", () => {
      const branchName = "feature/existing";
      const expectedPath = path.join(mockRepoRoot, ".ralph-worktrees", "feature-existing");

      (execFileSync as any).mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("worktree") && args.includes("list")) {
          return "";
        }
        if (args.includes("branch") && args.includes("--list")) {
          return "feature/existing"; // Branch exists
        }
        return "";
      });

      const result = provisionWorktree(mockRepoRoot, branchName);

      expect(result).toBe(expectedPath);

      // Should call git worktree add path branchName (no -b)
      expect(execFileSync).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", expectedPath, branchName],
        expect.objectContaining({ cwd: mockRepoRoot }),
      );
    });
  });
});
