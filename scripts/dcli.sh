#!/bin/bash
# dcli - devcontainer CLI wrapper

set -e

FOLDER="${DCLI_FOLDER:-$(pwd)}"
CONFIG=""  # config subdir name, e.g. "rust" -> .devcontainer/rust/devcontainer.json

# Parse --config <name> global option before the subcommand
while [[ $# -gt 0 ]]; do
    case "$1" in
        --config) CONFIG="$2"; shift 2 ;;
        *) break ;;
    esac
done

get_config_path() {
    if [ -n "$CONFIG" ]; then
        echo "$FOLDER/.devcontainer/$CONFIG/devcontainer.json"
    fi
}

# Find container by devcontainer.local_folder label, optionally filtered by config subdir
find_container() {
    local folder="$1"
    local ids

    ids=$(docker ps -q --filter "label=devcontainer.local_folder=$folder" 2>/dev/null)
    if [ -z "$ids" ]; then
        folder=$(realpath "$folder" 2>/dev/null || echo "$folder")
        ids=$(docker ps -q --filter "label=devcontainer.local_folder=$folder" 2>/dev/null)
    fi

    if [ -z "$ids" ]; then
        echo ""
        return
    fi

    # No config: prefer container whose config_file is the root devcontainer.json (not a subdirectory)
    if [ -z "$CONFIG" ]; then
        for id in $ids; do
            local cfg_label
            cfg_label=$(docker inspect --format '{{index .Config.Labels "devcontainer.config_file"}}' "$id" 2>/dev/null)
            # Match .devcontainer/devcontainer.json but not .devcontainer/*/devcontainer.json
            if echo "$cfg_label" | grep -q '\.devcontainer/devcontainer\.json$'; then
                echo "$id"
                return
            fi
        done
        # Fallback: return first if none matched the root config
        echo "$ids" | head -1
        return
    fi

    # Filter by config: check devcontainer.config_file label, then fall back to name match
    for id in $ids; do
        local cfg_label
        cfg_label=$(docker inspect --format '{{index .Config.Labels "devcontainer.config_file"}}' "$id" 2>/dev/null)
        if echo "$cfg_label" | grep -q "/$CONFIG/"; then
            echo "$id"
            return
        fi
        local name
        name=$(docker inspect --format '{{.Name}}' "$id" | sed 's/^\///')
        if echo "$name" | grep -qi "$CONFIG"; then
            echo "$id"
            return
        fi
    done

    echo ""
}

# Get remote user from container metadata
get_remote_user() {
    local id="$1"
    local user
    user=$(docker inspect --format '{{index .Config.Labels "devcontainer.metadata"}}' "$id" 2>/dev/null | grep -o '"remoteUser":"[^"]*"' | tail -1 | cut -d'"' -f4)
    echo "${user:-root}"
}

# Get workspace directory
get_workspace_dir() {
    local folder="$1"
    echo "/workspaces/$(basename "$folder")"
}

cmd_up() {
    local config_path
    config_path=$(get_config_path)
    echo "Starting devcontainer for: $FOLDER${CONFIG:+ (config: $CONFIG)}"
    if [ -n "$config_path" ]; then
        devcontainer up --workspace-folder "$FOLDER" --config "$config_path"
    else
        devcontainer up --workspace-folder "$FOLDER"
    fi
}

cmd_down() {
    local id
    id=$(find_container "$FOLDER")
    if [ -z "$id" ]; then
        echo "No devcontainer running for: $FOLDER${CONFIG:+ (config: $CONFIG)}"
        exit 1
    fi
    local name
    name=$(docker inspect --format '{{.Name}}' "$id" | sed 's/^\///')
    echo "Stopping: $name"
    docker stop "$id"
}

cmd_ssh() {
    local id
    id=$(find_container "$FOLDER")
    if [ -z "$id" ]; then
        echo "No devcontainer found for: $FOLDER${CONFIG:+ (config: $CONFIG)}"
        echo ""
        cmd_ls
        exit 1
    fi

    local name
    name=$(docker inspect --format '{{.Name}}' "$id" | sed 's/^\///')
    local user
    user=$(get_remote_user "$id")
    local workspace
    workspace=$(get_workspace_dir "$FOLDER")

    echo "Connecting to: $name"
    exec docker exec -it -u "$user" -w "$workspace" "$id" /bin/bash -l
}

cmd_exec() {
    local id
    id=$(find_container "$FOLDER")
    if [ -z "$id" ]; then
        echo "No devcontainer found for: $FOLDER${CONFIG:+ (config: $CONFIG)}"
        exit 1
    fi

    local user
    user=$(get_remote_user "$id")
    local workspace
    workspace=$(get_workspace_dir "$FOLDER")

    docker exec -u "$user" -w "$workspace" "$id" "$@"
}

cmd_ls() {
    echo "Running devcontainers:"
    docker ps --filter "label=devcontainer.local_folder" --format "  {{.Names}}\t{{.Label \"devcontainer.local_folder\"}}\t{{.Label \"devcontainer.config_file\"}}" 2>/dev/null || echo "  (none)"
}

cmd_rebuild() {
    local config_path
    config_path=$(get_config_path)
    echo "Rebuilding devcontainer for: $FOLDER${CONFIG:+ (config: $CONFIG)}"
    if [ -n "$config_path" ]; then
        devcontainer up --workspace-folder "$FOLDER" --config "$config_path" --remove-existing-container
    else
        devcontainer up --workspace-folder "$FOLDER" --remove-existing-container
    fi
}

cmd_init() {
    local claude=false
    local target=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --claude) claude=true; shift ;;
            *) target="$1"; shift ;;
        esac
    done

    target="${target:-$FOLDER}"
    local dir

    if [ -n "$CONFIG" ]; then
        dir="$target/.devcontainer/$CONFIG"
    else
        dir="$target/.devcontainer"
    fi

    if [ -f "$dir/devcontainer.json" ]; then
        echo "devcontainer.json already exists in $dir"
        exit 1
    fi

    mkdir -p "$dir"

    if [ "$claude" = true ]; then
        cat > "$dir/Dockerfile" <<'DFEOF'
FROM mcr.microsoft.com/devcontainers/base:ubuntu
RUN usermod -l user -d /home/user -m vscode && groupmod -n user vscode
DFEOF
        cat > "$dir/devcontainer.json" <<'DCEOF'
{
  "name": "${localWorkspaceFolderBasename}",
  "build": { "dockerfile": "Dockerfile" },
  "remoteUser": "user",
  "mounts": [
    "source=${localEnv:HOME}/.claude,target=/home/user/.claude,type=bind,consistency=cached",
    "source=${localEnv:HOME}/.ganglia,target=/home/user/.ganglia,type=bind,consistency=cached"
  ]
}
DCEOF
    else
        cat > "$dir/Dockerfile" <<'DFEOF'
FROM mcr.microsoft.com/devcontainers/base:ubuntu
RUN usermod -l user -d /home/user -m vscode && groupmod -n user vscode
DFEOF
        cat > "$dir/devcontainer.json" <<'DCEOF'
{
  "name": "${localWorkspaceFolderBasename}",
  "build": { "dockerfile": "Dockerfile" },
  "remoteUser": "user"
}
DCEOF
    fi

    echo "Created $dir/devcontainer.json"
}

cmd_help() {
    cat <<EOF
dcli - devcontainer CLI wrapper

Usage: dcli [--config <name>] <command> [args]

Commands:
  up        Start devcontainer for current folder
  down      Stop devcontainer
  ssh       Connect to devcontainer (interactive shell)
  exec      Run command in devcontainer
  ls        List running devcontainers
  init      Create .devcontainer/devcontainer.json (Ubuntu)
              --claude  Mount ~/.claude and ~/.ganglia into container
  rebuild   Rebuild devcontainer

Options:
  --config <name>     Use .devcontainer/<name>/devcontainer.json
  DCLI_FOLDER=<path>  Override working folder

Examples:
  dcli up                        # single config
  dcli --config rust up          # .devcontainer/rust/devcontainer.json
  dcli --config node ssh         # connect to node container
  dcli --config rust init        # create .devcontainer/rust/devcontainer.json
EOF
}

case "${1:-help}" in
    up)      cmd_up ;;
    down)    cmd_down ;;
    ssh)     cmd_ssh ;;
    exec)    shift; cmd_exec "$@" ;;
    ls)      cmd_ls ;;
    init)    shift; cmd_init "$@" ;;
    rebuild) cmd_rebuild ;;
    help|-h|--help) cmd_help ;;
    *)       echo "Unknown command: $1"; cmd_help; exit 1 ;;
esac
