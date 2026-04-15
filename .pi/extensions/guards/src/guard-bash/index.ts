import { guardBashParseSafeCommandLine } from "./parse.ts";
import { guardBashGetCommandValidator } from "./validate.ts";
import type { GuardBashDecision, GuardBashParsedStage } from "./types.ts";

export type {
  GuardBashDecision,
  GuardBashParsedStage,
  GuardBashParseResult,
  GuardBashShellToken,
  GuardBashValidationResult,
  GuardBashValidator,
} from "./types.ts";
export { guardBashParseSafeCommandLine } from "./parse.ts";

// Decides whether a bash command can run without extra user confirmation.
export function guardBashEvaluateCommand(commandLine: string): GuardBashDecision {
  const parsed = guardBashParseSafeCommandLine(commandLine);
  if (!parsed.ok) {
    return { autoAllow: false, reason: parsed.reason };
  }

  for (const stage of parsed.stages) {
    const validator = guardBashGetCommandValidator(stage.command);
    if (validator === undefined) {
      return {
        autoAllow: false,
        reason: `Command ${stage.command} is not in the strict auto-allow list`,
        stages: parsed.stages,
      };
    }

    const validation = validator(stage);
    if (!validation.ok) {
      return { autoAllow: false, reason: validation.reason, stages: parsed.stages };
    }
  }

  return { autoAllow: true, stages: parsed.stages };
}

// Formats parsed stages for UI messages shown during approval prompts.
export function guardBashFormatParsedStages(stages: GuardBashParsedStage[] | undefined): string {
  if (stages === undefined || stages.length === 0) {
    return "Unable to safely parse command";
  }

  return stages.map((stage) => stage.command).join(" | ");
}
