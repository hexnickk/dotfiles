const FILE_MUTATION_TOOLS = ["write", "edit", "remove"] as const;
const FILE_MUTATION_GUIDANCE_SUFFIX =
  "can modify the workspace directly; outside workspace paths require interactive session confirmation";

// Adds the custom remove tool whenever mutating file tools are active so deletion does not require shell rm.
// Input is an active tool list after bash replacement. Output is a deduplicated active tool list. Side effects: none.
export function fileToolsEnsureRemoveForMutations(activeTools: string[]): string[] {
  if (!activeTools.includes("edit") && !activeTools.includes("write")) return [...new Set(activeTools)];
  const next = [...activeTools, "remove"];
  return [...new Set(next)];
}

// Builds concise file-tool guidance from the file tools that are actually active.
// Input is active tool names after guard registration. Output is a system-prompt sentence or undefined. Side effects: none.
export function fileToolsBuildGuidance(activeTools: string[]): string | undefined {
  const activeMutationTools = FILE_MUTATION_TOOLS.filter((tool) => activeTools.includes(tool));
  if (activeMutationTools.length === 0) return undefined;
  return `Guard file mode: ${formatToolList(activeMutationTools)} ${FILE_MUTATION_GUIDANCE_SUFFIX}.`;
}

// Formats a short English list of tool names for prompt guidance.
// Input is active tool names. Output is an English list. Side effects: none.
function formatToolList(tools: readonly string[]): string {
  if (tools.length <= 2) return tools.join(" and ");
  return `${tools.slice(0, -1).join(", ")}, and ${tools.at(-1)}`;
}
