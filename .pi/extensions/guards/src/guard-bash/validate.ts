import type {
  GuardBashParsedStage,
  GuardBashValidationResult,
  GuardBashValidator,
} from "./types.ts";

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

// Returns a successful validation result.
function ok(): GuardBashValidationResult {
  return { ok: true };
}

// Returns a rejected validation result with a user-facing reason.
function fail(reason: string): GuardBashValidationResult {
  return { ok: false, reason };
}

// Accepts readonly commands whose risk is already handled by the shell parser.
function validateSimpleReadonlyCommand(_stage: GuardBashParsedStage): GuardBashValidationResult {
  return ok();
}

// Blocks rg features that can spawn external preprocessors.
function validateRipgrep(stage: GuardBashParsedStage): GuardBashValidationResult {
  for (const arg of stage.args) {
    if (arg === "--pre" || arg.startsWith("--pre=")) {
      return fail("rg --pre can execute external commands and therefore requires approval");
    }
  }

  return ok();
}

// Blocks fd features that can execute commands for each match.
function validateFd(stage: GuardBashParsedStage): GuardBashValidationResult {
  for (const arg of stage.args) {
    if (
      arg === "-x"
      || arg === "-X"
      || arg === "--exec"
      || arg === "--exec-batch"
      || arg.startsWith("--exec=")
      || arg.startsWith("--exec-batch=")
    ) {
      return fail("fd exec options can run external commands and therefore require approval");
    }
  }

  return ok();
}

// Blocks sort options that can write files or execute helper programs.
function validateSort(stage: GuardBashParsedStage): GuardBashValidationResult {
  for (const arg of stage.args) {
    if (arg === "-o" || (arg.startsWith("-o") && !arg.startsWith("--"))) {
      return fail("sort -o can write output files and therefore requires approval");
    }

    if (arg === "--output" || arg.startsWith("--output=")) {
      return fail("sort --output can write output files and therefore requires approval");
    }

    if (arg === "--compress-program" || arg.startsWith("--compress-program=")) {
      return fail("sort --compress-program can execute external commands and therefore requires approval");
    }
  }

  return ok();
}

// Validates a tiny readonly subset of find expressions.
function validateFind(stage: GuardBashParsedStage): GuardBashValidationResult {
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
      return fail(`find ${arg} can mutate state or execute commands and therefore requires approval`);
    }

    if (FIND_OPTIONS_WITHOUT_VALUE.has(arg)) {
      index += 1;
      continue;
    }

    if (FIND_OPTIONS_WITH_VALUE.has(arg)) {
      const value = stage.args[index + 1];
      if (value === undefined) {
        return fail(`find option ${arg} expects a value`);
      }
      index += 2;
      continue;
    }

    return fail(`find token ${arg} is outside the safe allowlist`);
  }

  return ok();
}

const COMMAND_VALIDATORS = new Map<string, GuardBashValidator>([
  ...Array.from(SIMPLE_READONLY_COMMANDS, (command) => [command, validateSimpleReadonlyCommand] as const),
  ["fd", validateFd],
  ["find", validateFind],
  ["rg", validateRipgrep],
  ["sort", validateSort],
]);

// Returns the validator for an allowlisted command, if one exists.
export function guardBashGetCommandValidator(command: string): GuardBashValidator | undefined {
  return COMMAND_VALIDATORS.get(command);
}
