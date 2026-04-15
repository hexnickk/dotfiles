import { GuardBashApprovalRequiredError, GuardBashCommandNotAllowedError } from "./errors.ts";
import { guardBashParseSafeCommandLine } from "./parse.ts";
import { guardBashGetCommandValidator } from "./validate.ts";

// Validates whether a bash command can run without extra user confirmation.
// Returns a typed error when the command falls outside the auto-allow subset.
export function guardBashValidateCommand(command: string): GuardBashApprovalRequiredError | undefined {
  const parsed = guardBashParseSafeCommandLine(command);
  if (parsed instanceof GuardBashApprovalRequiredError) {
    return parsed;
  }

  for (const stage of parsed) {
    const validator = guardBashGetCommandValidator(stage.command);
    if (validator === undefined) {
      return new GuardBashCommandNotAllowedError(
        `Command ${stage.command} is not in the strict auto-allow list`,
      );
    }

    const validationError = validator(stage);
    if (validationError !== undefined) {
      return validationError;
    }
  }

  return undefined;
}

