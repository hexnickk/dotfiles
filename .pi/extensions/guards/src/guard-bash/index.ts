import { GuardBashApprovalRequiredError, GuardBashCommandNotAllowedError } from "./errors.ts";
import { guardBashParseSafeCommandLine } from "./parse.ts";
import { guardBashGetCommandValidator } from "./validate.ts";
import type { GuardBashAllowedCommand, GuardBashParsedStage } from "./types.ts";

export {
  GuardBashApprovalRequiredError,
  GuardBashCommandNotAllowedError,
  GuardBashCommandOptionNotAllowedError,
  GuardBashCommandOptionValueMissingError,
  GuardBashCommandPathNotAllowedError,
  GuardBashEmptyCommandError,
  GuardBashEnvironmentAssignmentNotAllowedError,
  GuardBashFindTokenNotAllowedError,
  GuardBashInvalidPipelineError,
  GuardBashSyntaxNotAllowedError,
  GuardBashUnterminatedQuoteError,
} from "./errors.ts";
export type { GuardBashAllowedCommand, GuardBashParsedStage, GuardBashShellToken } from "./types.ts";
export { guardBashParseSafeCommandLine } from "./parse.ts";

// Decides whether a bash command can run without extra user confirmation.
export function guardBashEvaluateCommand(commandLine: string): GuardBashAllowedCommand | GuardBashApprovalRequiredError {
  const parsed = guardBashParseSafeCommandLine(commandLine);
  if (parsed instanceof GuardBashApprovalRequiredError) {
    return parsed;
  }

  for (const stage of parsed) {
    const validator = guardBashGetCommandValidator(stage.command);
    if (validator === undefined) {
      return new GuardBashCommandNotAllowedError(
        `Command ${stage.command} is not in the strict auto-allow list`,
        parsed,
      );
    }

    const error = validator(stage);
    if (error !== undefined) {
      error.stages ??= parsed;
      return error;
    }
  }

  return { stages: parsed };
}

// Formats parsed stages for UI messages shown during approval prompts.
export function guardBashFormatParsedStages(stages: GuardBashParsedStage[] | undefined): string {
  if (stages === undefined || stages.length === 0) {
    return "Unable to safely parse command";
  }

  return stages.map((stage) => stage.command).join(" | ");
}
