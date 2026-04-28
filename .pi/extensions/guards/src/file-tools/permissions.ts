import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  FilePermissionDeniedError,
  FilePermissionResolutionError,
  filePermissionsCheckPath,
  filePermissionsCheckRemovePath,
  filePermissionsCreatePolicy,
  filePermissionsIsPathInside,
  filePermissionsResolveInputPath,
  type FilePermissionDecision,
  type FilePermissionDeps,
  type FilePermissionPolicy,
} from "./policy.ts";

export {
  FilePermissionDeniedError,
  FilePermissionResolutionError,
  filePermissionsCheckPath,
  filePermissionsCheckRemovePath,
  filePermissionsCreatePolicy,
  filePermissionsResolveInputPath,
  type FilePermissionDecision,
  type FilePermissionDeps,
  type FilePermissionPolicy,
};

export type FileToolsAction = "write" | "edit" | "remove";
export type FileToolsApprovalStore = Record<FileToolsAction, string[]>;
export type FileToolsPermissionContext = Pick<ExtensionContext, "abort" | "cwd" | "hasUI" | "ui">;

// Creates a mutable store for outside-workspace approvals that live only for one Pi session.
// Inputs are none. Output is an empty approval store keyed by mutation action. Side effects: none.
export function fileToolsCreateApprovalStore(): FileToolsApprovalStore {
  return { edit: [], remove: [], write: [] };
}

// Clears session-scoped outside-workspace approvals without replacing the shared store object held by tools.
// Input is a store previously passed to guarded file tools. Output is void. Side effects: mutates the store in place.
export function fileToolsResetApprovalStore(store: FileToolsApprovalStore): void {
  store.edit.length = 0;
  store.remove.length = 0;
  store.write.length = 0;
}

// Checks a tool path against the workspace mutation root.
// Inputs are the Pi context, requested path, action, and dependency overrides. Output is a decision or typed error. Side effects: resolves filesystem paths.
export async function fileToolsCheckPath(
  ctx: Pick<ExtensionContext, "cwd">,
  requestedPath: string,
  action: FileToolsAction,
  deps: FilePermissionDeps = {},
): Promise<FilePermissionDecision | FilePermissionResolutionError> {
  const policy = await filePermissionsCreatePolicy(ctx.cwd, deps);
  if (policy instanceof FilePermissionResolutionError) return policy;

  const absolutePath = filePermissionsResolveInputPath(requestedPath, ctx.cwd, deps);
  return action === "remove"
    ? filePermissionsCheckRemovePath(policy, absolutePath, deps)
    : filePermissionsCheckPath(policy, absolutePath, deps, action);
}

// Creates an authorizer for mutating file tools. One user approval covers later same-action operations under the approved outside target for the current session.
// Inputs are context, action, test deps, and an optional session approval store. Output resolves when allowed. Side effects: may prompt the user and throws at the Pi tool boundary because Pi marks tool failures by thrown errors.
export function fileToolsCreateMutationAuthorizer(
  ctx: FileToolsPermissionContext,
  action: FileToolsAction,
  deps: FilePermissionDeps = {},
  approvalStore: FileToolsApprovalStore = fileToolsCreateApprovalStore(),
): (requestedPath: string) => Promise<void> {
  const approvedOutsideRoots = approvalStore[action];

  return async (requestedPath) => {
    const decision = await fileToolsCheckPath(ctx, requestedPath, action, deps);
    if (decision instanceof FilePermissionResolutionError) return fileToolsThrowIfDenied(decision);
    if (decision.allowed || approvedOutsideRoots.some((root) => filePermissionsIsPathInside(decision.canonicalPath, root))) return;
    if (!decision.requiresApproval || !ctx.hasUI) return fileToolsAbortAndThrow(ctx, new FilePermissionDeniedError(decision));

    const confirmed = await ctx.ui.confirm(`Agent is trying to ${action} ${decision.absolutePath}`, "Approve for this session?");
    if (!confirmed) return fileToolsAbortAndThrow(ctx, new FilePermissionDeniedError(decision));

    approvedOutsideRoots.push(decision.canonicalPath);
  };
}

// Throws a framework-facing error only at the Pi tool operation boundary.
// Input is a typed permission error. Output is never. Side effects: throws so Pi marks the tool result as failed.
export function fileToolsThrowIfDenied(error: FilePermissionDeniedError | FilePermissionResolutionError): never {
  throw error;
}

// Aborts the current agent turn before surfacing a denied outside-workspace mutation as a failed tool call.
// Inputs are context and a typed denied error. Output is never. Side effects: aborts the active agent operation and throws at the Pi tool boundary.
function fileToolsAbortAndThrow(ctx: FileToolsPermissionContext, error: FilePermissionDeniedError): never {
  ctx.abort();
  return fileToolsThrowIfDenied(error);
}
