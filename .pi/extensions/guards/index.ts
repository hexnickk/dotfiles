import { isToolCallEventType, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { guardBashEvaluateCommand, guardBashFormatParsedStages } from "./src/guard-bash/index.ts";

// Registers bash command guards and prompts when a command needs approval.
export default function guards(pi: ExtensionAPI): void {
  let yoloEnabled = false;

  pi.registerFlag("yolo", {
    description: "Enable 'Yolo' mode, which bypasses some safety checks and assumes risk.",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", (_event, ctx) => {
    yoloEnabled = pi.getFlag("yolo") === true;

    if (yoloEnabled && ctx.hasUI) {
      ctx.ui.notify("⚠️ Yolo mode is enabled", "warning");
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (yoloEnabled || !isToolCallEventType("bash", event)) {
      return;
    }

    const decision = guardBashEvaluateCommand(event.input.command);
    if (decision.autoAllow) {
      return;
    }

    if (!ctx.hasUI) {
      return { block: true, reason: decision.reason };
    }

    const okToRun = await ctx.ui.confirm(
      "Command needs approval",
      [
        `Agent is trying to run: ${event.input.command}`,
        `Parsed pipeline: ${guardBashFormatParsedStages(decision.stages)}`,
        `Reason: ${decision.reason}`,
      ].join("\n\n"),
    );

    if (!okToRun) {
      return { block: true, reason: "Blocked by user" };
    }
  });
}
