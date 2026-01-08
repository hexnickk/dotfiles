#!/bin/bash

# Install Chromium and start dbus
sudo apt install -y chromium
sudo service dbus start

# Start Chromium in background with remote debugging enabled
# This is needed because Chrome DevTools MCP cannot launch Chrome in containerized environments
nohup chromium --headless --no-sandbox --disable-dev-shm-usage --disable-setuid-sandbox --disable-gpu --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile </dev/null >/tmp/chromium.log 2>&1 &

# Wait for Chromium to be ready
for i in {1..10}; do
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "Chromium started successfully on port 9222"
    break
  fi
  sleep 1
done

# Configure Chrome DevTools MCP to connect to the running Chromium instance
# Remove existing chrome-devtools MCP if present, then add new one
claude mcp remove chrome-devtools 2>/dev/null || true
claude mcp add --transport stdio chrome-devtools -- npx chrome-devtools-mcp@latest --browserUrl http://localhost:9222

echo "Chrome DevTools MCP configured successfully"
