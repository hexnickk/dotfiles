import { createBashToolDefinition, type BashOperations } from "@mariozechner/pi-coding-agent";
import { sandboxExec } from "../sandbox/index.ts";

export type BashToolsSandboxBashDeps = {
  createOperations?: () => BashOperations;
  createBashDefinition?: typeof createBashToolDefinition;
};

// Creates BashOperations that delegate command execution to the independent sandbox module.
// Inputs: none. Output plugs into Pi's bash tool factory. Side effects happen only when exec is called.
export function bashToolsCreateSandboxBashOperations(): BashOperations {
  return {
    exec(command, cwd, options) {
      return sandboxExec(command, cwd, options);
    },
  };
}

// Creates the sandbox_bash Pi tool definition without overriding Pi's built-in bash tool.
// Inputs are optional factory overrides for tests. Output is a bash-compatible tool definition. Side effects: none until execute.
export function bashToolsCreateSandboxBashTool(
  deps: BashToolsSandboxBashDeps = {},
): ReturnType<typeof createBashToolDefinition> {
  const createBashDefinition = deps.createBashDefinition ?? createBashToolDefinition;
  const createOperations = deps.createOperations ?? bashToolsCreateSandboxBashOperations;
  const base = createBashDefinition(process.cwd());

  return {
    ...base,
    name: "sandbox_bash",
    label: "Sandbox Bash",
    description: "Run a shell command in an OS sandbox with host filesystem writes denied.",
    promptSnippet:
      "Run shell commands in an OS sandbox with the user environment. The host filesystem is readable but not writable; only sandbox temp storage is writable. Network is enabled. Use sandbox_bash for normal command execution when host filesystem writes are not required.",
    promptGuidelines: [
      "Use sandbox_bash for normal command execution when host filesystem writes are not required.",
      "Use dangerous_bash instead when a command intentionally needs host filesystem writes or host-side side effects.",
    ],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const sandboxed = createBashDefinition(ctx.cwd, { operations: createOperations() });
      return sandboxed.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  };
}
