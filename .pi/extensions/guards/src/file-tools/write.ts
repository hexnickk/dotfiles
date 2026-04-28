import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createWriteToolDefinition, type WriteOperations } from "@mariozechner/pi-coding-agent";
import {
  filePermissionsResolveInputPath,
  fileToolsCreateApprovalStore,
  fileToolsCreateMutationAuthorizer,
  type FilePermissionDeps,
  type FileToolsApprovalStore,
  type FileToolsPermissionContext,
} from "./permissions.ts";

export type FileToolsWriteDeps = {
  approvalStore?: FileToolsApprovalStore;
  createWriteDefinition?: typeof createWriteToolDefinition;
  permissionDeps?: FilePermissionDeps;
};

// Creates guarded write operations that allow workspace writes and confirm other host writes.
// Inputs are the Pi context and optional dependency overrides. Output plugs into Pi's write tool factory. Side effects happen only when operations run.
export function fileToolsCreateWriteOperations(
  ctx: FileToolsPermissionContext,
  deps: FileToolsWriteDeps = {},
  preapprovedTarget?: string,
): WriteOperations {
  const authorize = fileToolsCreateMutationAuthorizer(ctx, "write", deps.permissionDeps ?? {}, deps.approvalStore);

  return {
    async mkdir(dir) {
      if (!writeIsParentOfPreapprovedTarget(dir, preapprovedTarget)) await authorize(dir);
      await mkdir(dir, { recursive: true });
    },
    async writeFile(absolutePath, content) {
      await authorize(absolutePath);
      await writeFile(absolutePath, content, "utf-8");
    },
  };
}

// Creates a write tool override that preserves Pi's renderer while enforcing write confirmation outside the workspace.
// Inputs are optional factory/test overrides. Output is a write-compatible tool definition. Side effects: none until execute.
export function fileToolsCreateWriteTool(deps: FileToolsWriteDeps = {}): ReturnType<typeof createWriteToolDefinition> {
  const createWriteDefinition = deps.createWriteDefinition ?? createWriteToolDefinition;
  const base = createWriteDefinition(process.cwd());

  return {
    ...base,
    description: `${base.description} Workspace writes are allowed. Writes outside the workspace require interactive session confirmation.`,
    promptGuidelines: [
      "Use write only inside the workspace unless the user explicitly approves an outside write for this session.",
      ...(base.promptGuidelines ?? []),
    ],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const approvalStore = deps.approvalStore ?? fileToolsCreateApprovalStore();
      const permissionDeps = deps.permissionDeps ?? {};
      const authorize = fileToolsCreateMutationAuthorizer(ctx, "write", permissionDeps, approvalStore);
      await authorize(params.path);
      const preapprovedTarget = filePermissionsResolveInputPath(params.path, ctx.cwd, permissionDeps);
      const operationDeps = { ...deps, approvalStore, permissionDeps };
      const guarded = createWriteDefinition(ctx.cwd, { operations: fileToolsCreateWriteOperations(ctx, operationDeps, preapprovedTarget) });
      return guarded.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  };
}

// Checks whether the built-in write tool is creating the already-approved target's parent directory.
// Inputs are a directory path and optional preapproved file path. Output is true when mkdir should not prompt again. Side effects: none.
function writeIsParentOfPreapprovedTarget(dir: string, preapprovedTarget: string | undefined): boolean {
  return preapprovedTarget !== undefined && resolve(dir) === dirname(resolve(preapprovedTarget));
}
