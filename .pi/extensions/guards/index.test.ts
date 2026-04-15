import assert from "node:assert/strict";
import test from "node:test";

import guards from "./index.ts";

type EventHandler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

// Creates a tiny extension harness for testing the public guards wiring.
function createTestHarness(yoloEnabled: boolean) {
  const handlers = new Map<string, EventHandler>();
  const notifications: Array<{ message: string; level: string }> = [];

  const pi = {
    getFlag(name: string) {
      return name === "yolo" ? yoloEnabled : undefined;
    },
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
    registerFlag() {
      return undefined;
    },
  };

  guards(pi as never);

  return {
    notifications,
    async runSessionStart(hasUI: boolean) {
      const handler = handlers.get("session_start");
      assert.ok(handler !== undefined);
      await handler?.({}, {
        hasUI,
        ui: {
          notify(message: string, level: string) {
            notifications.push({ message, level });
          },
        },
      });
    },
    async runToolCall(command: string, options?: { confirmResult?: boolean; hasUI?: boolean; toolName?: string }) {
      const confirmCalls: Array<{ title: string; body: string }> = [];
      const handler = handlers.get("tool_call");
      assert.ok(handler !== undefined);

      const result = await handler?.(
        { toolName: options?.toolName ?? "bash", input: { command } },
        {
          hasUI: options?.hasUI ?? false,
          ui: {
            async confirm(title: string, body: string) {
              confirmCalls.push({ title, body });
              return options?.confirmResult ?? false;
            },
          },
        },
      );

      return { confirmCalls, result };
    },
  };
}

test("guards blocks unsafe bash commands without UI", async () => {
  const harness = createTestHarness(false);
  const { result } = await harness.runToolCall("git status");

  assert.deepEqual(result, {
    block: true,
    reason: "Command git is not in the strict auto-allow list",
  });
});

test("guards prompts before unsafe interactive bash commands", async () => {
  const harness = createTestHarness(false);
  const { confirmCalls, result } = await harness.runToolCall("git status", { hasUI: true, confirmResult: false });

  assert.equal(confirmCalls.length, 1);
  assert.equal(confirmCalls[0]?.body, "git status");
  assert.deepEqual(result, { block: true, reason: "Blocked by user" });
});

test("guards skips prompts for safe bash commands", async () => {
  const harness = createTestHarness(false);
  const { confirmCalls, result } = await harness.runToolCall("pwd", { hasUI: true });

  assert.equal(confirmCalls.length, 0);
  assert.equal(result, undefined);
});

test("guards enables yolo mode after session start and notifies interactive users", async () => {
  const harness = createTestHarness(true);

  await harness.runSessionStart(true);
  const { confirmCalls, result } = await harness.runToolCall("git status", { hasUI: true, confirmResult: false });

  assert.deepEqual(harness.notifications, [{ message: "⚠️ Yolo mode is enabled", level: "warning" }]);
  assert.equal(confirmCalls.length, 0);
  assert.equal(result, undefined);
});
