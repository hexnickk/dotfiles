import assert from "node:assert/strict";
import test from "node:test";
import { createBashToolDefinition } from "@mariozechner/pi-coding-agent";

import { bashToolsCreateDangerousBashTool } from "./dangerous-bash.ts";

// Builds a mock bash definition factory that records host execution instead of spawning a shell.
// Inputs are an array for calls and optional output text. Output mimics createBashToolDefinition. Side effects: records calls when execute runs.
function createMockBashFactory(calls: Array<{ cwd: string; command: string }>, text = "ran") {
  const base = createBashToolDefinition(process.cwd());
  return ((cwd: string) => ({
    ...base,
    name: "bash",
    async execute(_toolCallId, params) {
      calls.push({ cwd, command: params.command });
      return { content: [{ type: "text" as const, text }], details: undefined };
    },
  })) as typeof createBashToolDefinition;
}

// Reads text from the first content item of a tool result.
// Input is unknown content from a tool result. Output is text content or empty string. Side effects: none.
function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content[0]?.type === "text" ? (result.content[0].text ?? "") : "";
}

// Creates the minimum context dangerous_bash needs for execution tests.
// Inputs configure UI presence and confirmation. Output is a fake ExtensionContext. Side effects: records confirmation prompts.
function createCtx(options: { hasUI: boolean; confirmResult?: boolean; cwd?: string }) {
  const confirmCalls: Array<{ title: string; message: string }> = [];
  return {
    confirmCalls,
    ctx: {
      cwd: options.cwd ?? "/workspace",
      hasUI: options.hasUI,
      ui: {
        async confirm(title: string, message: string) {
          confirmCalls.push({ title, message });
          return options.confirmResult ?? false;
        },
      },
    },
  };
}

test("dangerous_bash tool definition keeps its custom name after spreading bash", () => {
  const tool = bashToolsCreateDangerousBashTool({ createBashDefinition: createMockBashFactory([]) });

  assert.equal(tool.name, "dangerous_bash");
});

test("dangerous_bash prompts and delegates host bash only when confirmed", async () => {
  const calls: Array<{ cwd: string; command: string }> = [];
  const tool = bashToolsCreateDangerousBashTool({ createBashDefinition: createMockBashFactory(calls) });
  const { ctx, confirmCalls } = createCtx({ hasUI: true, confirmResult: true, cwd: "/tmp/project" });

  const result = await tool.execute("id", { command: "touch file" }, undefined, undefined, ctx as never);

  assert.deepEqual(confirmCalls, [{ title: "Run host command?", message: "touch file" }]);
  assert.deepEqual(calls, [{ cwd: "/tmp/project", command: "touch file" }]);
  assert.equal(result.content[0]?.type, "text");
  assert.equal(result.content[0]?.text, "ran");
});

test("dangerous_bash does not run host bash when the user declines", async () => {
  const calls: Array<{ cwd: string; command: string }> = [];
  const tool = bashToolsCreateDangerousBashTool({ createBashDefinition: createMockBashFactory(calls) });
  const { ctx } = createCtx({ hasUI: true, confirmResult: false });

  const result = await tool.execute("id", { command: "rm -rf dist" }, undefined, undefined, ctx as never);

  assert.deepEqual(calls, []);
  assert.match(firstText(result), /blocked by user/);
  assert.equal(result.details, undefined);
});

test("dangerous_bash returns a clear result without running when no UI is available", async () => {
  const calls: Array<{ cwd: string; command: string }> = [];
  const tool = bashToolsCreateDangerousBashTool({ createBashDefinition: createMockBashFactory(calls) });
  const { ctx } = createCtx({ hasUI: false });

  const result = await tool.execute("id", { command: "make install" }, undefined, undefined, ctx as never);

  assert.deepEqual(calls, []);
  assert.match(firstText(result), /requires interactive confirmation/);
  assert.equal(result.details, undefined);
});
