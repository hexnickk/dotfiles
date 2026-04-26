const DEFAULT_PATH = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

// Builds the explicit environment passed into sandboxed commands.
// Inputs: sandboxTemp is the writable temp/cache root inside the sandbox, envSource is the host env to read safe identity/path defaults from.
// Output: a new environment object containing only selected variables and a writable sandbox HOME. Side effects: none.
export function sandboxBuildEnv(sandboxTemp: string, envSource: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    PATH: envSource.PATH ?? DEFAULT_PATH,
    HOME: sandboxTemp,
    USER: envSource.USER ?? "sandbox",
    LOGNAME: envSource.LOGNAME ?? envSource.USER ?? "sandbox",
    SHELL: "/bin/bash",
    TERM: envSource.TERM ?? "xterm-256color",
    TMPDIR: sandboxTemp,
    XDG_CACHE_HOME: `${sandboxTemp}/xdg-cache`,
    npm_config_cache: `${sandboxTemp}/npm-cache`,
    PIP_CACHE_DIR: `${sandboxTemp}/pip-cache`,
  };
}
