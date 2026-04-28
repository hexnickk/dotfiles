import assert from "node:assert/strict";
import test from "node:test";

import { fileToolsCreateEditTool, fileToolsCreateRemoveTool, fileToolsCreateWriteTool } from "./index.ts";

test("file-tools index exports guarded mutation overrides and remove", () => {
  assert.equal(fileToolsCreateWriteTool().name, "write");
  assert.equal(fileToolsCreateEditTool().name, "edit");
  assert.equal(fileToolsCreateRemoveTool().name, "remove");
});
