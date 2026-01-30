#!/bin/bash
# dcli - devcontainer CLI wrapper

set -e

FOLDER="${DCLI_FOLDER:-$(pwd)}"

# Find container by devcontainer.local_folder label
find_container() {
    local folder="$1"
    local id=$(docker ps -q --filter "label=devcontainer.local_folder=$folder" 2>/dev/null | head -1)

    if [ -z "$id" ]; then
        folder=$(realpath "$folder" 2>/dev/null || echo "$folder")
        id=$(docker ps -q --filter "label=devcontainer.local_folder=$folder" 2>/dev/null | head -1)
    fi

    echo "$id"
}

# Get remote user from container metadata
get_remote_user() {
    local id="$1"
    local user=$(docker inspect --format '{{index .Config.Labels "devcontainer.metadata"}}' "$id" 2>/dev/null | grep -o '"remoteUser":"[^"]*"' | cut -d'"' -f4)
    echo "${user:-root}"
}

# Get workspace directory
get_workspace_dir() {
    local folder="$1"
    echo "/workspaces/$(basename "$folder")"
}

cmd_up() {
    echo "Starting devcontainer for: $FOLDER"
    devcontainer up --workspace-folder "$FOLDER"
}

cmd_down() {
    local id=$(find_container "$FOLDER")
    if [ -z "$id" ]; then
        echo "No devcontainer running for: $FOLDER"
        exit 1
    fi
    local name=$(docker inspect --format '{{.Name}}' "$id" | sed 's/^\///')
    echo "Stopping: $name"
    docker stop "$id"
}

cmd_ssh() {
    local id=$(find_container "$FOLDER")
    if [ -z "$id" ]; then
        echo "No devcontainer found for: $FOLDER"
        echo ""
        cmd_ls
        exit 1
    fi

    local name=$(docker inspect --format '{{.Name}}' "$id" | sed 's/^\///')
    local user=$(get_remote_user "$id")
    local workspace=$(get_workspace_dir "$FOLDER")

    echo "Connecting to: $name"
    exec docker exec -it -u "$user" -w "$workspace" "$id" /bin/bash -l
}

cmd_exec() {
    local id=$(find_container "$FOLDER")
    if [ -z "$id" ]; then
        echo "No devcontainer found for: $FOLDER"
        exit 1
    fi

    local user=$(get_remote_user "$id")
    local workspace=$(get_workspace_dir "$FOLDER")

    docker exec -u "$user" -w "$workspace" "$id" "$@"
}

cmd_ls() {
    echo "Running devcontainers:"
    docker ps --filter "label=devcontainer.local_folder" --format "  {{.Names}}\t{{.Label \"devcontainer.local_folder\"}}" 2>/dev/null || echo "  (none)"
}

cmd_rebuild() {
    echo "Rebuilding devcontainer for: $FOLDER"
    devcontainer up --workspace-folder "$FOLDER" --remove-existing-container
}

cmd_help() {
    cat <<EOF
dcli - devcontainer CLI wrapper

Usage: dcli <command> [args]

Commands:
  up        Start devcontainer for current folder
  down      Stop devcontainer
  ssh       Connect to devcontainer (interactive shell)
  exec      Run command in devcontainer
  ls        List running devcontainers
  rebuild   Rebuild devcontainer

Options:
  DCLI_FOLDER=<path>  Override working folder
EOF
}

case "${1:-help}" in
    up)      cmd_up ;;
    down)    cmd_down ;;
    ssh)     cmd_ssh ;;
    exec)    shift; cmd_exec "$@" ;;
    ls)      cmd_ls ;;
    rebuild) cmd_rebuild ;;
    help|-h|--help) cmd_help ;;
    *)       echo "Unknown command: $1"; cmd_help; exit 1 ;;
esac
