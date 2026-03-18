import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { findEntityByDisplayId, openWorkspaceStorage } from "../../pi-storage/storage/workspace.js";
import { handleConstitutionCommand } from "../extensions/commands/constitution.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-constitution-commands-"));
  process.env.PI_LOOM_ROOT = path.join(cwd, ".pi-loom-test");
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      fs.rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function createContext(cwd: string): ExtensionCommandContext {
  return { cwd } as unknown as ExtensionCommandContext;
}

describe("/constitution command handler", () => {
  it("initializes, incrementally populates, links roadmap items, records decisions, and returns the brief", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ctx = createContext(cwd);

      const initialized = await handleConstitutionCommand("init", ctx);
      expect(initialized).toContain("catalog.sqlite");
      const { storage, identity } = await openWorkspaceStorage(cwd);
      const constitutionEntity = await findEntityByDisplayId(storage, identity.space.id, "constitution", "constitution");
      expect(constitutionEntity).toBeTruthy();

      const vision = await handleConstitutionCommand(
        "update vision Establish durable project intent :: Ground agents with governing context before roadmap-scale planning",
        ctx,
      );
      expect(vision).toContain("Vision complete: yes");

      const principles = await handleConstitutionCommand(
        "update principles Truthful interfaces | Downstream layers must learn what actually happened | Hidden failure becomes strategic drift",
        ctx,
      );
      expect(principles).toContain("Principles: 1");

      const constraints = await handleConstitutionCommand(
        "update constraints Repo-visible durability | Governing context must survive chat turnover | Durable files are the system of record",
        ctx,
      );
      expect(constraints).toContain("Constraints: 1");

      const roadmap = await handleConstitutionCommand(
        "update roadmap Add constitutional memory as a first-class layer :: package scaffold, prompt loading :: finalize dashboard",
        ctx,
      );
      expect(roadmap).toContain("Roadmap items: 0");

      const item = await handleConstitutionCommand(
        "roadmap add Ship constitutional memory :: Add the package, tools, and compiled brief :: Strategic grounding must be durable :: now :: active",
        ctx,
      );
      expect(item).toContain("Roadmap items: 1");

      const linked = await handleConstitutionCommand("link-initiative item-001 constitutional-foundation", ctx);
      expect(linked).toContain("Initiatives linked: 1");

      const decision = await handleConstitutionCommand(
        "decision roadmap_update Should roadmap items stay separate from stable principles :: Yes, mutable sequencing should not rewrite durable identity :: roadmap.md,brief.md",
        ctx,
      );
      expect(decision).toContain("Open questions:");

      const roadmapShow = await handleConstitutionCommand("roadmap show item-001", ctx);
      expect(roadmapShow).toContain("item-001 [now/active] Ship constitutional memory");
      expect(roadmapShow).toContain("constitutional-foundation");

      const brief = await handleConstitutionCommand("brief", ctx);
      expect(brief).toContain("Constitutional Brief");
      expect(brief).toContain("Truthful interfaces");
      expect(brief).toContain("Ship constitutional memory");
    } finally {
      cleanup();
    }
  }, 15000);
});

