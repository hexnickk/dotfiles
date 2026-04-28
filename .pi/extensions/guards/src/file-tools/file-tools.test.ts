import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  fileToolsCreateApprovalStore,
  fileToolsCreateEditTool,
  fileToolsCreateMutationAuthorizer,
  fileToolsCreateRemoveTool,
  fileToolsCreateWriteTool,
  fileToolsResetApprovalStore,
} from "./index.ts";

// Creates isolated workspace/outside directories for guarded file tool tests.
// Input is the node test context. Output is path fixtures. Side effects: creates and later removes a temp directory tree.
async function createFixtures(t: TestContext) {
  const base = await mkdtemp(join(tmpdir(), "pi-guards-file-tools-"));
  t.after(() => rm(base, { force: true, recursive: true }));

  const workspace = join(base, "workspace");
  const outside = join(base, "outside");
  await mkdir(workspace);
  await mkdir(outside);

  return { outside, workspace };
}

// Builds the minimal Pi context shape used by built-in tool definitions.
// Inputs are cwd and optional confirmation/abort behavior. Output is a test context object. Side effects: none.
function createCtx(
  cwd: string,
  confirm?: (title: string, message: string) => boolean | Promise<boolean>,
  abort: () => void = () => undefined,
) {
  return {
    abort,
    cwd,
    hasUI: confirm !== undefined,
    ui: {
      confirm: async (title: string, message: string) => confirm?.(title, message) ?? false,
    },
  } as never;
}

// Checks whether a path exists in test fixtures.
// Input is a filesystem path. Output is true when the path is present. Side effects: filesystem access check.
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test("guarded write confirms outside paths before writing", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const write = fileToolsCreateWriteTool();
  let confirmCalls = 0;
  const ctx = createCtx(workspace, () => {
    confirmCalls += 1;
    return true;
  });

  await write.execute("write-1", { path: join(outside, "approved.txt"), content: "approved" }, undefined, undefined, ctx);

  assert.equal(confirmCalls, 1);
  assert.equal(await readFile(join(outside, "approved.txt"), "utf-8"), "approved");
});

test("outside mutation approvals are reused for the current session and reset between sessions", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const approvalStore = fileToolsCreateApprovalStore();
  let confirmCalls = 0;
  const ctx = createCtx(workspace, () => {
    confirmCalls += 1;
    return true;
  });
  const target = join(outside, "approved.txt");
  const authorizeWrite = fileToolsCreateMutationAuthorizer(ctx, "write", {}, approvalStore);

  await authorizeWrite(target);
  await authorizeWrite(target);
  assert.equal(confirmCalls, 1);

  fileToolsResetApprovalStore(approvalStore);
  await authorizeWrite(target);
  assert.equal(confirmCalls, 2);
});

test("guarded write blocks outside paths when confirmation is declined", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const write = fileToolsCreateWriteTool();
  const target = join(outside, "blocked.txt");
  let abortCalls = 0;
  let prompt: { message: string; title: string } | undefined;
  const ctx = createCtx(
    workspace,
    (title, message) => {
      prompt = { message, title };
      return false;
    },
    () => {
      abortCalls += 1;
    },
  );

  await assert.rejects(
    () => write.execute("write-1", { path: target, content: "blocked" }, undefined, undefined, ctx),
    /write outside workspace requires approval/,
  );

  assert.deepEqual(prompt, { title: `Agent is trying to write ${target}`, message: "Approve for this session?" });
  assert.equal(abortCalls, 1);
});

test("guarded remove deletes workspace files without shell rm", async (t) => {
  const { workspace } = await createFixtures(t);
  const target = join(workspace, "placeholder.txt");
  await writeFile(target, "delete me");

  const remove = fileToolsCreateRemoveTool();
  const ctx = createCtx(workspace);
  const result = await remove.execute("remove-1", { path: "placeholder.txt" }, undefined, undefined, ctx);

  assert.deepEqual(result.content, [{ type: "text", text: `Removed file: ${target}` }]);
  assert.equal(await pathExists(target), false);
});

test("guarded remove deletes symlinks inside workspace without approving their outside targets", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const outsideTarget = join(outside, "target.txt");
  const link = join(workspace, "outside-link");
  await writeFile(outsideTarget, "keep me");
  try {
    await symlink(outsideTarget, link);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("symlink creation is not permitted");
      return;
    }
    throw error;
  }

  const remove = fileToolsCreateRemoveTool();
  let confirmCalls = 0;
  const ctx = createCtx(workspace, () => {
    confirmCalls += 1;
    return false;
  });

  await remove.execute("remove-1", { path: "outside-link" }, undefined, undefined, ctx);

  assert.equal(confirmCalls, 0);
  assert.equal(await pathExists(link), false);
  assert.equal(await readFile(outsideTarget, "utf-8"), "keep me");
});

test("guarded remove blocks paths through symlinked workspace ancestors", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const outsideTarget = join(outside, "blocked-through-link.txt");
  const linkDir = join(workspace, "outside-dir");
  await writeFile(outsideTarget, "keep me");
  try {
    await symlink(outside, linkDir, "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("symlink creation is not permitted");
      return;
    }
    throw error;
  }

  const remove = fileToolsCreateRemoveTool();
  const ctx = createCtx(workspace);

  await assert.rejects(
    () => remove.execute("remove-1", { path: "outside-dir/blocked-through-link.txt" }, undefined, undefined, ctx),
    /remove outside workspace requires approval/,
  );

  assert.equal(await readFile(outsideTarget, "utf-8"), "keep me");
});

test("guarded remove requires recursive=true for directories", async (t) => {
  const { workspace } = await createFixtures(t);
  const target = join(workspace, "old-dir");
  await mkdir(target);
  await writeFile(join(target, "file.txt"), "delete me");

  const remove = fileToolsCreateRemoveTool();
  const ctx = createCtx(workspace);
  await assert.rejects(
    () => remove.execute("remove-1", { path: "old-dir" }, undefined, undefined, ctx),
    /Cannot remove directory without recursive=true/,
  );

  await remove.execute("remove-2", { path: "old-dir", recursive: true }, undefined, undefined, ctx);

  assert.equal(await pathExists(target), false);
});

test("guarded remove confirms outside paths before deleting", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const approvedTarget = join(outside, "approved-delete.txt");
  const blockedTarget = join(outside, "blocked-delete.txt");
  await writeFile(approvedTarget, "approved");
  await writeFile(blockedTarget, "blocked");
  const remove = fileToolsCreateRemoveTool();
  const confirmations = [true, false];
  const ctx = createCtx(workspace, () => confirmations.shift() ?? false);

  await remove.execute("remove-1", { path: approvedTarget }, undefined, undefined, ctx);
  await assert.rejects(
    () => remove.execute("remove-2", { path: blockedTarget }, undefined, undefined, ctx),
    /remove outside workspace requires approval/,
  );

  assert.deepEqual(confirmations, []);
  assert.equal(await pathExists(approvedTarget), false);
  assert.equal(await pathExists(blockedTarget), true);
});

test("guarded edit blocks outside paths when interactive confirmation is unavailable", async (t) => {
  const { outside, workspace } = await createFixtures(t);
  const target = join(outside, "bashrc");
  await writeFile(target, "alias ll='ls -la'\n");

  const edit = fileToolsCreateEditTool();
  const ctx = createCtx(workspace);

  await assert.rejects(
    () =>
      edit.execute(
        "edit-1",
        { path: target, edits: [{ oldText: "alias ll='ls -la'", newText: "alias ll='ls -lah'" }] },
        undefined,
        undefined,
        ctx,
      ),
    /edit outside workspace requires approval/,
  );

  assert.equal(await readFile(target, "utf-8"), "alias ll='ls -la'\n");
});
