import assert from "node:assert/strict";
import test from "node:test";

import { guardsRegister, guardsReplaceActiveBashTools } from "./index.ts";

type EventHandler = (event: any, ctx: any) => Promise<unknown> | unknown;

type HarnessOptions = {
  activeTools?: string[];
  allowedTools?: string[];
  ensureLinuxBubblewrap?: () => Promise<void>;
  platform?: NodeJS.Platform;
  yoloEnabled?: boolean;
};

// Creates a tiny extension harness for testing public guards wiring.
// Inputs are initial flags/tools. Output exposes handlers and captured side effects. Side effects: registers the extension under test.
function createTestHarness(options: HarnessOptions = {}) {
  const handlers = new Map<string, EventHandler>();
  const registeredTools: string[] = [];
  const notifications: Array<{ message: string; level: string }> = [];
  let activeTools = [...(options.activeTools ?? ["read", "bash", "edit", "write"])];
  const allowedTools = options.allowedTools ? new Set(options.allowedTools) : undefined;
  const yoloEnabled = options.yoloEnabled ?? false;

  const pi = {
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
    getActiveTools() {
      return [...activeTools];
    },
    getFlag(name: string) {
      return name === "yolo" ? yoloEnabled : undefined;
    },
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
    registerFlag() {
      return undefined;
    },
    registerTool(tool: { name: string }) {
      registeredTools.push(tool.name);
    },
    setActiveTools(next: string[]) {
      activeTools = allowedTools ? next.filter((tool) => allowedTools.has(tool)) : [...next];
    },
  };

  guardsRegister(pi as never, {
    ensureLinuxBubblewrap: options.ensureLinuxBubblewrap,
    platform: options.platform ?? "darwin",
  });

  const ctx = {
    cwd: process.cwd(),
    hasUI: true,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };

  return {
    get activeTools() {
      return activeTools;
    },
    notifications,
    registeredTools,
    async runBeforeAgentStart(systemPrompt = "base prompt") {
      const handler = handlers.get("before_agent_start");
      assert.ok(handler);
      return handler({ systemPrompt }, ctx);
    },
    async runSessionStart() {
      const handler = handlers.get("session_start");
      assert.ok(handler);
      await handler({}, ctx);
    },
    async runToolCall(toolName = "bash") {
      const handler = handlers.get("tool_call");
      assert.ok(handler);
      return handler({ toolName, input: { command: "pwd" } }, ctx);
    },
  };
}

test("guardsReplaceActiveBashTools swaps built-in bash for sandbox and dangerous bash", () => {
  assert.deepEqual(guardsReplaceActiveBashTools(["read", "bash", "edit"]), [
    "read",
    "sandbox_bash",
    "dangerous_bash",
    "edit",
  ]);
});

test("guardsReplaceActiveBashTools restores guard bash for mutable default-like tool sets", () => {
  assert.deepEqual(guardsReplaceActiveBashTools(["read", "edit", "write"]), [
    "read",
    "edit",
    "write",
    "sandbox_bash",
    "dangerous_bash",
  ]);
});

test("guardsReplaceActiveBashTools leaves read-only tool sets without bash unchanged", () => {
  assert.deepEqual(guardsReplaceActiveBashTools(["read", "grep", "find", "ls"]), ["read", "grep", "find", "ls"]);
});

test("default session with active bash replaces it and enables guarded remove for mutations", async () => {
  const harness = createTestHarness({ activeTools: ["read", "bash", "write"] });

  await harness.runSessionStart();

  assert.deepEqual(harness.registeredTools, ["write", "edit", "remove", "sandbox_bash", "dangerous_bash"]);
  assert.deepEqual(harness.activeTools, ["read", "sandbox_bash", "dangerous_bash", "write", "remove"]);
});

test("default session with mutable tools but missing bash restores guard bash tools", async () => {
  const harness = createTestHarness({ activeTools: ["read", "edit", "write"] });

  await harness.runSessionStart();

  assert.deepEqual(harness.registeredTools, ["write", "edit", "remove", "sandbox_bash", "dangerous_bash"]);
  assert.deepEqual(harness.activeTools, ["read", "edit", "write", "sandbox_bash", "dangerous_bash", "remove"]);
});

test("read-only session without active bash does not force-add guard bash tools", async () => {
  const harness = createTestHarness({ activeTools: ["read", "grep", "find", "ls"] });

  await harness.runSessionStart();

  assert.deepEqual(harness.registeredTools, ["write", "edit", "remove", "sandbox_bash", "dangerous_bash"]);
  assert.deepEqual(harness.activeTools, ["read", "grep", "find", "ls"]);
});

test("default session preserves explicitly active guard bash tools and adds the missing pair", async () => {
  const harness = createTestHarness({ activeTools: ["read", "sandbox_bash"] });

  await harness.runSessionStart();

  assert.deepEqual(harness.activeTools, ["read", "sandbox_bash", "dangerous_bash"]);
});

test("Linux default session with active bash checks bubblewrap setup", async () => {
  let ensureCalls = 0;
  const harness = createTestHarness({
    activeTools: ["read", "bash"],
    ensureLinuxBubblewrap: async () => {
      ensureCalls += 1;
    },
    platform: "linux",
  });

  await harness.runSessionStart();

  assert.equal(ensureCalls, 1);
});

test("Linux mutable session with restored guard bash checks bubblewrap setup", async () => {
  let ensureCalls = 0;
  const harness = createTestHarness({
    activeTools: ["read", "edit", "write"],
    ensureLinuxBubblewrap: async () => {
      ensureCalls += 1;
    },
    platform: "linux",
  });

  await harness.runSessionStart();

  assert.equal(ensureCalls, 1);
});

test("Linux default session without active bash skips bubblewrap setup", async () => {
  let ensureCalls = 0;
  const harness = createTestHarness({
    activeTools: ["read"],
    ensureLinuxBubblewrap: async () => {
      ensureCalls += 1;
    },
    platform: "linux",
  });

  await harness.runSessionStart();

  assert.equal(ensureCalls, 0);
});

test("yolo session leaves active tools unchanged and does not register replacements", async () => {
  let ensureCalls = 0;
  const harness = createTestHarness({
    activeTools: ["read", "bash"],
    ensureLinuxBubblewrap: async () => {
      ensureCalls += 1;
    },
    platform: "linux",
    yoloEnabled: true,
  });

  await harness.runSessionStart();

  assert.equal(ensureCalls, 0);
  assert.deepEqual(harness.activeTools, ["read", "bash"]);
  assert.deepEqual(harness.registeredTools, []);
  assert.deepEqual(harness.notifications, [{ message: "⚠️ Yolo mode is enabled", level: "warning" }]);
});

test("default fallback guard blocks stale built-in bash tool calls", async () => {
  const harness = createTestHarness();

  await harness.runSessionStart();
  const result = await harness.runToolCall("bash");

  assert.deepEqual(result, {
    block: true,
    reason: "Use sandbox_bash for sandboxed commands or dangerous_bash for confirmed host commands.",
  });
});

test("yolo mode does not block built-in bash tool calls", async () => {
  const harness = createTestHarness({ yoloEnabled: true });

  await harness.runSessionStart();
  const result = await harness.runToolCall("bash");

  assert.equal(result, undefined);
});

test("default before_agent_start adds concise bash tool guidance", async () => {
  const harness = createTestHarness();

  await harness.runSessionStart();
  const result = await harness.runBeforeAgentStart("base");

  assert.match((result as { systemPrompt: string }).systemPrompt, /use sandbox_bash for normal shell commands/);
  assert.match((result as { systemPrompt: string }).systemPrompt, /write, edit, and remove/);
  assert.match((result as { systemPrompt: string }).systemPrompt, /outside workspace paths require interactive session confirmation/);
  assert.match((result as { systemPrompt: string }).systemPrompt, /^base/);
});

test("read-only before_agent_start omits guard guidance without active guard tools", async () => {
  const harness = createTestHarness({ activeTools: ["read", "grep", "find", "ls"] });

  await harness.runSessionStart();
  const result = await harness.runBeforeAgentStart("base");

  assert.equal(result, undefined);
});

test("default before_agent_start omits guidance when guard tools cannot be activated", async () => {
  const harness = createTestHarness({ activeTools: ["read", "bash"], allowedTools: [] });

  await harness.runSessionStart();
  const result = await harness.runBeforeAgentStart("base");

  assert.deepEqual(harness.activeTools, []);
  assert.equal(result, undefined);
});

test("yolo before_agent_start leaves the prompt unchanged", async () => {
  const harness = createTestHarness({ yoloEnabled: true });

  await harness.runSessionStart();
  const result = await harness.runBeforeAgentStart("base");

  assert.equal(result, undefined);
});
