import assert from "node:assert/strict";
import test from "node:test";

import { sandboxBuildEnv } from "./env.ts";

test("sandboxBuildEnv forwards only explicit safe variables", () => {
  const env = sandboxBuildEnv("/tmp/sandbox", {
    PATH: "/bin",
    HOME: "/home/user",
    USER: "hex",
    LOGNAME: "hexlog",
    SHELL: "/bin/zsh",
    TERM: "xterm",
    AWS_SECRET_ACCESS_KEY: "secret",
    ANTHROPIC_API_KEY: "secret",
  });

  assert.deepEqual(Object.keys(env).sort(), [
    "HOME",
    "LOGNAME",
    "PATH",
    "PIP_CACHE_DIR",
    "SHELL",
    "TERM",
    "TMPDIR",
    "USER",
    "XDG_CACHE_HOME",
    "npm_config_cache",
  ]);
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.HOME, "/tmp/sandbox");
  assert.equal(env.SHELL, "/bin/bash");
  assert.equal(env.TMPDIR, "/tmp/sandbox");
  assert.equal(env.XDG_CACHE_HOME, "/tmp/sandbox/xdg-cache");
});
