import assert from "node:assert/strict";
import test from "node:test";
import { createBashToolDefinition } from "@mariozechner/pi-coding-agent";

import { bashToolsCreateSandboxBashTool } from "./sandbox-bash.ts";

test("sandbox_bash tool definition keeps its custom name after spreading bash", () => {
  const tool = bashToolsCreateSandboxBashTool({ createBashDefinition: createBashToolDefinition });

  assert.equal(tool.name, "sandbox_bash");
});
