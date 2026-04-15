import {
  GuardBashCommandOptionNotAllowedError,
  GuardBashCommandOptionValueMissingError,
  type GuardBashApprovalRequiredError,
} from "./errors.ts";
import type { GuardBashParsedStage } from "./types.ts";

const GIT_STATUS_FLAGS = new Set(["--short", "-s"]);

// Validates the tiny readonly git subset allowed without extra approval.
function validateStatus(args: string[]): GuardBashApprovalRequiredError | undefined {
  if (args.length === 0) {
    return undefined;
  }

  if (args.length === 1 && GIT_STATUS_FLAGS.has(args[0] ?? "")) {
    return undefined;
  }

  return new GuardBashCommandOptionNotAllowedError(
    "Only git status and git status --short are auto-allowed",
  );
}

// Validates git diff while blocking file output and external helper execution.
function validateDiff(args: string[]): GuardBashApprovalRequiredError | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }

    if (arg === "--output") {
      const value = args[index + 1];
      if (value === undefined) {
        return new GuardBashCommandOptionValueMissingError("git diff option --output expects a value");
      }

      return new GuardBashCommandOptionNotAllowedError(
        "git diff --output can write files and therefore requires approval",
      );
    }

    if (arg.startsWith("--output=")) {
      return new GuardBashCommandOptionNotAllowedError(
        "git diff --output can write files and therefore requires approval",
      );
    }

    if (arg === "--ext-diff") {
      return new GuardBashCommandOptionNotAllowedError(
        "git diff --ext-diff can execute external commands and therefore requires approval",
      );
    }

    if (arg === "--textconv") {
      return new GuardBashCommandOptionNotAllowedError(
        "git diff --textconv can execute external commands and therefore requires approval",
      );
    }
  }

  return undefined;
}

// Validates git subcommands that are safe to auto-allow.
export function guardBashValidateGitStage(stage: GuardBashParsedStage): GuardBashApprovalRequiredError | undefined {
  const [subcommand, ...args] = stage.args;
  if (subcommand === undefined) {
    return new GuardBashCommandOptionNotAllowedError(
      "git requires a subcommand and only a tiny readonly subset is auto-allowed",
    );
  }

  if (subcommand.startsWith("-")) {
    return new GuardBashCommandOptionNotAllowedError(
      "git global options are outside the auto-allow subset",
    );
  }

  if (subcommand === "status") {
    return validateStatus(args);
  }

  if (subcommand === "diff") {
    return validateDiff(args);
  }

  return new GuardBashCommandOptionNotAllowedError(
    `git ${subcommand} is not in the strict auto-allow list`,
  );
}
