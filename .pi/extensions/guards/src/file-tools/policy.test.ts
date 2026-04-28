import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  FilePermissionResolutionError,
  filePermissionsCheckPath,
  filePermissionsCreatePolicy,
  filePermissionsResolveInputPath,
  type FilePermissionDecision,
  type FilePermissionPolicy,
} from "./policy.ts";

// Asserts policy creation succeeded and narrows the result for TypeScript.
// Input is a policy result. Output is an assertion. Side effects: may fail the test.
function assertPolicy(value: FilePermissionPolicy | FilePermissionResolutionError): asserts value is FilePermissionPolicy {
  if (value instanceof FilePermissionResolutionError) assert.fail(value.message);
}

// Asserts path checking succeeded and narrows the result for TypeScript.
// Input is a decision result. Output is an assertion. Side effects: may fail the test.
function assertDecision(value: FilePermissionDecision | FilePermissionResolutionError): asserts value is FilePermissionDecision {
  if (value instanceof FilePermissionResolutionError) assert.fail(value.message);
}

// Creates isolated workspace/temp-like/outside directories for permission tests.
// Input is the node test context. Output is path fixtures. Side effects: creates and later removes a temp directory tree.
async function createFixtures(t: TestContext) {
  const base = await mkdtemp(join(tmpdir(), "pi-guards-permissions-"));
  t.after(() => rm(base, { force: true, recursive: true }));

  const workspace = join(base, "workspace");
  const tempLike = join(base, "temp-like");
  const outside = join(base, "outside");
  await mkdir(workspace);
  await mkdir(tempLike);
  await mkdir(outside);

  return { outside, tempLike, workspace };
}

test("file permission policy allows mutations only in the workspace", async (t) => {
  const { outside, tempLike, workspace } = await createFixtures(t);
  const policy = await filePermissionsCreatePolicy(workspace);
  assertPolicy(policy);

  const workspaceDecision = await filePermissionsCheckPath(policy, join(workspace, "file.txt"));
  assertDecision(workspaceDecision);
  assert.equal(workspaceDecision.allowed, true);

  const tempDecision = await filePermissionsCheckPath(policy, join(tempLike, "file.txt"));
  assertDecision(tempDecision);
  assert.equal(tempDecision.allowed, false);
  assert.equal(tempDecision.requiresApproval, true);

  const outsideDecision = await filePermissionsCheckPath(policy, join(outside, "cookies.sqlite"));
  assertDecision(outsideDecision);
  assert.equal(outsideDecision.allowed, false);
  assert.equal(outsideDecision.requiresApproval, true);
});

test("file permission policy requires approval for mutations outside workspace", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const policy = await filePermissionsCreatePolicy(workspace);
  assertPolicy(policy);

  const decision = await filePermissionsCheckPath(policy, join(outside, "bashrc"));
  assertDecision(decision);
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresApproval, true);
});

test("file permission policy requires approval for symlink escapes from the workspace", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const link = join(workspace, "outside-link");
  try {
    await symlink(outside, link, "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("symlink creation is not permitted");
      return;
    }
    throw error;
  }

  const policy = await filePermissionsCreatePolicy(workspace);
  assertPolicy(policy);

  const decision = await filePermissionsCheckPath(policy, join(link, "secret.txt"));
  assertDecision(decision);
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.canonicalPath, join(await realpath(outside), "secret.txt"));
});

test("file permission policy requires approval for broken symlink writes that target outside workspace", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const link = join(workspace, "broken-link");
  try {
    await symlink(join(outside, "new-file.txt"), link);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("symlink creation is not permitted");
      return;
    }
    throw error;
  }

  const policy = await filePermissionsCreatePolicy(workspace);
  assertPolicy(policy);

  const decision = await filePermissionsCheckPath(policy, link);
  assertDecision(decision);
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.canonicalPath, join(await realpath(outside), "new-file.txt"));
});

test("filePermissionsResolveInputPath leaves named-tilde paths relative like Pi built-in tools", () => {
  const result = filePermissionsResolveInputPath("~suffix/config", "/workspace/project", {
    homedir: () => "/Users/example",
  });

  assert.equal(result, "/workspace/project/~suffix/config");
});

test("filePermissionsResolveInputPath expands bare tilde and home directory paths", () => {
  const homeResult = filePermissionsResolveInputPath("~", "/workspace/project", {
    homedir: () => "/Users/example",
  });
  const result = filePermissionsResolveInputPath("~/notes.txt", "/workspace/project", {
    homedir: () => "/Users/example",
  });

  assert.equal(homeResult, "/Users/example");
  assert.equal(result, "/Users/example/notes.txt");
});
