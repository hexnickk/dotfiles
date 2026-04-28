import assert from "node:assert/strict";
import test from "node:test";

import { sandboxBuildLinuxCommand } from "./linux.ts";

// Returns all positions of an argument in argv.
// Input is argv and a value to search for. Output is indexes where it appears. Side effects: none.
function indexesOf(args: string[], value: string): number[] {
  return args.flatMap((arg, index) => (arg === value ? [index] : []));
}

test("linux sandbox builder binds the host root read-only and keeps network enabled", () => {
  const command = sandboxBuildLinuxCommand({
    command: "pwd",
    cwd: "/work",
    sandboxTemp: "/tmp/pi-guards-test",
  });

  const roBindIndexes = indexesOf(command.args, "--ro-bind");
  const boundSources = roBindIndexes.map((index) => command.args[index + 1]);
  const tmpfsTargets = indexesOf(command.args, "--tmpfs").map((index) => command.args[index + 1]);
  assert.deepEqual(boundSources, ["/"]);
  assert.equal(command.args.includes("--unshare-net"), false);
  assert.equal(tmpfsTargets.includes("/run"), false);
  assert.equal(tmpfsTargets.includes("/var/run"), false);
});

test("linux sandbox builder binds tmp workspaces after mounting sandbox tmpfs", () => {
  const command = sandboxBuildLinuxCommand({
    command: "pwd",
    cwd: "/tmp/workspace",
    sandboxTemp: "/tmp/pi-guards-test",
  });

  const tmpfsTmpIndex = indexesOf(command.args, "--tmpfs").find((index) => command.args[index + 1] === "/tmp");
  const roBindIndexes = indexesOf(command.args, "--ro-bind");
  const hostTmpBindIndex = roBindIndexes.find((index) => command.args[index + 1] === "/tmp");
  const workspaceBindIndex = roBindIndexes.find((index) => command.args[index + 1] === "/tmp/workspace");

  assert.equal(hostTmpBindIndex, undefined);
  assert.equal(typeof tmpfsTmpIndex, "number");
  assert.equal(typeof workspaceBindIndex, "number");
  assert.ok(workspaceBindIndex! > tmpfsTmpIndex!);
});

test("linux sandbox builder includes writable temp storage and temp/cache env", () => {
  const command = sandboxBuildLinuxCommand({ command: "pwd", cwd: "/work", sandboxTemp: "/tmp/pi-guards-test" });

  const tmpfsIndexes = indexesOf(command.args, "--tmpfs");
  assert.equal(tmpfsIndexes.some((index) => command.args[index + 1] === "/tmp"), true);

  assert.equal(command.env.TMPDIR, "/tmp/pi-guards-test");
  assert.equal(command.env.XDG_CACHE_HOME, "/tmp/pi-guards-test/xdg-cache");
  assert.equal(command.env.npm_config_cache, "/tmp/pi-guards-test/npm-cache");
  assert.equal(command.args.includes("--setenv"), true);
});
