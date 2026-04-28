import { dirname, isAbsolute, relative, resolve } from "node:path";
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
// Output is a spawn-ready command with broad read-only host access plus writable tmpfs temp/cache mounts. Side effects: none.
export function sandboxBuildLinuxCommand(input: SandboxLinuxCommandInput): SandboxCommand {
  const sandboxTemp = input.sandboxTemp.replace(/\/+$/, "");
  const env = sandboxBuildEnv(sandboxTemp, input.envSource);
  const tmpCwdRoots = linuxTmpCwdRoots(input.cwd);
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--unshare-cgroup-try",
    ...buildReadonlyBindArgs(["/"]),
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    ...buildParentDirArgs(tmpCwdRoots),
    ...buildReadonlyBindArgs(tmpCwdRoots),
    ...buildDirArgs(sandboxTemp),
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

// Keeps workspaces under /tmp visible after the sandbox replaces host /tmp with a writable tmpfs.
// Input is the command cwd. Output is a read-only bind root when cwd is inside /tmp. Side effects: none.
function linuxTmpCwdRoots(cwd: string): string[] {
  const resolved = resolve(cwd);
  return resolved !== "/tmp" && isPathInside(resolved, "/tmp") ? [resolved] : [];
}

// Converts the sandbox environment into bubblewrap --setenv arguments.
// Inputs: env from sandboxBuildEnv. Output: flattened bubblewrap arguments. Side effects: none.
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

// Builds bubblewrap read-only bind arguments for host roots.
// Input is candidate roots. Output is flattened --ro-bind arguments. Side effects: none.
function buildReadonlyBindArgs(roots: string[]): string[] {
  return uniquePaths(roots).flatMap((root) => ["--ro-bind", root, root]);
}

// Builds bubblewrap directory creation arguments for bind target parents.
// Input is bind roots plus synthetic mount paths. Output is flattened --dir arguments. Side effects: none.
function buildParentDirArgs(roots: string[]): string[] {
  return uniquePaths(roots.flatMap((root) => parentDirs(root))).flatMap((dir) => ["--dir", dir]);
}

// Lists non-root parent directories needed before mounting a root.
// Input is an absolute root path. Output is ordered parent directories below /. Side effects: none.
function parentDirs(root: string): string[] {
  const dirs: string[] = [];
  let current = dirname(root);
  while (current !== "/" && current !== ".") {
    dirs.unshift(current);
    current = dirname(current);
  }
  return dirs;
}

// Checks whether a path is equal to or contained by a root.
// Inputs are absolute paths. Output is true when path is within root. Side effects: none.
function isPathInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// Deduplicates paths while preserving first-seen order.
// Input is path strings. Output is unique path strings. Side effects: none.
function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}
