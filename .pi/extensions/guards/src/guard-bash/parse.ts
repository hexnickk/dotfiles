import {
  GuardBashApprovalRequiredError,
  GuardBashCommandPathNotAllowedError,
  GuardBashEnvironmentAssignmentNotAllowedError,
  GuardBashInvalidPipelineError,
} from "./errors.ts";
import { guardBashTokenizeSafeShell } from "./tokenize.ts";
import type { GuardBashParsedStage } from "./types.ts";

// Checks whether a token starts with a shell-style env assignment.
function isShellAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

// Parses a strict shell subset into pipeline stages for auto-allow decisions.
export function guardBashParseSafeCommandLine(input: string): GuardBashApprovalRequiredError | GuardBashParsedStage[] {
  const tokenized = guardBashTokenizeSafeShell(input);
  if (tokenized instanceof GuardBashApprovalRequiredError) {
    return tokenized;
  }

  const stages: GuardBashParsedStage[] = [];
  let words: string[] = [];

  const pushStage = (): GuardBashApprovalRequiredError | undefined => {
    if (words.length === 0) {
      return new GuardBashInvalidPipelineError("Empty pipeline stage");
    }

    const [command, ...args] = words;
    if (isShellAssignment(command)) {
      return new GuardBashEnvironmentAssignmentNotAllowedError(
        "Environment variable assignments are outside the auto-allow subset",
      );
    }

    if (command.includes("/")) {
      return new GuardBashCommandPathNotAllowedError("Command paths are outside the auto-allow subset");
    }

    stages.push({ command, args });
    words = [];
    return undefined;
  };

  for (const token of tokenized) {
    if (token.type === "pipe") {
      const error = pushStage();
      if (error !== undefined) return error;
      continue;
    }

    words.push(token.value);
  }

  const error = pushStage();
  if (error !== undefined) return error;

  return stages;
}
