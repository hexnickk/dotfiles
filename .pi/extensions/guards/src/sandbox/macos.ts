import { sandboxBuildEnv } from "./env.ts";
import type { SandboxCommand } from "./types.ts";

const OUTPUT_WRITE_LITERALS = ["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/fd/1", "/dev/fd/2"];

export type SandboxMacosCommandInput = {
  command: string;
  cwd: string;
  sandboxTemp: string;
  profilePath: string;
  envSource?: NodeJS.ProcessEnv;
  sandboxExecPath?: string;
};

// Builds a macOS Seatbelt profile for sandboxed bash execution.
// Inputs are the real writable sandbox temp directory. Output is profile source text. Side effects: none.
export function sandboxBuildMacosProfile(sandboxTemp: string): string {
  const escapedTemp = sandboxEscapeSeatbeltString(normalizeSandboxPath(sandboxTemp));

  return [
    "(version 1)",
    "(deny default)",
    "",
    "(allow process*)",
    "(allow network*)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "",
    "(allow file-read* (subpath \"/\"))",
    "(allow file-map-executable (subpath \"/\"))",
    "",
    "(allow file-write*",
    `  (subpath "${escapedTemp}")`,
    ...OUTPUT_WRITE_LITERALS.map((literal) => `  (literal "${literal}")`),
    ")",
    "",
  ].join("\n");
}

// Builds a sandbox-exec invocation for sandboxed bash execution on macOS.
// Inputs are the shell command, cwd, writable temp root, generated profile path, and env source.
// Output is a spawn-ready command that can read the host filesystem and write only under sandboxTemp. Side effects: none.
export function sandboxBuildMacosCommand(input: SandboxMacosCommandInput): SandboxCommand {
  const sandboxTemp = normalizeSandboxPath(input.sandboxTemp);
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

// Removes redundant trailing slashes without turning the filesystem root into an empty path.
// Input is a filesystem path. Output is a normalized path string. Side effects: none.
function normalizeSandboxPath(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}
