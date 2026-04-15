import assert from "node:assert/strict";
import test from "node:test";

import {
  guardBashEvaluateCommand,
  guardBashFormatParsedStages,
  guardBashParseSafeCommandLine,
} from "./index.ts";

test("guardBashParseSafeCommandLine parses common pipelines and quoted arguments", () => {
  const parsed = guardBashParseSafeCommandLine("grep 'a|b' file.txt | sort");

  assert.deepEqual(parsed, {
    ok: true,
    stages: [
      { command: "grep", args: ["a|b", "file.txt"] },
      { command: "sort", args: [] },
    ],
  });
});

test("guardBashParseSafeCommandLine preserves empty quoted arguments", () => {
  const parsed = guardBashParseSafeCommandLine('grep "" file.txt');

  assert.deepEqual(parsed, {
    ok: true,
    stages: [{ command: "grep", args: ["", "file.txt"] }],
  });
});

test("guardBashEvaluateCommand auto-allows readonly pipelines", () => {
  const decision = guardBashEvaluateCommand("ls -la | sort");

  assert.equal(decision.autoAllow, true);
  if (decision.autoAllow) {
    assert.deepEqual(decision.stages, [
      { command: "ls", args: ["-la"] },
      { command: "sort", args: [] },
    ]);
  }
});

test("guardBashEvaluateCommand auto-allows safe find usage", () => {
  const decision = guardBashEvaluateCommand("find src -type f -name '*.ts' | sort");

  assert.equal(decision.autoAllow, true);
  if (decision.autoAllow) {
    assert.equal(guardBashFormatParsedStages(decision.stages), "find | sort");
  }
});

test("guardBashEvaluateCommand requires approval for unknown commands", () => {
  const decision = guardBashEvaluateCommand("git status");

  assert.equal(decision.autoAllow, false);
  if (!decision.autoAllow) {
    assert.match(decision.reason, /not in the strict auto-allow list/);
    assert.equal(guardBashFormatParsedStages(decision.stages), "git");
  }
});

test("guardBashEvaluateCommand requires approval for disallowed shell syntax", () => {
  const decision = guardBashEvaluateCommand("pwd && ls");

  assert.equal(decision.autoAllow, false);
  if (!decision.autoAllow) {
    assert.match(decision.reason, /outside the auto-allow subset/);
    assert.equal(guardBashFormatParsedStages(decision.stages), "Unable to safely parse command");
  }
});

test("guardBashEvaluateCommand requires approval for dangerous find actions", () => {
  const decision = guardBashEvaluateCommand("find . -delete");

  assert.equal(decision.autoAllow, false);
  if (!decision.autoAllow) {
    assert.match(decision.reason, /find -delete/);
    assert.equal(guardBashFormatParsedStages(decision.stages), "find");
  }
});

test("guardBashEvaluateCommand requires approval for rg --pre", () => {
  const decision = guardBashEvaluateCommand("rg TODO src --pre node");

  assert.equal(decision.autoAllow, false);
  if (!decision.autoAllow) {
    assert.match(decision.reason, /rg --pre/);
    assert.equal(guardBashFormatParsedStages(decision.stages), "rg");
  }
});

test("guardBashEvaluateCommand requires approval for sort output options", () => {
  const decision = guardBashEvaluateCommand("sort -o sorted.txt input.txt");

  assert.equal(decision.autoAllow, false);
  if (!decision.autoAllow) {
    assert.match(decision.reason, /sort -o/);
    assert.equal(guardBashFormatParsedStages(decision.stages), "sort");
  }
});

test("guardBashEvaluateCommand requires approval for sort helper programs", () => {
  const decision = guardBashEvaluateCommand("sort --compress-program=gzip input.txt");

  assert.equal(decision.autoAllow, false);
  if (!decision.autoAllow) {
    assert.match(decision.reason, /sort --compress-program/);
    assert.equal(guardBashFormatParsedStages(decision.stages), "sort");
  }
});

test("guardBashEvaluateCommand requires approval for newlines inside quotes", () => {
  const decision = guardBashEvaluateCommand('grep "a\nb" file.txt');

  assert.equal(decision.autoAllow, false);
  if (!decision.autoAllow) {
    assert.match(decision.reason, /newlines/);
  }
});
