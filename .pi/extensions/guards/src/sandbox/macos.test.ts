import assert from "node:assert/strict";
import test from "node:test";

import { sandboxBuildMacosCommand, sandboxBuildMacosProfile } from "./macos.ts";

test("macOS profile allows reads and network while restricting writes", () => {
  const profile = sandboxBuildMacosProfile("/private/var/tmp/pi guards");

  assert.match(profile, /\(deny default\)/);
  assert.match(profile, /\(allow file-read\*\)/);
  assert.match(profile, /\(allow network\*\)/);
  assert.match(profile, /\(allow process\*\)/);
  assert.match(profile, /\(allow file-write\*/);
  assert.match(profile, /\(subpath "\/private\/var\/tmp\/pi guards"\)/);
  assert.match(profile, /\(literal "\/dev\/null"\)/);
  assert.doesNotMatch(profile, /file-write\*[\s\S]*\/Users\/hexnickk/);
});

test("macOS command builder uses sandbox-exec and explicit environment", () => {
  const command = sandboxBuildMacosCommand({
    command: "pwd",
    cwd: "/work",
    profilePath: "/tmp/profile.sb",
    sandboxTemp: "/tmp/sandbox",
    envSource: { PATH: "/bin", SECRET_TOKEN: "nope" },
    sandboxExecPath: "/custom/sandbox-exec",
  });

  assert.equal(command.executable, "/custom/sandbox-exec");
  assert.deepEqual(command.args, ["-f", "/tmp/profile.sb", "/bin/bash", "-c", "pwd"]);
  assert.equal(command.cwd, "/work");
  assert.equal(command.env.SECRET_TOKEN, undefined);
  assert.equal(command.env.TMPDIR, "/tmp/sandbox");
});
