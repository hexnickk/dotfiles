import assert from "node:assert/strict";
import test from "node:test";

import {
  GuardBashApprovalRequiredError,
  GuardBashInvalidPipelineError,
  GuardBashSyntaxNotAllowedError,
  GuardBashUnterminatedQuoteError,
} from "./errors.ts";
import { guardBashTokenizeSafeShell } from "./tokenize.ts";
import type { GuardBashShellToken } from "./types.ts";

// Asserts that tokenization succeeded and returns the produced tokens.
function assertTokenized(result: GuardBashApprovalRequiredError | GuardBashShellToken[]): GuardBashShellToken[] {
  assert.ok(!(result instanceof GuardBashApprovalRequiredError));
  if (result instanceof GuardBashApprovalRequiredError) {
    assert.fail(result.message);
  }

  return result;
}

test("guardBashTokenizeSafeShell keeps escaped and quoted pipe characters inside words", () => {
  const tokens = assertTokenized(guardBashTokenizeSafeShell(String.raw`grep a\|b "c|d" file\ name.txt | sort`));

  assert.deepEqual(tokens, [
    { type: "word", value: "grep" },
    { type: "word", value: "a|b" },
    { type: "word", value: "c|d" },
    { type: "word", value: "file name.txt" },
    { type: "pipe" },
    { type: "word", value: "sort" },
  ]);
});

test("guardBashTokenizeSafeShell keeps ~ inside words but rejects leading ~ expansion", () => {
  const revisionTokens = assertTokenized(guardBashTokenizeSafeShell("git diff HEAD~1"));
  const expansionResult = guardBashTokenizeSafeShell("cat ~/.gitconfig");

  assert.deepEqual(revisionTokens, [
    { type: "word", value: "git" },
    { type: "word", value: "diff" },
    { type: "word", value: "HEAD~1" },
  ]);
  assert.ok(expansionResult instanceof GuardBashSyntaxNotAllowedError);
});

test("guardBashTokenizeSafeShell treats # as a comment only at the start of a token", () => {
  const commentTokens = assertTokenized(guardBashTokenizeSafeShell("pwd # explain command"));
  const hashWordTokens = assertTokenized(guardBashTokenizeSafeShell("rg foo#bar file.txt"));

  assert.deepEqual(commentTokens, [{ type: "word", value: "pwd" }]);
  assert.deepEqual(hashWordTokens, [
    { type: "word", value: "rg" },
    { type: "word", value: "foo#bar" },
    { type: "word", value: "file.txt" },
  ]);
});

test("guardBashTokenizeSafeShell returns a typed error for invalid pipelines", () => {
  const leadingPipe = guardBashTokenizeSafeShell("| sort");
  const doublePipe = guardBashTokenizeSafeShell("pwd || sort");

  assert.ok(leadingPipe instanceof GuardBashInvalidPipelineError);
  assert.ok(doublePipe instanceof GuardBashInvalidPipelineError);
});

test("guardBashTokenizeSafeShell returns a typed error for variable expansion", () => {
  const result = guardBashTokenizeSafeShell("echo $HOME");

  assert.ok(result instanceof GuardBashSyntaxNotAllowedError);
  if (!(result instanceof GuardBashSyntaxNotAllowedError)) return;
  assert.match(result.message, /Variable and command expansion/);
});

test("guardBashTokenizeSafeShell returns a typed error for escaped newlines", () => {
  const result = guardBashTokenizeSafeShell("pwd \\\nls");

  assert.ok(result instanceof GuardBashSyntaxNotAllowedError);
  if (!(result instanceof GuardBashSyntaxNotAllowedError)) return;
  assert.match(result.message, /newlines/);
});

test("guardBashTokenizeSafeShell returns a typed error for unterminated quotes", () => {
  const result = guardBashTokenizeSafeShell("grep 'unterminated");

  assert.ok(result instanceof GuardBashUnterminatedQuoteError);
});
