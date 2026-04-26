import assert from "node:assert/strict";
import test from "node:test";

import { sandboxBuildLinuxCommand } from "./linux.ts";

// Returns all positions of an argument in argv.
// Input is argv and a value to search for. Output is indexes where it appears. Side effects: none.
function indexesOf(args: string[], value: string): number[] {
  return args.flatMap((arg, index) => (arg === value ? [index] : []));
}

test("linux sandbox builder read-only binds host root and keeps network enabled", () => {
  const command = sandboxBuildLinuxCommand({ command: "pwd", cwd: "/work", sandboxTemp: "/tmp/pi-guards-test" });

  const roBindIndex = command.args.indexOf("--ro-bind");
  assert.equal(command.args[roBindIndex + 1], "/");
  assert.equal(command.args[roBindIndex + 2], "/");
  assert.equal(command.args.includes("--unshare-net"), false);
});

test("linux sandbox builder includes writable tmpfs mounts and temp/cache env", () => {
  const command = sandboxBuildLinuxCommand({ command: "pwd", cwd: "/work", sandboxTemp: "/tmp/pi-guards-test" });

  for (const mount of ["/tmp", "/run", "/var/run"]) {
    const tmpfsIndexes = indexesOf(command.args, "--tmpfs");
    assert.equal(tmpfsIndexes.some((index) => command.args[index + 1] === mount), true, mount);
  }

  assert.equal(command.env.TMPDIR, "/tmp/pi-guards-test");
  assert.equal(command.env.XDG_CACHE_HOME, "/tmp/pi-guards-test/xdg-cache");
  assert.equal(command.env.npm_config_cache, "/tmp/pi-guards-test/npm-cache");
  assert.equal(command.args.includes("--setenv"), true);
});
