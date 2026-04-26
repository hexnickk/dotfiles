export type SandboxPlatform = NodeJS.Platform;

export type SandboxCommand = {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  cleanupPaths: string[];
};
