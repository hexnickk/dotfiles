import {
  GuardBashCommandOptionNotAllowedError,
  GuardBashCommandOptionValueMissingError,
  GuardBashFindTokenNotAllowedError,
  type GuardBashApprovalRequiredError,
} from "./errors.ts";
import type { GuardBashParsedStage } from "./types.ts";
import { guardBashValidateGitStage } from "./validate-git.ts";

const SIMPLE_READONLY_COMMANDS = new Set([
  "basename",
  "cat",
  "cut",
  "dirname",
  "grep",
  "head",
  "ls",
  "pwd",
  "realpath",
  "stat",
  "tail",
  "uniq",
  "wc",
]);

const FIND_GLOBAL_OPTIONS = new Set(["-H", "-L", "-P"]);
const FIND_OPTIONS_WITH_VALUE = new Set([
  "-iname",
  "-ipath",
  "-maxdepth",
  "-mindepth",
  "-mmin",
  "-mtime",
  "-name",
  "-path",
  "-size",
  "-type",
]);
const FIND_OPTIONS_WITHOUT_VALUE = new Set(["-print", "-print0"]);
const FIND_DISALLOWED_OPTIONS = new Set([
  "-delete",
  "-exec",
  "-execdir",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-fls",
  "-ok",
  "-okdir",
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

// Validates a tiny readonly subset of find expressions.
function validateFind(stage: GuardBashParsedStage): GuardBashApprovalRequiredError | undefined {
  let index = 0;

  while (index < stage.args.length && FIND_GLOBAL_OPTIONS.has(stage.args[index] ?? "")) {
    index += 1;
  }

  while (index < stage.args.length) {
    const arg = stage.args[index];
    if (arg === undefined || arg.startsWith("-")) {
      break;
    }
    index += 1;
  }

  while (index < stage.args.length) {
    const arg = stage.args[index];
    if (arg === undefined) {
      break;
    }

    if (FIND_DISALLOWED_OPTIONS.has(arg)) {
      return new GuardBashCommandOptionNotAllowedError(
        `find ${arg} can mutate state or execute commands and therefore requires approval`,
      );
    }

    if (FIND_OPTIONS_WITHOUT_VALUE.has(arg)) {
      index += 1;
      continue;
    }

    if (FIND_OPTIONS_WITH_VALUE.has(arg)) {
      const value = stage.args[index + 1];
      if (value === undefined) {
        return new GuardBashCommandOptionValueMissingError(`find option ${arg} expects a value`);
      }
      index += 2;
      continue;
    }

    return new GuardBashFindTokenNotAllowedError(`find token ${arg} is outside the safe allowlist`);
  }

  return undefined;
}

const COMMAND_VALIDATORS = new Map<string, GuardBashValidator>([
  ...Array.from(SIMPLE_READONLY_COMMANDS, (command) => [command, validateSimpleReadonlyCommand] as const),
  ["fd", validateFd],
  ["find", validateFind],
  ["git", guardBashValidateGitStage],
  ["rg", validateRipgrep],
  ["sort", validateSort],
]);

// Returns the validator for an allowlisted command, if one exists.
export function guardBashGetCommandValidator(command: string): GuardBashValidator | undefined {
  return COMMAND_VALIDATORS.get(command);
}
