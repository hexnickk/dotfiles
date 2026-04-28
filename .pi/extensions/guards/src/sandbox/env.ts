const DEFAULT_PATH = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

// Builds the environment passed into sandboxed commands.
// Inputs: sandboxTemp is the writable scratch/cache root inside the sandbox, envSource is the host env to preserve.
// Output: a host-like environment with temp/cache writes redirected to sandboxTemp. Side effects: none.
export function sandboxBuildEnv(sandboxTemp: string, envSource: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...envSource,
    PATH: envSource.PATH ?? DEFAULT_PATH,
    TMPDIR: sandboxTemp,
    TMP: sandboxTemp,
    TEMP: sandboxTemp,
    GIT_OPTIONAL_LOCKS: "0",
    XDG_CACHE_HOME: `${sandboxTemp}/xdg-cache`,
    npm_config_cache: `${sandboxTemp}/npm-cache`,
    PIP_CACHE_DIR: `${sandboxTemp}/pip-cache`,
  };
}
