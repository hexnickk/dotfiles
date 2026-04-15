import { isToolCallEventType, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function guardrails(pi: ExtensionAPI): void {
  let yoloEnabled = false;

  pi.registerFlag("yolo", {
    description: "Enable 'Yolo' mode, which bypasses some safety checks and assumes risk.",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", (_event, ctx) => {
    yoloEnabled = pi.getFlag("yolo") === true;

    if (yoloEnabled) {
      ctx.ui.notify("⚠️ Yolo mode is enabled", "warning");
    }
  });

  // Hook into the tool_call event to intercept all calls.
  pi.on("tool_call", async (event, ctx) => {
    if (yoloEnabled) {
      return;
    }

    if (isToolCallEventType("bash", event)) {
      if (!ctx.hasUI) {
        // In non-interactive mode, block by default
        return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
      }

      const ok = await ctx.ui.confirm("Pls confirm", `Agent is trying to run: ${event.input.command}`);
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });
}
