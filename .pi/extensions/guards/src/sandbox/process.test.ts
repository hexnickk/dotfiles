import assert from "node:assert/strict";
import test from "node:test";

import { sandboxProcessSpawn } from "./process.ts";

// Builds the minimal prepared command needed to unit-test process exit handling.
// Input is JavaScript evaluated by the current Node binary. Output is a sandbox command shape. Side effects happen only when spawned by the test.
function createNodeCommand(script: string) {
  return {
    executable: process.execPath,
    args: ["-e", script],
    cwd: process.cwd(),
    env: process.env,
    cleanupPaths: [],
  };
}

test("sandboxProcessSpawn rejects child termination by signal", async () => {
  if (process.platform === "win32") return;

  await assert.rejects(
    sandboxProcessSpawn(createNodeCommand("process.kill(process.pid, 'SIGTERM')"), { onData: () => undefined }),
    /terminated by signal SIGTERM/,
  );
});
