import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SandboxDependencyMissingError,
  SandboxInvalidWorkingDirectoryError,
  SandboxPreparationError,
  SandboxSetupError,
  SandboxUnsupportedPlatformError,
} from "./errors.ts";
import { sandboxLinuxBubblewrapManualGuidance, sandboxFindOnPath } from "./install-linux.ts";
import { sandboxBuildLinuxCommand } from "./linux.ts";
import { sandboxBuildMacosCommand, sandboxBuildMacosProfile } from "./macos.ts";
import { sandboxProcessSpawn } from "./process.ts";
import type { SandboxCommand, SandboxPlatform } from "./types.ts";

export type SandboxExecDeps = {
  platform?: SandboxPlatform;
  findOnPath?: (command: string) => Promise<string | undefined>;
  macosSandboxExecPath?: string;
  envSource?: NodeJS.ProcessEnv;
};

export type SandboxExecOptions = {
  onData: (data: Buffer) => void;
  signal?: AbortSignal;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
};

export type SandboxExecResult = {
  exitCode: number | null;
};

// Executes a shell command through the host OS sandbox for the current platform.
// Inputs are the command, cwd, stream/cancel options, and optional dependency overrides. Output is the exit code. Side effects: starts/kills sandboxed processes and creates/removes temp files.
export async function sandboxExec(
  command: string,
  cwd: string,
  options: SandboxExecOptions,
  deps: SandboxExecDeps = {},
): Promise<SandboxExecResult> {
  const prepared = await sandboxPrepareCommand(command, cwd, { ...deps, envSource: options.env ?? deps.envSource });
  if (prepared instanceof SandboxSetupError) {
    // Executor callers need rejected promises for command setup failures; helpers return typed errors until this boundary.
    throw prepared;
  }

  return sandboxProcessSpawn(prepared, options);
}

// Prepares a platform-specific sandbox command without ever falling back to host execution.
// Inputs are the shell command, cwd, and dependency overrides. Output is a spawn-ready command or typed setup error. Side effects: temp/profile creation.
export async function sandboxPrepareCommand(
  command: string,
  cwd: string,
  deps: SandboxExecDeps = {},
): Promise<SandboxCommand | SandboxSetupError> {
  if (!(await pathExists(cwd))) return new SandboxInvalidWorkingDirectoryError(cwd);

  const platform = deps.platform ?? process.platform;
  if (platform === "linux") return prepareLinuxCommand(command, cwd, deps);
  if (platform === "darwin") return prepareMacosCommand(command, cwd, deps);
  return new SandboxUnsupportedPlatformError(platform);
}

// Prepares a Linux bubblewrap command after checking bwrap availability.
// Inputs are command/cwd/deps. Output is a SandboxCommand or missing-dependency error. Side effects: PATH lookup only.
async function prepareLinuxCommand(
  command: string,
  cwd: string,
  deps: SandboxExecDeps,
): Promise<SandboxCommand | SandboxSetupError> {
  const bwrapPath = deps.findOnPath
    ? await deps.findOnPath("bwrap")
    : await sandboxFindOnPath("bwrap", deps.envSource);
  if (!bwrapPath) return new SandboxDependencyMissingError("bubblewrap", sandboxLinuxBubblewrapManualGuidance());

  return sandboxBuildLinuxCommand({
    command,
    cwd,
    bwrapPath,
    envSource: deps.envSource,
    sandboxTemp: `/tmp/pi-guards-${process.pid}-${randomBytes(6).toString("hex")}`,
  });
}

// Prepares a macOS sandbox-exec command and writes its per-command profile.
// Inputs are command/cwd/deps. Output is a SandboxCommand or setup error. Side effects: creates a temp dir and profile file.
async function prepareMacosCommand(
  command: string,
  cwd: string,
  deps: SandboxExecDeps,
): Promise<SandboxCommand | SandboxSetupError> {
  const sandboxExecPath = deps.macosSandboxExecPath ?? "/usr/bin/sandbox-exec";
  if (!(await canExecute(sandboxExecPath))) {
    return new SandboxDependencyMissingError(
      "/usr/bin/sandbox-exec",
      "macOS sandbox-exec is unavailable; sandbox_bash cannot run safely.",
    );
  }

  let tempDir: string | undefined;
  try {
    tempDir = await mkdtemp(join(tmpdir(), "pi-guards-sandbox-"));
    tempDir = await realpath(tempDir);
    await mkdir(join(tempDir, "xdg-cache"), { recursive: true });
    await mkdir(join(tempDir, "npm-cache"), { recursive: true });
    await mkdir(join(tempDir, "pip-cache"), { recursive: true });
    const profilePath = join(tempDir, "profile.sb");
    await writeFile(profilePath, sandboxBuildMacosProfile(tempDir), "utf8");

    return sandboxBuildMacosCommand({
      command,
      cwd,
      envSource: deps.envSource,
      sandboxTemp: tempDir,
      profilePath,
      sandboxExecPath,
    });
  } catch (error) {
    if (tempDir) await rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
    return new SandboxPreparationError("macOS sandbox profile setup", error);
  }
}

// Checks path existence/accessibility.
// Input is a path. Output is true if accessible. Side effects: filesystem access check only.
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Checks executable access for platform dependencies.
// Input is an executable path. Output is true if executable. Side effects: filesystem access check only.
async function canExecute(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
