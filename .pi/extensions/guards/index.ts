import type { ExecResult, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { bashToolsCreateDangerousBashTool, bashToolsCreateSandboxBashTool } from "./src/bash-tools/index.ts";
import {
  sandboxDetectLinuxInstallCommand,
  sandboxLinuxBubblewrapManualGuidance,
  sandboxLinuxHasBubblewrap,
} from "./src/sandbox/index.ts";

const STALE_BASH_BLOCK_REASON =
  "Use sandbox_bash for sandboxed commands or dangerous_bash for confirmed host commands.";
const GUARD_BASH_TOOLS = ["sandbox_bash", "dangerous_bash"] as const;
const TOOL_GUIDANCE =
  "Guard bash mode: use sandbox_bash for normal shell commands that do not need host filesystem writes. Use dangerous_bash only for intentional host filesystem writes or host-side side effects after confirmation.";

type GuardsDeps = {
  platform?: NodeJS.Platform;
  ensureLinuxBubblewrap?: (ctx: ExtensionContext, pi: ExtensionAPI) => Promise<void>;
};

// Registers the guards extension with optional dependency overrides used by tests.
// Input is Pi's extension API. Output is void. Side effects: registers flags, tools, and event handlers.
export function guardsRegister(pi: ExtensionAPI, deps: GuardsDeps = {}): void {
  let yoloEnabled = false;
  let guardToolsActive = false;
  let toolsRegistered = false;

  pi.registerFlag("yolo", {
    description: "Enable 'Yolo' mode, which bypasses guard tool replacement and uses regular host bash.",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", async (_event, ctx) => {
    yoloEnabled = pi.getFlag("yolo") === true;

    if (yoloEnabled) {
      guardToolsActive = false;
      if (ctx.hasUI) ctx.ui.notify("⚠️ Yolo mode is enabled", "warning");
      return;
    }

    const activeBeforeRegistration = pi.getActiveTools();
    ensureGuardToolsRegistered();
    const nextActive = guardsReplaceActiveBashTools(activeBeforeRegistration);
    pi.setActiveTools(nextActive);
    const activeAfterSet = pi.getActiveTools();
    guardToolsActive = GUARD_BASH_TOOLS.every((tool) => activeAfterSet.includes(tool));

    const platform = deps.platform ?? process.platform;
    const ensureLinuxBubblewrap = deps.ensureLinuxBubblewrap ?? guardsEnsureLinuxBubblewrapForSession;
    if (platform === "linux" && activeAfterSet.includes("sandbox_bash")) {
      await ensureLinuxBubblewrap(ctx, pi);
    }
  });

  pi.on("tool_call", (event) => {
    if (yoloEnabled || event.toolName !== "bash") return;
    return { block: true, reason: STALE_BASH_BLOCK_REASON };
  });

  pi.on("before_agent_start", (event) => {
    if (yoloEnabled || !guardToolsActive) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${TOOL_GUIDANCE}` };
  });

  // Registers custom tools lazily after --yolo is known so yolo sessions keep regular bash behavior.
  // Inputs/outputs are closed over from guardsRegister. Side effects: adds two tool definitions once.
  function ensureGuardToolsRegistered(): void {
    if (toolsRegistered) return;
    pi.registerTool(bashToolsCreateSandboxBashTool());
    pi.registerTool(bashToolsCreateDangerousBashTool());
    toolsRegistered = true;
  }
}

// Replaces active built-in bash with the two explicit guard bash tools without broadening read-only tool sets.
// Input is the active tool list before guard tool registration. Output is a deduplicated replacement list. Side effects: none.
export function guardsReplaceActiveBashTools(activeTools: string[]): string[] {
  const next: string[] = [];
  let shouldEnsureGuardPair = false;
  for (const tool of activeTools) {
    if (tool === "bash") {
      shouldEnsureGuardPair = true;
      next.push(...GUARD_BASH_TOOLS);
    } else {
      if (isGuardBashTool(tool)) shouldEnsureGuardPair = true;
      next.push(tool);
    }
  }
  if (shouldEnsureGuardPair) next.push(...GUARD_BASH_TOOLS);
  return [...new Set(next)];
}

// Checks whether a tool name belongs to the explicit guard bash pair.
// Input is a tool name. Output is true for guard bash tools. Side effects: none.
function isGuardBashTool(tool: string): boolean {
  return GUARD_BASH_TOOLS.some((guardTool) => guardTool === tool);
}

// Offers interactive Linux bubblewrap installation when possible for active sandbox_bash sessions.
// Inputs are the session context and extension API. Output resolves when checks/notifications complete. Side effects: may prompt the user and run pi.exec.
async function guardsEnsureLinuxBubblewrapForSession(ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
  if (await sandboxLinuxHasBubblewrap()) return;

  const installCommand = await sandboxDetectLinuxInstallCommand();
  if (!ctx.hasUI) return;

  if (!installCommand) {
    ctx.ui.notify(sandboxLinuxBubblewrapManualGuidance(), "warning");
    return;
  }

  const confirmed = await ctx.ui.confirm(
    "Install bubblewrap?",
    `sandbox_bash requires bubblewrap on Linux.\n\nRun this command now?\n${installCommand.display}`,
  );
  if (!confirmed) {
    ctx.ui.notify(sandboxLinuxBubblewrapManualGuidance(installCommand), "warning");
    return;
  }

  let result: ExecResult;
  try {
    result = await pi.exec(installCommand.command, installCommand.args, { timeout: 120_000, cwd: ctx.cwd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`bubblewrap installation failed.\n${message}\n${sandboxLinuxBubblewrapManualGuidance(installCommand)}`, "error");
    return;
  }

  if (isSuccessfulInstall(result) && (await sandboxLinuxHasBubblewrap())) {
    ctx.ui.notify("bubblewrap installed; sandbox_bash is ready", "info");
    return;
  }

  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  ctx.ui.notify(
    `bubblewrap installation failed.\n${output ? `${output}\n` : ""}${sandboxLinuxBubblewrapManualGuidance(installCommand)}`,
    "error",
  );
}

// Determines whether pi.exec completed successfully without timeout/kill.
// Input is a pi.exec result. Output is true for exit code zero. Side effects: none.
function isSuccessfulInstall(result: ExecResult): boolean {
  return result.code === 0 && !result.killed;
}

// Entrypoint used by Pi extension discovery.
// Input is Pi's extension API. Output is void. Side effects: delegates extension registration.
export default function guards(pi: ExtensionAPI): void {
  guardsRegister(pi);
}
