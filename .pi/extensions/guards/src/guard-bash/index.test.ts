import assert from "node:assert/strict";
import test from "node:test";

import {
  GuardBashApprovalRequiredError,
  GuardBashCommandNotAllowedError,
  GuardBashCommandOptionNotAllowedError,
  GuardBashSyntaxNotAllowedError,
} from "./errors.ts";
import { guardBashValidateCommand } from "./index.ts";
import { guardBashParseSafeCommandLine } from "./parse.ts";
import type { GuardBashParsedStage } from "./types.ts";

// Asserts that parsing succeeded and returns the parsed stages.
function assertParsed(result: GuardBashApprovalRequiredError | GuardBashParsedStage[]): GuardBashParsedStage[] {
  assert.ok(!(result instanceof GuardBashApprovalRequiredError));
  if (result instanceof GuardBashApprovalRequiredError) {
    assert.fail(result.message);
  }

  return result;
}

test("guardBashParseSafeCommandLine parses common pipelines and quoted arguments", () => {
  const parsed = assertParsed(guardBashParseSafeCommandLine("grep 'a|b' file.txt | sort"));

  assert.deepEqual(parsed, [
    { command: "grep", args: ["a|b", "file.txt"] },
    { command: "sort", args: [] },
  ]);
});

test("guardBashParseSafeCommandLine preserves empty quoted arguments", () => {
  const parsed = assertParsed(guardBashParseSafeCommandLine('grep "" file.txt'));

  assert.deepEqual(parsed, [{ command: "grep", args: ["", "file.txt"] }]);
});

test("guardBashValidateCommand auto-allows readonly pipelines", () => {
  const validationError = guardBashValidateCommand("ls -la | sort");

  assert.equal(validationError, undefined);
});

test("guardBashValidateCommand auto-allows safe find usage", () => {
  const validationError = guardBashValidateCommand("find src -type f -name '*.ts' | sort");

  assert.equal(validationError, undefined);
});

test("guardBashValidateCommand auto-allows git status", () => {
  const validationError = guardBashValidateCommand("git status");

  assert.equal(validationError, undefined);
});

test("guardBashValidateCommand auto-allows git status --short", () => {
  const validationError = guardBashValidateCommand("git status --short");

  assert.equal(validationError, undefined);
});

test("guardBashValidateCommand auto-allows safe git diff usage", () => {
  const validationError = guardBashValidateCommand("git diff --cached --stat HEAD -- src");

  assert.equal(validationError, undefined);
});

test("guardBashValidateCommand returns a typed error for unknown commands", () => {
  const validationError = guardBashValidateCommand("svn status");

  assert.ok(validationError instanceof GuardBashCommandNotAllowedError);
  if (!(validationError instanceof GuardBashCommandNotAllowedError)) return;
  assert.match(validationError.message, /not in the strict auto-allow list/);
});


test("guardBashValidateCommand returns a typed error for disallowed shell syntax", () => {
  const validationError = guardBashValidateCommand("pwd && ls");

  assert.ok(validationError instanceof GuardBashSyntaxNotAllowedError);
  if (!(validationError instanceof GuardBashSyntaxNotAllowedError)) return;
  assert.match(validationError.message, /outside the auto-allow subset/);
});

test("guardBashValidateCommand returns a typed error for dangerous find actions", () => {
  const validationError = guardBashValidateCommand("find . -delete");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /find -delete/);
});

test("guardBashValidateCommand returns a typed error for rg --pre", () => {
  const validationError = guardBashValidateCommand("rg TODO src --pre node");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /rg --pre/);
});

test("guardBashValidateCommand returns a typed error for unsupported git subcommands", () => {
  const validationError = guardBashValidateCommand("git checkout main");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /git checkout/);
});

test("guardBashValidateCommand returns a typed error for git global options", () => {
  const validationError = guardBashValidateCommand("git -c core.pager=cat diff");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /git global options/);
});

test("guardBashValidateCommand returns a typed error for git diff external helpers", () => {
  const validationError = guardBashValidateCommand("git diff --ext-diff");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /git diff --ext-diff/);
});

test("guardBashValidateCommand returns a typed error for git diff output files", () => {
  const validationError = guardBashValidateCommand("git diff --output patch.txt");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /git diff --output/);
});

test("guardBashValidateCommand returns a typed error for sort output options", () => {
  const validationError = guardBashValidateCommand("sort -o sorted.txt input.txt");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /sort -o/);
});

test("guardBashValidateCommand returns a typed error for sort helper programs", () => {
  const validationError = guardBashValidateCommand("sort --compress-program=gzip input.txt");

  assert.ok(validationError instanceof GuardBashCommandOptionNotAllowedError);
  if (!(validationError instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(validationError.message, /sort --compress-program/);
});

test("guardBashValidateCommand returns a typed error for newlines inside quotes", () => {
  const validationError = guardBashValidateCommand('grep "a\nb" file.txt');

  assert.ok(validationError instanceof GuardBashSyntaxNotAllowedError);
  if (!(validationError instanceof GuardBashSyntaxNotAllowedError)) return;
  assert.match(validationError.message, /newlines/);
});
