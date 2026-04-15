import {
  GuardBashCommandOptionNotAllowedError,
  GuardBashCommandOptionValueMissingError,
  GuardBashFindExpressionInvalidError,
  GuardBashFindTokenNotAllowedError,
  type GuardBashApprovalRequiredError,
} from "./errors.ts";
import type { GuardBashParsedStage } from "./types.ts";

const FIND_GLOBAL_OPTIONS = new Set(["-H", "-L", "-P"]);
const FIND_PRIMARY_OPTIONS_WITH_VALUE = new Set([
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
const FIND_PRIMARY_OPTIONS_WITHOUT_VALUE = new Set(["-print", "-print0", "-prune"]);
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

type FindParseState = {
  tokens: string[];
  index: number;
};

// Checks whether a token starts the find expression instead of another search path.
function isFindExpressionToken(token: string): boolean {
  return token === "(" || token === ")" || token.startsWith("-");
}

// Returns the current token without consuming it.
function peek(state: FindParseState): string | undefined {
  return state.tokens[state.index];
}

// Consumes one token from the expression parser.
function take(state: FindParseState): string | undefined {
  const token = state.tokens[state.index];
  state.index += 1;
  return token;
}

// Creates a typed error for invalid readonly find expressions.
function invalidFindExpression(message: string): GuardBashFindExpressionInvalidError {
  return new GuardBashFindExpressionInvalidError(message);
}

// Parses one safe primary such as -name value, -print, or a parenthesized group.
function parsePrimary(state: FindParseState): GuardBashApprovalRequiredError | undefined {
  const token = peek(state);
  if (token === undefined) {
    return invalidFindExpression("find expression ended unexpectedly");
  }

  if (token === "(") {
    take(state);
    const error = parseOrExpression(state);
    if (error !== undefined) return error;

    if (take(state) !== ")") {
      return invalidFindExpression("find is missing a closing )");
    }

    return undefined;
  }

  if (token === ")") {
    return invalidFindExpression("find has an unexpected )");
  }

  if (FIND_DISALLOWED_OPTIONS.has(token)) {
    return new GuardBashCommandOptionNotAllowedError(
      `find ${token} can mutate state or execute commands and therefore requires approval`,
    );
  }

  if (FIND_PRIMARY_OPTIONS_WITHOUT_VALUE.has(token)) {
    take(state);
    return undefined;
  }

  if (FIND_PRIMARY_OPTIONS_WITH_VALUE.has(token)) {
    take(state);
    const value = take(state);
    if (value === undefined) {
      return new GuardBashCommandOptionValueMissingError(`find option ${token} expects a value`);
    }

    return undefined;
  }

  return new GuardBashFindTokenNotAllowedError(`find token ${token} is outside the safe allowlist`);
}

// Parses unary operators such as -not before a safe primary.
function parseUnary(state: FindParseState): GuardBashApprovalRequiredError | undefined {
  const token = peek(state);
  if (token === "-not") {
    take(state);
    return parseUnary(state);
  }

  return parsePrimary(state);
}

// Parses implicit and explicit conjunctions between safe operands.
function parseAndExpression(state: FindParseState): GuardBashApprovalRequiredError | undefined {
  const firstError = parseUnary(state);
  if (firstError !== undefined) return firstError;

  while (true) {
    const token = peek(state);
    if (token === undefined || token === ")" || token === "-o") {
      return undefined;
    }

    if (token === "-a") {
      take(state);
    }

    const nextError = parseUnary(state);
    if (nextError !== undefined) return nextError;
  }
}

// Parses readonly find expressions with grouping and boolean operators.
function parseOrExpression(state: FindParseState): GuardBashApprovalRequiredError | undefined {
  const firstError = parseAndExpression(state);
  if (firstError !== undefined) return firstError;

  while (peek(state) === "-o") {
    take(state);
    const nextError = parseAndExpression(state);
    if (nextError !== undefined) return nextError;
  }

  return undefined;
}

// Validates a readonly subset of find, including grouped boolean expressions.
export function guardBashValidateFindStage(stage: GuardBashParsedStage): GuardBashApprovalRequiredError | undefined {
  let index = 0;

  while (FIND_GLOBAL_OPTIONS.has(stage.args[index] ?? "")) {
    index += 1;
  }

  while (index < stage.args.length) {
    const token = stage.args[index];
    if (token === undefined || isFindExpressionToken(token)) {
      break;
    }
    index += 1;
  }

  if (index >= stage.args.length) {
    return undefined;
  }

  const state: FindParseState = { tokens: stage.args, index };
  const error = parseOrExpression(state);
  if (error !== undefined) return error;

  if (state.index !== stage.args.length) {
    return invalidFindExpression(`find token ${stage.args[state.index]} is not in a valid position`);
  }

  return undefined;
}
