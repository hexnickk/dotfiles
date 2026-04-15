import {
  GuardBashCommandOptionNotAllowedError,
  type GuardBashApprovalRequiredError,
} from "./errors.ts";
import type { GuardBashParsedStage } from "./types.ts";
import { guardBashValidateFindStage } from "./validate-find.ts";
import { guardBashValidateGitStage } from "./validate-git.ts";

const SIMPLE_READONLY_COMMANDS = new Set([
  "basename",
  "cat",
  "cut",
  "dirname",
  "du",
  "grep",
  "head",
  "ls",
  "pwd",
  "readlink",
  "realpath",
  "stat",
  "tail",
  "uniq",
  "wc",
]);

type GuardBashValidator = (stage: GuardBashParsedStage) => GuardBashApprovalRequiredError | undefined;

// Accepts readonly commands whose risk is already handled by the shell parser.
function validateSimpleReadonlyCommand(): undefined {
  return undefined;
}

// Blocks rg features that can spawn external preprocessors.
function validateRipgrep(stage: GuardBashParsedStage): GuardBashApprovalRequiredError | undefined {
  for (const arg of stage.args) {
    if (arg === "--pre" || arg.startsWith("--pre=")) {
      return new GuardBashCommandOptionNotAllowedError(
        "rg --pre can execute external commands and therefore requires approval",
      );
    }
  }

  return undefined;
}

// Blocks fd features that can execute commands for each match.
function validateFd(stage: GuardBashParsedStage): GuardBashApprovalRequiredError | undefined {
  for (const arg of stage.args) {
    if (
      arg === "-x"
      || arg === "-X"
      || arg === "--exec"
      || arg === "--exec-batch"
      || arg.startsWith("--exec=")
      || arg.startsWith("--exec-batch=")
    ) {
      return new GuardBashCommandOptionNotAllowedError(
        "fd exec options can run external commands and therefore require approval",
      );
    }
  }

  return undefined;
}

// Blocks sort options that can write files or execute helper programs.
function validateSort(stage: GuardBashParsedStage): GuardBashApprovalRequiredError | undefined {
  for (const arg of stage.args) {
    if (arg === "-o" || (arg.startsWith("-o") && !arg.startsWith("--"))) {
      return new GuardBashCommandOptionNotAllowedError(
        "sort -o can write output files and therefore requires approval",
      );
    }

    if (arg === "--output" || arg.startsWith("--output=")) {
      return new GuardBashCommandOptionNotAllowedError(
        "sort --output can write output files and therefore requires approval",
      );
    }

    if (arg === "--compress-program" || arg.startsWith("--compress-program=")) {
      return new GuardBashCommandOptionNotAllowedError(
        "sort --compress-program can execute external commands and therefore requires approval",
      );
    }
  }

  return undefined;
}

const COMMAND_VALIDATORS = new Map<string, GuardBashValidator>([
  ...Array.from(SIMPLE_READONLY_COMMANDS, (command) => [command, validateSimpleReadonlyCommand] as const),
  ["fd", validateFd],
  ["find", guardBashValidateFindStage],
  ["git", guardBashValidateGitStage],
  ["rg", validateRipgrep],
  ["sort", validateSort],
]);

// Returns the validator for an allowlisted command, if one exists.
export function guardBashGetCommandValidator(command: string): GuardBashValidator | undefined {
  return COMMAND_VALIDATORS.get(command);
}
