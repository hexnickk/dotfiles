import assert from "node:assert/strict";
import test from "node:test";

import {
  GuardBashApprovalRequiredError,
  GuardBashCommandNotAllowedError,
  GuardBashCommandOptionNotAllowedError,
  GuardBashSyntaxNotAllowedError,
  guardBashEvaluateCommand,
  guardBashFormatParsedStages,
  guardBashParseSafeCommandLine,
} from "./index.ts";
import type { GuardBashParsedStage } from "./index.ts";

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

test("guardBashEvaluateCommand auto-allows readonly pipelines", () => {
  const decision = guardBashEvaluateCommand("ls -la | sort");

  assert.ok(!(decision instanceof GuardBashApprovalRequiredError));
  if (decision instanceof GuardBashApprovalRequiredError) return;
  assert.deepEqual(decision.stages, [
    { command: "ls", args: ["-la"] },
    { command: "sort", args: [] },
  ]);
});

test("guardBashEvaluateCommand auto-allows safe find usage", () => {
  const decision = guardBashEvaluateCommand("find src -type f -name '*.ts' | sort");

  assert.ok(!(decision instanceof GuardBashApprovalRequiredError));
  if (decision instanceof GuardBashApprovalRequiredError) return;
  assert.equal(guardBashFormatParsedStages(decision.stages), "find | sort");
});

test("guardBashEvaluateCommand returns a typed error for unknown commands", () => {
  const decision = guardBashEvaluateCommand("git status");

  assert.ok(decision instanceof GuardBashCommandNotAllowedError);
  if (!(decision instanceof GuardBashCommandNotAllowedError)) return;
  assert.match(decision.message, /not in the strict auto-allow list/);
  assert.equal(guardBashFormatParsedStages(decision.stages), "git");
});

test("guardBashEvaluateCommand returns a typed error for disallowed shell syntax", () => {
  const decision = guardBashEvaluateCommand("pwd && ls");

  assert.ok(decision instanceof GuardBashSyntaxNotAllowedError);
  if (!(decision instanceof GuardBashSyntaxNotAllowedError)) return;
  assert.match(decision.message, /outside the auto-allow subset/);
  assert.equal(guardBashFormatParsedStages(decision.stages), "Unable to safely parse command");
});

test("guardBashEvaluateCommand returns a typed error for dangerous find actions", () => {
  const decision = guardBashEvaluateCommand("find . -delete");

  assert.ok(decision instanceof GuardBashCommandOptionNotAllowedError);
  if (!(decision instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(decision.message, /find -delete/);
  assert.equal(guardBashFormatParsedStages(decision.stages), "find");
});

test("guardBashEvaluateCommand returns a typed error for rg --pre", () => {
  const decision = guardBashEvaluateCommand("rg TODO src --pre node");

  assert.ok(decision instanceof GuardBashCommandOptionNotAllowedError);
  if (!(decision instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(decision.message, /rg --pre/);
  assert.equal(guardBashFormatParsedStages(decision.stages), "rg");
});

test("guardBashEvaluateCommand returns a typed error for sort output options", () => {
  const decision = guardBashEvaluateCommand("sort -o sorted.txt input.txt");

  assert.ok(decision instanceof GuardBashCommandOptionNotAllowedError);
  if (!(decision instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(decision.message, /sort -o/);
  assert.equal(guardBashFormatParsedStages(decision.stages), "sort");
});

test("guardBashEvaluateCommand returns a typed error for sort helper programs", () => {
  const decision = guardBashEvaluateCommand("sort --compress-program=gzip input.txt");

  assert.ok(decision instanceof GuardBashCommandOptionNotAllowedError);
  if (!(decision instanceof GuardBashCommandOptionNotAllowedError)) return;
  assert.match(decision.message, /sort --compress-program/);
  assert.equal(guardBashFormatParsedStages(decision.stages), "sort");
});

test("guardBashEvaluateCommand returns a typed error for newlines inside quotes", () => {
  const decision = guardBashEvaluateCommand('grep "a\nb" file.txt');

  assert.ok(decision instanceof GuardBashSyntaxNotAllowedError);
  if (!(decision instanceof GuardBashSyntaxNotAllowedError)) return;
  assert.match(decision.message, /newlines/);
});
