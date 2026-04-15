export type GuardBashShellToken =
  | { type: "word"; value: string }
  | { type: "pipe" };

export type GuardBashParsedStage = {
  command: string;
  args: string[];
};

export type GuardBashParseResult =
  | { ok: true; stages: GuardBashParsedStage[] }
  | { ok: false; reason: string };

export type GuardBashValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export type GuardBashDecision =
  | { autoAllow: true; stages: GuardBashParsedStage[] }
  | { autoAllow: false; reason: string; stages?: GuardBashParsedStage[] };

export type GuardBashValidator = (stage: GuardBashParsedStage) => GuardBashValidationResult;
