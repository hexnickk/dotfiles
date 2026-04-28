import { basename, dirname, isAbsolute, resolve } from "node:path";
import {
  FilePathsResolutionError,
  filePathsCanonicalizeForPolicy,
  filePathsCanonicalizeRoot,
  filePathsIsInside,
  filePathsResolveInputPath,
  type FilePermissionDeps,
} from "./paths.ts";

export type { FilePermissionDeps } from "./paths.ts";

export type FilePermissionPolicy = {
  workspaceRoot: string;
};

export type FilePermissionDecision = {
  absolutePath: string;
  allowed: boolean;
  canonicalPath: string;
  reason: string;
  requiresApproval: boolean;
};

export class FilePermissionResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class FilePermissionDeniedError extends Error {
  readonly decision: FilePermissionDecision;

  constructor(decision: FilePermissionDecision) {
    super(decision.reason);
    this.name = new.target.name;
    this.decision = decision;
  }
}

// Creates the file permission policy for a Pi session cwd.
// Inputs are the session cwd and optional test dependency overrides. Output is a policy or a typed setup error. Side effects: resolves filesystem paths.
export async function filePermissionsCreatePolicy(
  cwd: string,
  deps: FilePermissionDeps = {},
): Promise<FilePermissionPolicy | FilePermissionResolutionError> {
  const cwdRoot = await filePathsCanonicalizeRoot(cwd, deps);
  if (!cwdRoot) return new FilePermissionResolutionError(`Could not resolve working directory: ${cwd}`);

  return { workspaceRoot: cwdRoot };
}

// Resolves a model-supplied path using Pi-compatible basics.
// Inputs are a raw path and cwd. Output is an absolute path. Side effects: none.
export function filePermissionsResolveInputPath(rawPath: string, cwd: string, deps: FilePermissionDeps = {}): string {
  return filePathsResolveInputPath(rawPath, cwd, deps);
}

// Checks whether a write/edit path is permitted by the policy.
// Inputs are the policy, a path, dependency overrides, and an action label. Output is an allow/deny decision or typed resolution error. Side effects: resolves filesystem paths.
export async function filePermissionsCheckPath(
  policy: FilePermissionPolicy,
  absolutePath: string,
  deps: FilePermissionDeps = {},
  action = "write or edit",
): Promise<FilePermissionDecision | FilePermissionResolutionError> {
  const candidate = isAbsolute(absolutePath) ? resolve(absolutePath) : resolve(policy.workspaceRoot, absolutePath);
  const canonical = await filePathsCanonicalizeForPolicy(candidate, deps);
  if (canonical instanceof FilePathsResolutionError) return toPermissionResolutionError(canonical);

  return filePermissionsBuildDecision(policy, candidate, canonical.canonicalPath, action);
}

// Checks whether removing a path is permitted by the policy without following the final symlink.
// Inputs are the policy, a path, and dependency overrides. Output is an allow/deny decision or typed resolution error. Side effects: resolves filesystem paths.
export async function filePermissionsCheckRemovePath(
  policy: FilePermissionPolicy,
  absolutePath: string,
  deps: FilePermissionDeps = {},
): Promise<FilePermissionDecision | FilePermissionResolutionError> {
  const candidate = isAbsolute(absolutePath) ? resolve(absolutePath) : resolve(policy.workspaceRoot, absolutePath);
  const parentCanonical = await filePathsCanonicalizeForPolicy(dirname(candidate), deps);
  if (parentCanonical instanceof FilePathsResolutionError) return toPermissionResolutionError(parentCanonical);

  return filePermissionsBuildDecision(policy, candidate, resolve(parentCanonical.canonicalPath, basename(candidate)), "remove");
}

// Checks if a path is equal to or contained by a root.
// Inputs are canonical-ish absolute paths. Output is true when path is inside root. Side effects: none.
export function filePermissionsIsPathInside(path: string, root: string): boolean {
  return filePathsIsInside(path, root);
}

// Builds a policy decision from a candidate path and its canonical permission target.
// Inputs are the policy, requested path, canonical target, and action label. Output is an allow/deny decision. Side effects: none.
function filePermissionsBuildDecision(
  policy: FilePermissionPolicy,
  absolutePath: string,
  canonicalPath: string,
  action: string,
): FilePermissionDecision {
  const allowed = filePermissionsIsPathInside(canonicalPath, policy.workspaceRoot);
  const requiresApproval = !allowed;
  const reason = allowed
    ? `${action} allowed inside ${policy.workspaceRoot}`
    : `${action} outside workspace requires approval: ${absolutePath}`;

  return { absolutePath, allowed, canonicalPath, reason, requiresApproval };
}

// Converts path-resolution errors into the public file-permission error type.
// Input is an internal path error. Output is a permission resolution error. Side effects: none.
function toPermissionResolutionError(error: FilePathsResolutionError): FilePermissionResolutionError {
  return new FilePermissionResolutionError(error.message);
}
