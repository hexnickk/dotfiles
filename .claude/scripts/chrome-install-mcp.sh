#!/bin/bash

require_command() {
  for cmd in "$@"; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "Error: Required command '$cmd' not found"
      exit 1
    fi
  done
}

require_command claude

# Check for browser based on platform
if [[ "$OSTYPE" == "darwin"* ]]; then
  if [[ ! -d "/Applications/Google Chrome.app" ]]; then
    echo "Error: Google Chrome not found at /Applications/Google Chrome.app"
    exit 1
  fi
elif ! command -v chromium &>/dev/null && ! command -v chromium-browser &>/dev/null; then
  echo "Error: Chromium not found"
  exit 1
fi

# Configure Chrome DevTools MCP to connect to the running Chromium instance
# Remove existing chrome-devtools MCP if present, then add new one
claude mcp remove chrome-devtools 2>/dev/null || true
claude mcp add --transport stdio chrome-devtools -- npx chrome-devtools-mcp@latest --browserUrl http://localhost:9222

echo "Chrome DevTools MCP configured successfully"
