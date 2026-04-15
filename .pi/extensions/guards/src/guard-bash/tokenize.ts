import type { GuardBashShellToken } from "./types.ts";

type TokenizeResult =
  | { ok: true; tokens: GuardBashShellToken[] }
  | { ok: false; reason: string };

// Returns a rejected tokenize result with a user-facing reason.
function fail(reason: string): TokenizeResult {
  return { ok: false, reason };
}

// Appends the current word token when at least one character was seen.
function pushWord(tokens: GuardBashShellToken[], current: string, tokenStarted: boolean): string {
  if (tokenStarted) {
    tokens.push({ type: "word", value: current });
  }

  return "";
}

// Tokenizes a tiny shell subset and rejects syntax outside the auto-allow parser.
export function guardBashTokenizeSafeShell(input: string): TokenizeResult {
  const tokens: GuardBashShellToken[] = [];
  let current = "";
  let tokenStarted = false;
  let mode: "normal" | "single" | "double" = "normal";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (mode === "single") {
      if (char === "\n" || char === "\r") {
        return fail("Multiple commands and newlines are outside the auto-allow subset");
      }

      if (char === "'") {
        mode = "normal";
      } else {
        current += char;
      }
      continue;
    }

    if (mode === "double") {
      if (char === "\n" || char === "\r") {
        return fail("Multiple commands and newlines are outside the auto-allow subset");
      }

      if (char === '"') {
        mode = "normal";
        continue;
      }

      if (char === "$" || char === "`") {
        return fail("Variable and command expansion are outside the auto-allow subset");
      }

      if (char === "\\") {
        if (next === undefined) {
          return fail("Trailing backslash is outside the auto-allow subset");
        }
        if (next === "\n") {
          index += 1;
          continue;
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
      current = pushWord(tokens, current, tokenStarted);
      tokenStarted = false;
      continue;
    }

    if (char === "\\") {
      if (next === undefined) {
        return fail("Trailing backslash is outside the auto-allow subset");
      }
      if (next === "\n") {
        index += 1;
        continue;
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
      current = pushWord(tokens, current, tokenStarted);
      tokenStarted = false;
      tokens.push({ type: "pipe" });
      continue;
    }

    if (char === "\n" || char === "\r") {
      return fail("Multiple commands and newlines are outside the auto-allow subset");
    }

    if (char === "&") {
      return fail("Logical/background operators are outside the auto-allow subset");
    }

    if (char === ";") {
      return fail("Command separators are outside the auto-allow subset");
    }

    if (char === "<" || char === ">") {
      return fail("Redirections are outside the auto-allow subset");
    }

    if (char === "$" || char === "`") {
      return fail("Variable and command expansion are outside the auto-allow subset");
    }

    if (char === "(" || char === ")" || char === "{" || char === "}") {
      return fail("Grouping and subshell syntax are outside the auto-allow subset");
    }

    if (char === "*" || char === "?" || char === "[" || char === "]" || char === "~" || char === "!") {
      return fail("This command uses shell expansion or syntax outside the auto-allow subset");
    }

    current += char;
    tokenStarted = true;
  }

  current = pushWord(tokens, current, tokenStarted);
  void current;

  if (mode !== "normal") {
    return fail("Unterminated quote");
  }

  if (tokens.length === 0) {
    return fail("Empty command");
  }

  if (tokens[0]?.type === "pipe" || tokens[tokens.length - 1]?.type === "pipe") {
    return fail("Pipelines must have a command on both sides of |");
  }

  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index]?.type === "pipe" && tokens[index - 1]?.type === "pipe") {
      return fail("Pipelines must have a command between | operators");
    }
  }

  return { ok: true, tokens };
}
