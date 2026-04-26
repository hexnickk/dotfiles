// Base class for expected sandbox setup failures returned by helper functions.
export class SandboxSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SandboxUnsupportedPlatformError extends SandboxSetupError {
  readonly platform: NodeJS.Platform;

  constructor(platform: NodeJS.Platform) {
    super(`sandbox_bash is not supported on ${platform}. Supported platforms are Linux and macOS.`);
    this.platform = platform;
  }
}

export class SandboxDependencyMissingError extends SandboxSetupError {
  readonly dependency: string;
  readonly guidance: string;

  constructor(dependency: string, guidance: string) {
    super(guidance);
    this.dependency = dependency;
    this.guidance = guidance;
  }
}

export class SandboxInvalidWorkingDirectoryError extends SandboxSetupError {
  readonly cwd: string;

  constructor(cwd: string) {
    super(`Working directory does not exist or is not accessible: ${cwd}`);
    this.cwd = cwd;
  }
}

export class SandboxPreparationError extends SandboxSetupError {
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to prepare sandbox command during ${operation}: ${message}`);
    this.operation = operation;
  }
}

export class SandboxSpawnError extends SandboxSetupError {
  readonly executable: string;

  constructor(executable: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to start sandbox command ${executable}: ${message}`);
    this.executable = executable;
  }
}
