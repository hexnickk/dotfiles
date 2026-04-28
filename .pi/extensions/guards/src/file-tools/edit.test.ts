import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@mariozechner/pi-coding-agent";

import { fileToolsCreateEditTool } from "./edit.ts";

initTheme(undefined, false);

const fakeTheme = {
  bold(text: string) {
    return text;
  },
  fg(_color: string, text: string) {
    return text;
  },
};

test("guarded edit call renderer does not delegate to built-in diff preview", () => {
  let baseRenderCalled = false;
  const tool = createTestEditTool({
    renderCall() {
      baseRenderCalled = true;
      throw new Error("base edit renderCall should not run");
    },
  });

  const component = tool.renderCall!(
    { path: "src/file.ts", edits: [{ oldText: "secret old", newText: "secret new" }] },
    fakeTheme as never,
    { lastComponent: undefined } as never,
  );

  assert.equal(baseRenderCalled, false);
  const output = component.render(80).join("\n");
  assert.match(output, /edit src\/file\.ts/);
  assert.doesNotMatch(output, /secret/);
});

test("guarded edit result renderer shows the final diff instead of success text", () => {
  const tool = createTestEditTool();

  const component = tool.renderResult!(
    {
      content: [{ type: "text" as const, text: "Successfully replaced 1 block(s)." }],
      details: { diff: "-1 old value\n+1 new value" },
    },
    { expanded: false, isPartial: false },
    fakeTheme as never,
    { args: { path: "src/file.ts" }, isError: false, lastComponent: undefined } as never,
  );

  const output = component.render(120).join("\n");
  assert.match(output, /old value/);
  assert.match(output, /new value/);
  assert.doesNotMatch(output, /Successfully replaced/);
});

test("guarded edit execute returns diff text for non-renderer fallback output", async () => {
  const tool = createTestEditTool({
    async execute() {
      return {
        content: [{ type: "text" as const, text: "Successfully replaced 1 block(s)." }],
        details: { diff: "-1 old value\n+1 new value" },
      };
    },
  });

  const result = await tool.execute(
    "tool-call-id",
    { path: "src/file.ts", edits: [{ oldText: "old value", newText: "new value" }] },
    undefined,
    undefined,
    { cwd: process.cwd(), hasUI: false } as never,
  );

  assert.deepEqual(result.content, [{ type: "text", text: "-1 old value\n+1 new value" }]);
});

function createTestEditTool(baseOverrides: Record<string, unknown> = {}) {
  return fileToolsCreateEditTool({
    createEditDefinition: (() => ({
      name: "edit",
      label: "edit",
      description: "Edit a file.",
      promptGuidelines: [],
      parameters: {} as never,
      async execute() {
        return { content: [{ type: "text" as const, text: "ok" }], details: undefined };
      },
      ...baseOverrides,
    })) as never,
  });
}
