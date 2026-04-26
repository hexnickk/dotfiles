import { createBashToolDefinition } from "@mariozechner/pi-coding-agent";

export type BashToolsDangerousBashDeps = {
  createBashDefinition?: typeof createBashToolDefinition;
};

// Creates the dangerous_bash Pi tool definition without overriding Pi's built-in bash tool.
// Inputs are optional factory overrides for tests. Output is a bash-compatible tool that prompts before host execution. Side effects happen only during execute.
export function bashToolsCreateDangerousBashTool(
  deps: BashToolsDangerousBashDeps = {},
): ReturnType<typeof createBashToolDefinition> {
  const createBashDefinition = deps.createBashDefinition ?? createBashToolDefinition;
  const base = createBashDefinition(process.cwd());

  return {
    ...base,
    name: "dangerous_bash",
    label: "Dangerous Bash",
    description: "Run a shell command on the host after explicit user confirmation.",
    promptSnippet:
      "Run a shell command on the host after explicit user confirmation. Use dangerous_bash only when a command intentionally needs host filesystem writes or host-side side effects.",
    promptGuidelines: [
      "Use dangerous_bash only when a command intentionally needs host filesystem writes or host-side side effects.",
      "Prefer sandbox_bash for normal command execution.",
    ],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!ctx.hasUI) {
        return dangerousBashBlockedResult("dangerous_bash requires interactive confirmation; no host command was executed.");
      }

      const confirmed = await ctx.ui.confirm("Run host command?", params.command);
      if (!confirmed) {
        return dangerousBashBlockedResult("Host command blocked by user; no command was executed.");
      }

      const hostBash = createBashDefinition(ctx.cwd);
      return hostBash.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  };
}

// Builds a bash-renderer-compatible result for declined dangerous_bash executions.
// Input is the message returned to the LLM. Output has no bash details. Side effects: none.
function dangerousBashBlockedResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: undefined,
  };
}
