import {
  GuardBashEmptyCommandError,
  GuardBashInvalidPipelineError,
  GuardBashSyntaxNotAllowedError,
  GuardBashUnterminatedQuoteError,
  type GuardBashApprovalRequiredError,
} from "./errors.ts";
import type { GuardBashShellToken } from "./types.ts";

// Checks whether a character is a newline in the shell subset parser.
function isNewline(char: string): boolean {
  return char === "\n" || char === "\r";
}

// Creates a syntax error for shell features outside the strict auto-allow subset.
function syntaxError(message: string): GuardBashSyntaxNotAllowedError {
  return new GuardBashSyntaxNotAllowedError(message);
}

// Tokenizes a tiny shell subset and rejects syntax outside the auto-allow parser.
export function guardBashTokenizeSafeShell(input: string): GuardBashApprovalRequiredError | GuardBashShellToken[] {
  const tokens: GuardBashShellToken[] = [];
  let current = "";
  let tokenStarted = false;
  let mode: "normal" | "single" | "double" = "normal";

  const finishWord = () => {
    if (!tokenStarted) return;
    tokens.push({ type: "word", value: current });
    current = "";
    tokenStarted = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (mode === "single") {
      if (isNewline(char)) {
        return syntaxError("Multiple commands and newlines are outside the auto-allow subset");
      }

      if (char === "'") {
        mode = "normal";
      } else {
        current += char;
      }
      continue;
    }

    if (mode === "double") {
      if (isNewline(char)) {
        return syntaxError("Multiple commands and newlines are outside the auto-allow subset");
      }

      if (char === '"') {
        mode = "normal";
        continue;
      }

      if (char === "$" || char === "`") {
        return syntaxError("Variable and command expansion are outside the auto-allow subset");
      }

      if (char === "\\") {
        if (next === undefined) {
          return syntaxError("Trailing backslash is outside the auto-allow subset");
        }
        if (isNewline(next)) {
          return syntaxError("Multiple commands and newlines are outside the auto-allow subset");
        }

        current += next;
        tokenStarted = true;
        index += 1;
        continue;
      }

      current += char;
      tokenStarted = true;
      continue;
    }

    if (char === "'" || char === '"') {
      tokenStarted = true;
      mode = char === "'" ? "single" : "double";
      continue;
    }

    if (char === " " || char === "\t") {
      finishWord();
      continue;
    }

    if (char === "\\") {
      if (next === undefined) {
        return syntaxError("Trailing backslash is outside the auto-allow subset");
      }
      if (isNewline(next)) {
        return syntaxError("Multiple commands and newlines are outside the auto-allow subset");
      }

      current += next;
      tokenStarted = true;
      index += 1;
      continue;
    }

    if (char === "#" && !tokenStarted) {
      break;
    }

    if (char === "|") {
      finishWord();
      tokens.push({ type: "pipe" });
      continue;
    }

    if (isNewline(char)) {
      return syntaxError("Multiple commands and newlines are outside the auto-allow subset");
    }

    if (char === "&") {
      return syntaxError("Logical/background operators are outside the auto-allow subset");
    }

    if (char === ";") {
      return syntaxError("Command separators are outside the auto-allow subset");
    }

    if (char === "<" || char === ">") {
      return syntaxError("Redirections are outside the auto-allow subset");
    }

    if (char === "$" || char === "`") {
      return syntaxError("Variable and command expansion are outside the auto-allow subset");
    }

    if (char === "(" || char === ")" || char === "{" || char === "}") {
      return syntaxError("Grouping and subshell syntax are outside the auto-allow subset");
    }

    if (char === "~" && !tokenStarted) {
      return syntaxError("This command uses shell expansion or syntax outside the auto-allow subset");
    }

    if (char === "*" || char === "?" || char === "[" || char === "]" || char === "!") {
      return syntaxError("This command uses shell expansion or syntax outside the auto-allow subset");
    }

    current += char;
    tokenStarted = true;
  }

  if (mode !== "normal") {
    return new GuardBashUnterminatedQuoteError("Unterminated quote");
  }

  finishWord();

  if (tokens.length === 0) {
    return new GuardBashEmptyCommandError("Empty command");
  }

  if (tokens[0]?.type === "pipe" || tokens.at(-1)?.type === "pipe") {
    return new GuardBashInvalidPipelineError("Pipelines must have a command on both sides of |");
  }

  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index]?.type === "pipe" && tokens[index - 1]?.type === "pipe") {
      return new GuardBashInvalidPipelineError("Pipelines must have a command between | operators");
    }
  }

  return tokens;
}
