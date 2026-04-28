import { type Stats } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import { defineTool, type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  filePermissionsResolveInputPath,
  fileToolsCreateMutationAuthorizer,
  type FilePermissionDeps,
  type FileToolsApprovalStore,
} from "./permissions.ts";

const REMOVE_PARAMS = Type.Object({
  path: Type.String({
    description: "Path to the file, symlink, or directory to remove (relative or absolute).",
  }),
  recursive: Type.Optional(
    Type.Boolean({
      description: "Set true to remove directories and their contents. Files and symlinks do not need this.",
    }),
  ),
});

export type FileToolsRemoveDetails = {
  kind: "directory" | "file" | "other" | "symlink";
  path: string;
  recursive: boolean;
};

export type FileToolsRemoveDeps = {
  approvalStore?: FileToolsApprovalStore;
  permissionDeps?: FilePermissionDeps;
};

// Represents an expected remove-tool failure that should surface as a failed Pi tool call.
export class FileToolsRemoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

// Creates a remove tool that deletes files through the file permission policy instead of shell rm.
// Inputs are optional dependency overrides. Output is a Pi custom tool definition. Side effects: none until execute.
export function fileToolsCreateRemoveTool(
  deps: FileToolsRemoveDeps = {},
): ToolDefinition<typeof REMOVE_PARAMS, FileToolsRemoveDetails> {
  return defineTool({
    name: "remove",
    label: "Remove",
    description:
      "Remove a file, symlink, or directory. Workspace removals are allowed. Removals outside the workspace require interactive session confirmation.",
    promptSnippet:
      "Remove files, symlinks, or directories without shell commands. Workspace removals are allowed; outside paths require interactive session confirmation. Set recursive=true to remove directories.",
    promptGuidelines: [
      "Use remove to delete files, symlinks, or directories instead of using shell rm.",
      "Set recursive=true only when deleting a directory and its contents.",
      "Workspace removals are allowed; outside paths require interactive confirmation for this session.",
    ],
    parameters: REMOVE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const permissionDeps = deps.permissionDeps ?? {};
      const authorize = fileToolsCreateMutationAuthorizer(ctx, "remove", permissionDeps, deps.approvalStore);
      await authorize(params.path);

      const absolutePath = filePermissionsResolveInputPath(params.path, ctx.cwd, permissionDeps);
      const stat = await removeStat(absolutePath);
      const recursive = params.recursive === true;
      const kind = removeEntryKind(stat);

      if (kind === "directory" && !recursive) {
        // Pi marks failed tool calls through thrown errors; this is the framework boundary for expected remove validation failures.
        throw new FileToolsRemoveError(`Cannot remove directory without recursive=true: ${absolutePath}`);
      }

      try {
        await rm(absolutePath, { force: false, recursive });
      } catch (error) {
        // Pi marks failed tool calls through thrown errors; filesystem failures are converted to a typed remove error at this boundary.
        throw new FileToolsRemoveError(`Could not remove ${absolutePath}: ${removeErrorMessage(error)}`);
      }

      const target = removeTargetLabel(kind);
      return {
        content: [{ type: "text", text: `Removed ${target}: ${absolutePath}` }],
        details: { kind, path: absolutePath, recursive },
      };
    },
  });
}

// Reads filesystem metadata for a remove target and converts failures to typed tool errors.
// Input is an absolute path. Output is lstat metadata. Side effects: filesystem lstat lookup.
async function removeStat(path: string): Promise<Stats> {
  try {
    return await lstat(path);
  } catch (error) {
    // Pi marks failed tool calls through thrown errors; filesystem lookup failures are converted at the tool boundary.
    throw new FileToolsRemoveError(`Could not inspect ${path}: ${removeErrorMessage(error)}`);
  }
}

// Classifies a filesystem entry for remove validation and user-facing details.
// Input is lstat metadata. Output is a simple entry kind. Side effects: none.
function removeEntryKind(stat: Stats): FileToolsRemoveDetails["kind"] {
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  return "other";
}

// Converts remove entry kinds into user-facing target labels.
// Input is an entry kind. Output is a display label. Side effects: none.
function removeTargetLabel(kind: FileToolsRemoveDetails["kind"]): string {
  if (kind === "directory") return "directory";
  if (kind === "symlink") return "symlink";
  if (kind === "file") return "file";
  return "path";
}

// Converts unknown filesystem errors to readable messages.
// Input is an unknown caught error. Output is a string message. Side effects: none.
function removeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
