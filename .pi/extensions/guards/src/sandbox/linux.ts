import { sandboxBuildEnv } from "./env.ts";
import type { SandboxCommand } from "./types.ts";

export type SandboxLinuxCommandInput = {
  command: string;
  cwd: string;
  sandboxTemp: string;
  bwrapPath?: string;
  envSource?: NodeJS.ProcessEnv;
};

const LINUX_TMP_SUBDIRS = ["xdg-cache", "npm-cache", "pip-cache"];

// Builds a bubblewrap invocation for sandboxed bash execution on Linux.
// Inputs are the shell command, runtime cwd, sandbox-visible temp root, optional bwrap path, and env source.
// Output is a spawn-ready command using a read-only host root plus writable tmpfs temp/cache mounts. Side effects: none.
export function sandboxBuildLinuxCommand(input: SandboxLinuxCommandInput): SandboxCommand {
  const sandboxTemp = input.sandboxTemp.replace(/\/+$/, "");
  const env = sandboxBuildEnv(sandboxTemp, input.envSource);
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--unshare-cgroup-try",
    "--ro-bind",
    "/",
    "/",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    ...buildDirArgs(sandboxTemp),
    "--tmpfs",
    "/run",
    "--tmpfs",
    "/var/run",
    "--chdir",
    input.cwd,
    ...buildSetEnvArgs(env),
    "/bin/bash",
    "-c",
    input.command,
  ];

  return {
    executable: input.bwrapPath ?? "bwrap",
    args,
    cwd: input.cwd,
    env,
    cleanupPaths: [],
  };
}

// Converts selected environment variables into bubblewrap --setenv arguments.
// Inputs: explicit env from sandboxBuildEnv. Output: flattened bubblewrap arguments. Side effects: none.
function buildSetEnvArgs(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env).flatMap(([key, value]) => (value === undefined ? [] : ["--setenv", key, value]));
}

// Creates writable directory arguments inside the Linux /tmp tmpfs.
// Inputs: sandbox temp root. Output: bubblewrap --dir args for temp and cache paths. Side effects: none.
function buildDirArgs(sandboxTemp: string): string[] {
  return [sandboxTemp, ...LINUX_TMP_SUBDIRS.map((subdir) => `${sandboxTemp}/${subdir}`)].flatMap((dir) => [
    "--dir",
    dir,
  ]);
}
