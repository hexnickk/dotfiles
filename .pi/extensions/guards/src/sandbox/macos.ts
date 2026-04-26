import { sandboxBuildEnv } from "./env.ts";
import type { SandboxCommand } from "./types.ts";

export type SandboxMacosCommandInput = {
  command: string;
  cwd: string;
  sandboxTemp: string;
  profilePath: string;
  envSource?: NodeJS.ProcessEnv;
  sandboxExecPath?: string;
};

// Builds a macOS Seatbelt profile for sandboxed bash execution.
// Input is the real writable sandbox temp directory. Output is profile source text. Side effects: none.
export function sandboxBuildMacosProfile(sandboxTemp: string): string {
  const escapedTemp = sandboxEscapeSeatbeltString(sandboxTemp.replace(/\/+$/, ""));

  return [
    "(version 1)",
    "(deny default)",
    "",
    "(allow process*)",
    "(allow network*)",
    "(allow file-read*)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "",
    "(allow file-write*",
    `  (subpath \"${escapedTemp}\")`,
    "  (literal \"/dev/null\"))",
    "",
  ].join("\n");
}

// Builds a sandbox-exec invocation for sandboxed bash execution on macOS.
// Inputs are the shell command, cwd, writable temp root, generated profile path, and env source.
// Output is a spawn-ready command that reads host files broadly but writes only under sandboxTemp. Side effects: none.
export function sandboxBuildMacosCommand(input: SandboxMacosCommandInput): SandboxCommand {
  const sandboxTemp = input.sandboxTemp.replace(/\/+$/, "");
  return {
    executable: input.sandboxExecPath ?? "/usr/bin/sandbox-exec",
    args: ["-f", input.profilePath, "/bin/bash", "-c", input.command],
    cwd: input.cwd,
    env: sandboxBuildEnv(sandboxTemp, input.envSource),
    cleanupPaths: [sandboxTemp],
  };
}

// Escapes a string for use as a quoted Seatbelt profile literal.
// Input is an arbitrary filesystem path. Output is a quoted-string-safe fragment. Side effects: none.
export function sandboxEscapeSeatbeltString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
