import assert from "node:assert/strict";
import test from "node:test";

import { SandboxDependencyMissingError, SandboxUnsupportedPlatformError } from "./errors.ts";
import { sandboxPrepareCommand } from "./operations.ts";

test("linux sandbox preparation uses provided environment source", async () => {
  const result = await sandboxPrepareCommand("pwd", process.cwd(), {
    platform: "linux",
    findOnPath: async () => "/usr/bin/bwrap",
    envSource: { PATH: "/custom/bin", HOME: "/host/home", USER: "hex" },
  });

  if (result instanceof Error) assert.fail(result.message);
  assert.equal(result.env.PATH, "/custom/bin");
  assert.equal(result.env.HOME, "/host/home");
  assert.equal(result.env.USER, "hex");
});

test("linux sandbox preparation fails closed when bubblewrap is missing", async () => {
  const result = await sandboxPrepareCommand("pwd", process.cwd(), {
    platform: "linux",
    findOnPath: async () => undefined,
  });

  assert.equal(result instanceof SandboxDependencyMissingError, true);
});

test("sandbox preparation rejects unsupported platforms", async () => {
  const result = await sandboxPrepareCommand("pwd", process.cwd(), { platform: "win32" });

  assert.equal(result instanceof SandboxUnsupportedPlatformError, true);
});
