import { lstat, readlink, realpath as fsRealpath } from "node:fs/promises";
import { homedir as osHomedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const MAX_SYMLINK_DEPTH = 40;

export type FilePermissionDeps = {
  homedir?: () => string;
  realpath?: (path: string) => Promise<string>;
};

export type FilePathsCanonicalPath = {
  canonicalPath: string;
};

export class FilePathsResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

// Resolves an allowed root to its canonical filesystem path.
// Inputs are a root path and dependency overrides. Output is a canonical root or undefined when unavailable. Side effects: filesystem realpath lookup.
export async function filePathsCanonicalizeRoot(root: string, deps: FilePermissionDeps): Promise<string | undefined> {
  try {
    return await (deps.realpath ?? fsRealpath)(resolve(root));
  } catch {
    return undefined;
  }
}

// Resolves a model-supplied path using Pi-compatible basics: @ stripping, unicode-space normalization, ~ expansion, and cwd-relative paths.
// Inputs are a raw path and cwd. Output is an absolute path. Side effects: none.
export function filePathsResolveInputPath(rawPath: string, cwd: string, deps: FilePermissionDeps = {}): string {
  const stripped = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
  const normalized = stripped.replace(UNICODE_SPACES, " ");
  const homedir = deps.homedir ?? osHomedir;

  if (normalized === "~") return homedir();
  if (normalized.startsWith("~/")) return homedir() + normalized.slice(1);
  if (isAbsolute(normalized)) return resolve(normalized);
  return resolve(cwd, normalized);
}

// Resolves an input path for policy checks while preserving non-existent suffixes and expanding symlinks.
// Inputs are an absolute path, dependency overrides, and recursion depth. Output is a canonical path or typed resolution error. Side effects: filesystem lstat/readlink/realpath checks.
export async function filePathsCanonicalizeForPolicy(
  absolutePath: string,
  deps: FilePermissionDeps,
  depth = 0,
): Promise<FilePathsCanonicalPath | FilePathsResolutionError> {
  if (depth > MAX_SYMLINK_DEPTH) return new FilePathsResolutionError(`Too many symlink expansions while resolving ${absolutePath}`);

  let current = resolve(absolutePath);
  const suffixParts: string[] = [];

  while (true) {
    const real = await tryRealpath(current, deps);
    if (typeof real === "string") return { canonicalPath: resolve(real, ...suffixParts) };
    if (real instanceof FilePathsResolutionError) return real;

    const symlinkTarget = await tryReadSymlink(current);
    if (symlinkTarget instanceof FilePathsResolutionError) return symlinkTarget;
    if (typeof symlinkTarget === "string") {
      return filePathsCanonicalizeForPolicy(resolve(dirname(current), symlinkTarget, ...suffixParts), deps, depth + 1);
    }

    const parent = dirname(current);
    if (parent === current) return new FilePathsResolutionError(`Could not resolve any existing ancestor for ${absolutePath}`);

    suffixParts.unshift(basename(current));
    current = parent;
  }
}

// Checks if a path is equal to or contained by a root.
// Inputs are canonical-ish absolute paths. Output is true when path is inside root. Side effects: none.
export function filePathsIsInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// Attempts a realpath lookup and converts unexpected failures into typed errors.
// Inputs are a path and dependency overrides. Output is a realpath, undefined for missing paths, or a typed error. Side effects: filesystem realpath lookup.
async function tryRealpath(path: string, deps: FilePermissionDeps): Promise<string | undefined | FilePathsResolutionError> {
  try {
    return await (deps.realpath ?? fsRealpath)(path);
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    return new FilePathsResolutionError(`Could not resolve ${path}: ${errorMessage(error)}`);
  }
}

// Reads a symlink target when the path itself is a symlink.
// Input is a path to inspect. Output is a symlink target, undefined for non-links/missing paths, or a typed error. Side effects: filesystem lstat/readlink checks.
async function tryReadSymlink(path: string): Promise<string | undefined | FilePathsResolutionError> {
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) return undefined;
    return await readlink(path);
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    return new FilePathsResolutionError(`Could not inspect ${path}: ${errorMessage(error)}`);
  }
}

// Detects filesystem errors that mean a path component is missing.
// Input is an unknown caught error. Output is true for ENOENT/ENOTDIR errors. Side effects: none.
function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

// Converts unknown caught errors to readable messages.
// Input is an unknown caught error. Output is a string message. Side effects: none.
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
