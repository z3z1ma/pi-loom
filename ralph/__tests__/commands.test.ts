import { describe, expect, it } from "vitest";
import { handleRalphCommand } from "../commands/ralph.js";

describe("/ralph command module", () => {
  it("loads the command handler", () => {
    expect(typeof handleRalphCommand).toBe("function");
  });
});
