import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { Text } from "@mariozechner/pi-tui";
import { createEditToolDefinition, renderDiff, type EditOperations } from "@mariozechner/pi-coding-agent";
import {
  fileToolsCreateMutationAuthorizer,
  type FilePermissionDeps,
  type FileToolsApprovalStore,
  type FileToolsPermissionContext,
} from "./permissions.ts";

type FileToolsEditAuthorizer = (requestedPath: string) => Promise<void>;

export type FileToolsEditDeps = {
  approvalStore?: FileToolsApprovalStore;
  createEditDefinition?: typeof createEditToolDefinition;
  permissionDeps?: FilePermissionDeps;
};

// Creates guarded edit operations that allow workspace edits and confirm other host edits.
// Inputs are the Pi context and optional dependency overrides. Output plugs into Pi's edit tool factory. Side effects happen only when operations run.
export function fileToolsCreateEditOperations(
  ctx: FileToolsPermissionContext,
  deps: FileToolsEditDeps = {},
  authorize: FileToolsEditAuthorizer = fileToolsCreateMutationAuthorizer(ctx, "edit", deps.permissionDeps ?? {}, deps.approvalStore),
): EditOperations {
  return {
    async access(absolutePath) {
      // Pi's built-in edit tool converts any access() error into "File not found", so execute() authorizes first and read/write enforce the same authorizer for clear permission errors.
      await access(absolutePath, constants.R_OK | constants.W_OK);
    },
    async readFile(absolutePath) {
      await authorize(absolutePath);
      return readFile(absolutePath);
    },
    async writeFile(absolutePath, content) {
      await authorize(absolutePath);
      await writeFile(absolutePath, content, "utf-8");
    },
  };
}

// Creates an edit tool override that disables pre-confirmation diff previews and enforces edit confirmation outside the workspace.
// Inputs are optional factory/test overrides. Output is an edit-compatible tool definition. Side effects: none until execute.
export function fileToolsCreateEditTool(deps: FileToolsEditDeps = {}): ReturnType<typeof createEditToolDefinition> {
  const createEditDefinition = deps.createEditDefinition ?? createEditToolDefinition;
  const base = createEditDefinition(process.cwd());

  return {
    ...base,
    description: `${base.description} Workspace edits are allowed. Edits outside the workspace require interactive session confirmation.`,
    promptGuidelines: [
      "Use edit only inside the workspace unless the user explicitly approves an outside edit for this session.",
      ...(base.promptGuidelines ?? []),
    ],
    renderCall(args, theme, context) {
      // Do not delegate to the built-in edit call renderer. Some Pi versions render a pre-execution diff
      // from raw edit args, which can both read files before guard approval and duplicate the final result diff.
      const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
      const path = editDisplayPath(args);
      const pathText = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
      text.setText(`${theme.fg("toolTitle", theme.bold("edit"))} ${pathText}`);
      return text;
    },
    renderResult(result, _options, theme, context) {
      const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
      const diff = editResultDiff(result.details);
      if (diff && !context.isError) {
        text.setText(`\n${renderDiff(diff, { filePath: editDisplayPath(context.args) })}`);
        return text;
      }

      const output = editTextContent(result.content);
      text.setText(output ? `\n${theme.fg(context.isError ? "error" : "toolOutput", output)}` : "");
      return text;
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const authorize = fileToolsCreateMutationAuthorizer(ctx, "edit", deps.permissionDeps ?? {}, deps.approvalStore);
      await authorize(params.path);
      const guarded = createEditDefinition(ctx.cwd, { operations: fileToolsCreateEditOperations(ctx, deps, authorize) });
      const result = await guarded.execute(toolCallId, params, signal, onUpdate, ctx);
      const diff = editResultDiff(result.details);
      return diff ? { ...result, content: [{ type: "text" as const, text: diff }] } : result;
    },
  };
}

// Extracts a display-only edit path from raw tool arguments.
// Input is model-supplied renderer args. Output is a path string or undefined. Side effects: none.
function editDisplayPath(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const input = args as { file_path?: unknown; path?: unknown };
  if (typeof input.path === "string") return input.path;
  if (typeof input.file_path === "string") return input.file_path;
  return undefined;
}

// Reads an edit diff from a tool-result details object.
// Input is renderer details from Pi. Output is a diff string when present. Side effects: none.
function editResultDiff(details: unknown): string | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const diff = (details as { diff?: unknown }).diff;
  return typeof diff === "string" ? diff : undefined;
}

// Converts tool content blocks into text for error/fallback rendering.
// Input is Pi tool-result content. Output is joined text block content. Side effects: none.
function editTextContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .filter(Boolean)
    .join("\n");
}
