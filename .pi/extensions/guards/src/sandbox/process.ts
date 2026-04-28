import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { SandboxSpawnError } from "./errors.ts";
import type { SandboxCommand } from "./types.ts";
import type { SandboxExecOptions, SandboxExecResult } from "./operations.ts";

const EXIT_STDIO_GRACE_MS = 100;

type SandboxChildExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

// Runs a prepared sandbox command and streams stdout/stderr.
// Inputs are a spawn-ready command plus execution callbacks. Output is the process exit code. Side effects: starts/kills processes and removes temp paths.
export async function sandboxProcessSpawn(
  prepared: SandboxCommand,
  options: SandboxExecOptions,
): Promise<SandboxExecResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    const child = spawn(prepared.executable, prepared.args, {
      cwd: prepared.cwd,
      detached: true,
      env: prepared.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      options.signal?.removeEventListener("abort", onAbort);
      child.stdout?.removeListener("data", options.onData);
      child.stderr?.removeListener("data", options.onData);
      void cleanupPrepared(prepared)
        .catch(() => undefined)
        .finally(fn);
    };

    const killChildGroup = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // Process may have exited between abort/timeout and kill; nothing else to clean up here.
        }
      }
    };

    const onAbort = () => killChildGroup();

    child.stdout?.on("data", options.onData);
    child.stderr?.on("data", options.onData);
    const waitPromise = waitForSandboxChildProcess(child);

    if (options.timeout !== undefined && options.timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        killChildGroup();
      }, options.timeout * 1000);
    }

    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });

    waitPromise
      .then(({ code, signal }) => {
        settle(() => {
          if (options.signal?.aborted) reject(new Error("aborted"));
          else if (timedOut) reject(new Error(`timeout:${options.timeout}`));
          else if (signal) reject(new Error(`terminated by signal ${signal}`));
          else if (code === null) reject(new Error("terminated without exit code"));
          else resolve({ exitCode: code });
        });
      })
      .catch((error) => {
        settle(() => reject(new SandboxSpawnError(prepared.executable, error)));
      });
  });
}

// Waits for child termination without hanging when descendants inherit stdout/stderr handles.
// Input is a spawned process. Output is its exit code and terminating signal. Side effects: removes listeners and destroys stdio streams after settling.
function waitForSandboxChildProcess(child: ChildProcess): Promise<SandboxChildExit> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exited = false;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let postExitTimer: NodeJS.Timeout | undefined;
    let stdoutEnded = !child.stdout;
    let stderrEnded = !child.stderr;

    const cleanup = () => {
      if (postExitTimer) clearTimeout(postExitTimer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout?.removeListener("end", onStdoutEnd);
      child.stderr?.removeListener("end", onStderrEnd);
    };

    const finalize = (exit: SandboxChildExit) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(exit);
    };

    const maybeFinalizeAfterExit = () => {
      if (!exited || settled) return;
      if (stdoutEnded && stderrEnded) finalize({ code: exitCode, signal: exitSignal });
    };

    const onStdoutEnd = () => {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    };

    const onStderrEnd = () => {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };

    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      exited = true;
      exitCode = code;
      exitSignal = signal;
      maybeFinalizeAfterExit();
      if (!settled) postExitTimer = setTimeout(() => finalize({ code, signal }), EXIT_STDIO_GRACE_MS);
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null) => finalize({ code, signal });

    child.stdout?.once("end", onStdoutEnd);
    child.stderr?.once("end", onStderrEnd);
    child.once("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);
  });
}

// Removes host temp paths created for a prepared command.
// Input is a prepared sandbox command. Output resolves after cleanup. Side effects: deletes cleanup paths recursively.
async function cleanupPrepared(prepared: SandboxCommand): Promise<void> {
  await Promise.all(prepared.cleanupPaths.map((path) => rm(path, { force: true, recursive: true })));
}
