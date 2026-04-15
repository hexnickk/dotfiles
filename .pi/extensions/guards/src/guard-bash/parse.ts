import { guardBashTokenizeSafeShell } from "./tokenize.ts";
import type { GuardBashParsedStage, GuardBashParseResult } from "./types.ts";

// Checks whether a token starts with a shell-style env assignment.
function isShellAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

// Parses a strict shell subset into pipeline stages for auto-allow decisions.
export function guardBashParseSafeCommandLine(input: string): GuardBashParseResult {
  const tokenized = guardBashTokenizeSafeShell(input);
  if (!tokenized.ok) {
    return tokenized;
  }

  const stages: GuardBashParsedStage[] = [];
  let words: string[] = [];

  const pushStage = (): GuardBashParseResult | undefined => {
    if (words.length === 0) {
      return { ok: false, reason: "Empty pipeline stage" };
    }

    const [command, ...args] = words;
    if (isShellAssignment(command)) {
      return { ok: false, reason: "Environment variable assignments are outside the auto-allow subset" };
    }

    if (command.includes("/")) {
      return { ok: false, reason: "Command paths are outside the auto-allow subset" };
    }

    stages.push({ command, args });
    words = [];
    return undefined;
  };

  for (const token of tokenized.tokens) {
    if (token.type === "pipe") {
      const error = pushStage();
      if (error) return error;
      continue;
    }

    words.push(token.value);
  }

  const error = pushStage();
  if (error) return error;

  return { ok: true, stages };
}
