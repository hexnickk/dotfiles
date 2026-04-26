import assert from "node:assert/strict";
import test from "node:test";

import {
  sandboxBuildLinuxInstallCommand,
  sandboxDetectLinuxInstallCommand,
  sandboxDetectLinuxPackageManager,
  sandboxLinuxBubblewrapManualGuidance,
} from "./install-linux.ts";

// Creates a command availability callback from a set of command names.
// Input is supported command names. Output is a mock callback. Side effects: none.
function hasCommands(...commands: string[]) {
  const set = new Set(commands);
  return (command: string) => set.has(command);
}

test("detects supported Linux package managers in priority order", async () => {
  assert.equal(await sandboxDetectLinuxPackageManager(hasCommands("dnf", "apt-get")), "apt-get");
  assert.equal(await sandboxDetectLinuxPackageManager(hasCommands("pacman")), "pacman");
  assert.equal(await sandboxDetectLinuxPackageManager(hasCommands("brew")), "brew");
  assert.equal(await sandboxDetectLinuxPackageManager(hasCommands()), undefined);
});

test("builds non-interactive sudo install commands when not root", () => {
  assert.deepEqual(sandboxBuildLinuxInstallCommand("apt-get", false), {
    manager: "apt-get",
    command: "sudo",
    args: ["-n", "apt-get", "install", "-y", "bubblewrap"],
    display: "sudo -n apt-get install -y bubblewrap",
  });
  assert.deepEqual(sandboxBuildLinuxInstallCommand("pacman", false).args, [
    "-n",
    "pacman",
    "-S",
    "--needed",
    "--noconfirm",
    "bubblewrap",
  ]);
});

test("omits sudo for root users and Homebrew", () => {
  assert.deepEqual(sandboxBuildLinuxInstallCommand("dnf", true), {
    manager: "dnf",
    command: "dnf",
    args: ["install", "-y", "bubblewrap"],
    display: "dnf install -y bubblewrap",
  });
  assert.deepEqual(sandboxBuildLinuxInstallCommand("brew", false), {
    manager: "brew",
    command: "brew",
    args: ["install", "bubblewrap"],
    display: "brew install bubblewrap",
  });
});

test("detects install command from mocked command availability", async () => {
  const command = await sandboxDetectLinuxInstallCommand({ hasCommand: hasCommands("zypper"), isRoot: false });

  assert.equal(command?.display, "sudo -n zypper install -y bubblewrap");
});

test("returns manual guidance when no package manager is detected", async () => {
  const command = await sandboxDetectLinuxInstallCommand({ hasCommand: hasCommands(), isRoot: false });
  const guidance = sandboxLinuxBubblewrapManualGuidance(command);

  assert.equal(command, undefined);
  assert.match(guidance, /Ubuntu\/Debian/);
  assert.match(guidance, /brew install bubblewrap/);
});
