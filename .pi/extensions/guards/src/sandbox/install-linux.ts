import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

export type SandboxLinuxPackageManager = "apt-get" | "dnf" | "pacman" | "zypper" | "apk" | "brew";

export type SandboxLinuxInstallCommand = {
  manager: SandboxLinuxPackageManager;
  command: string;
  args: string[];
  display: string;
};

export type SandboxCommandAvailability = (command: string) => Promise<boolean> | boolean;

const PACKAGE_MANAGER_ORDER: SandboxLinuxPackageManager[] = ["apt-get", "dnf", "pacman", "zypper", "apk", "brew"];
const MANUAL_GUIDANCE = `Install manually with one of:
  Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y bubblewrap
  Fedora: sudo dnf install -y bubblewrap
  Arch: sudo pacman -S --needed bubblewrap
  openSUSE: sudo zypper install bubblewrap
  Alpine: sudo apk add bubblewrap
  Linuxbrew: brew install bubblewrap`;

// Finds an executable on PATH without invoking a shell.
// Input is a command name and optional env source. Output is its absolute path or undefined. Side effects: filesystem access checks only.
export async function sandboxFindOnPath(
  command: string,
  envSource: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  if (isAbsolute(command)) {
    return (await canExecute(command)) ? command : undefined;
  }

  const pathValue = envSource.PATH ?? "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  for (const dir of pathValue.split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    const candidate = join(dir, command);
    if (await canExecute(candidate)) return candidate;
  }

  return undefined;
}

// Checks whether Linux bubblewrap is currently available.
// Inputs: optional env source for PATH lookup. Output: true when bwrap is executable. Side effects: filesystem access checks only.
export async function sandboxLinuxHasBubblewrap(envSource: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await sandboxFindOnPath("bwrap", envSource)) !== undefined;
}

// Detects the first supported Linux package manager available on PATH.
// Input is a command-availability callback. Output is the package-manager name or undefined. Side effects depend on the callback.
export async function sandboxDetectLinuxPackageManager(
  hasCommand: SandboxCommandAvailability = (command) => sandboxFindOnPath(command).then(Boolean),
): Promise<SandboxLinuxPackageManager | undefined> {
  for (const manager of PACKAGE_MANAGER_ORDER) {
    if (await hasCommand(manager)) return manager;
  }
  return undefined;
}

// Builds the exact non-interactive install command for a package manager.
// Inputs: manager and root status. Output is a command/args/display tuple. Side effects: none.
export function sandboxBuildLinuxInstallCommand(
  manager: SandboxLinuxPackageManager,
  isRoot = process.getuid?.() === 0,
): SandboxLinuxInstallCommand {
  const baseArgs = buildManagerArgs(manager);
  if (manager === "brew" || isRoot) {
    return { manager, command: manager, args: baseArgs, display: `${manager} ${baseArgs.join(" ")}` };
  }

  const args = ["-n", manager, ...baseArgs];
  return { manager, command: "sudo", args, display: `sudo ${args.join(" ")}` };
}

// Detects a supported installer and builds its command.
// Inputs: command availability and root status. Output is an install command or undefined. Side effects depend on availability callback.
export async function sandboxDetectLinuxInstallCommand(options: {
  hasCommand?: SandboxCommandAvailability;
  isRoot?: boolean;
} = {}): Promise<SandboxLinuxInstallCommand | undefined> {
  const manager = await sandboxDetectLinuxPackageManager(options.hasCommand);
  return manager ? sandboxBuildLinuxInstallCommand(manager, options.isRoot) : undefined;
}

// Formats manual bubblewrap installation guidance.
// Input is an optional detected command to highlight. Output is user-facing guidance text. Side effects: none.
export function sandboxLinuxBubblewrapManualGuidance(command?: SandboxLinuxInstallCommand): string {
  const detected = command ? `Detected install command: ${command.display}\n` : "";
  return `sandbox_bash requires bubblewrap on Linux.\n${detected}${MANUAL_GUIDANCE}`;
}

// Checks whether a path is executable by this process.
// Input is an absolute path. Output is a boolean. Side effects: filesystem access check only.
async function canExecute(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Returns package-manager-specific arguments for installing bubblewrap.
// Input is a supported manager. Output is argv without sudo/manager. Side effects: none.
function buildManagerArgs(manager: SandboxLinuxPackageManager): string[] {
  switch (manager) {
    case "apt-get":
    case "dnf":
      return ["install", "-y", "bubblewrap"];
    case "pacman":
      return ["-S", "--needed", "--noconfirm", "bubblewrap"];
    case "zypper":
      return ["install", "-y", "bubblewrap"];
    case "apk":
      return ["add", "bubblewrap"];
    case "brew":
      return ["install", "bubblewrap"];
  }
}
