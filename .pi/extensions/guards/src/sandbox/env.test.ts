import assert from "node:assert/strict";
import test from "node:test";

import { sandboxBuildEnv } from "./env.ts";

test("sandboxBuildEnv preserves the user env while redirecting temp and cache writes", () => {
  const env = sandboxBuildEnv("/tmp/sandbox", {
    PATH: "/bin",
    HOME: "/home/user",
    USER: "hex",
    LOGNAME: "hexlog",
    SHELL: "/bin/zsh",
    TERM: "xterm",
    AWS_SECRET_ACCESS_KEY: "secret",
    ANTHROPIC_API_KEY: "secret",
    TMPDIR: "/host/tmp",
  });

  assert.equal(env.AWS_SECRET_ACCESS_KEY, "secret");
  assert.equal(env.ANTHROPIC_API_KEY, "secret");
  assert.equal(env.GIT_OPTIONAL_LOCKS, "0");
  assert.equal(env.HOME, "/home/user");
  assert.equal(env.SHELL, "/bin/zsh");
  assert.equal(env.TMPDIR, "/tmp/sandbox");
  assert.equal(env.TMP, "/tmp/sandbox");
  assert.equal(env.TEMP, "/tmp/sandbox");
  assert.equal(env.XDG_CACHE_HOME, "/tmp/sandbox/xdg-cache");
});
