import type { ExecResult, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { bashToolsCreateDangerousBashTool, bashToolsCreateSandboxBashTool } from "./src/bash-tools/index.ts";
import {
  fileToolsBuildGuidance,
  fileToolsCreateApprovalStore,
  fileToolsCreateEditTool,
  fileToolsCreateRemoveTool,
  fileToolsCreateWriteTool,
  fileToolsEnsureRemoveForMutations,
  fileToolsResetApprovalStore,
} from "./src/file-tools/index.ts";
import {
  sandboxDetectLinuxInstallCommand,
  sandboxLinuxBubblewrapManualGuidance,
  sandboxLinuxHasBubblewrap,
} from "./src/sandbox/index.ts";

const STALE_BASH_BLOCK_REASON =
  "Use sandbox_bash for sandboxed commands or dangerous_bash for confirmed host commands.";
const GUARD_BASH_TOOLS = ["sandbox_bash", "dangerous_bash"] as const;
const BASH_TOOL_GUIDANCE =
  "Guard bash mode: use sandbox_bash for normal shell commands that need the user environment but do not need host filesystem writes. Use dangerous_bash only for intentional host filesystem writes or host-side side effects after confirmation.";

type GuardsDeps = {
  platform?: NodeJS.Platform;
  ensureLinuxBubblewrap?: (ctx: ExtensionContext, pi: ExtensionAPI) => Promise<void>;
};

// Registers the guards extension with optional dependency overrides used by tests.
// Input is Pi's extension API. Output is void. Side effects: registers flags, tools, and event handlers.
export function guardsRegister(pi: ExtensionAPI, deps: GuardsDeps = {}): void {
  let yoloEnabled = false;
  let bashToolsActive = false;
  let fileToolGuidance: string | undefined;
  let toolsRegistered = false;
  const fileApprovalStore = fileToolsCreateApprovalStore();

  pi.registerFlag("yolo", {
    description: "Enable 'Yolo' mode, which bypasses guard tool replacement and uses regular host bash.",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", async (_event, ctx) => {
    yoloEnabled = pi.getFlag("yolo") === true;
    fileToolsResetApprovalStore(fileApprovalStore);

    if (yoloEnabled) {
      bashToolsActive = false;
      fileToolGuidance = undefined;
      if (ctx.hasUI) ctx.ui.notify("⚠️ Yolo mode is enabled", "warning");
      return;
    }

    const activeBeforeRegistration = pi.getActiveTools();
    ensureGuardToolsRegistered();
    const nextActive = fileToolsEnsureRemoveForMutations(
      guardsReplaceActiveBashTools(activeBeforeRegistration),
    );
    pi.setActiveTools(nextActive);
    const activeAfterSet = pi.getActiveTools();
    bashToolsActive = GUARD_BASH_TOOLS.every((tool) => activeAfterSet.includes(tool));
    fileToolGuidance = fileToolsBuildGuidance(activeAfterSet);

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
    if (yoloEnabled) return;

    const guidance = [];
    if (bashToolsActive) guidance.push(BASH_TOOL_GUIDANCE);
    if (fileToolGuidance) guidance.push(fileToolGuidance);
    if (guidance.length === 0) return;

    return { systemPrompt: `${event.systemPrompt}\n\n${guidance.join("\n")}` };
  });

  // Registers custom tools lazily after --yolo is known so yolo sessions keep regular built-in behavior.
  // Inputs/outputs are closed over from guardsRegister. Side effects: adds guarded mutation tools and two bash tool definitions once.
  function ensureGuardToolsRegistered(): void {
    if (toolsRegistered) return;
    pi.registerTool(fileToolsCreateWriteTool({ approvalStore: fileApprovalStore }));
    pi.registerTool(fileToolsCreateEditTool({ approvalStore: fileApprovalStore }));
    pi.registerTool(fileToolsCreateRemoveTool({ approvalStore: fileApprovalStore }));
    pi.registerTool(bashToolsCreateSandboxBashTool());
    pi.registerTool(bashToolsCreateDangerousBashTool());
    toolsRegistered = true;
  }
}

// Replaces active built-in bash with the two explicit guard bash tools while preserving explicit read-only/no-tool modes.
// Input is the active tool list before guard tool registration. Output is a deduplicated replacement list. Side effects: none.
export function guardsReplaceActiveBashTools(activeTools: string[]): string[] {
  const next: string[] = [];
  const shouldEnsureGuardPair =
    activeTools.some((tool) => tool === "bash" || isGuardBashTool(tool)) ||
    shouldRestoreDefaultBashTools(activeTools);

  for (const tool of activeTools) {
    if (tool === "bash") {
      next.push(...GUARD_BASH_TOOLS);
      continue;
    }

    next.push(tool);
  }

  if (shouldEnsureGuardPair) next.push(...GUARD_BASH_TOOLS);
  return [...new Set(next)];
}

// Detects mutable default-like tool sets where guard bash tools were likely dropped during lazy registration/reload.
// Input is active tool names. Output is true when edit/write is active but no bash tool is active. Side effects: none.
function shouldRestoreDefaultBashTools(activeTools: string[]): boolean {
  const hasAnyBashTool = activeTools.some((tool) => tool === "bash" || isGuardBashTool(tool));
  if (hasAnyBashTool) return false;
  return activeTools.includes("edit") || activeTools.includes("write");
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
