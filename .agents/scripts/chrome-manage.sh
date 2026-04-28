#!/bin/bash

# Detect browser command based on platform
if [[ "$OSTYPE" == "darwin"* ]]; then
  BROWSER_CMD="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  BROWSER_NAME="Google Chrome"
  if [[ ! -d "/Applications/Google Chrome.app" ]]; then
    echo "Error: Google Chrome not found at /Applications/Google Chrome.app"
    exit 1
  fi
elif command -v chromium &>/dev/null; then
  BROWSER_CMD="chromium"
  BROWSER_NAME="chromium"
elif command -v chromium-browser &>/dev/null; then
  BROWSER_CMD="chromium-browser"
  BROWSER_NAME="chromium-browser"
else
  echo "Error: No Chromium/Chrome found"
  exit 1
fi

CHROMIUM_ARGS_BASE="--disable-gpu --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile"

start_chromium() {
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "Chromium is already running on port 9222"
    exit 0
  fi
  echo "Starting $BROWSER_NAME in foreground (headful)..."
  "$BROWSER_CMD" $CHROMIUM_ARGS_BASE
}

start_chromium_bg() {
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "Chromium is already running on port 9222"
    exit 0
  fi
  echo "Starting $BROWSER_NAME in background (headless)..."
  nohup "$BROWSER_CMD" --headless $CHROMIUM_ARGS_BASE </dev/null >/tmp/chromium.log 2>&1 &

  for i in {1..10}; do
    if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
      echo "Chromium started successfully on port 9222"
      exit 0
    fi
    sleep 1
  done
  echo "Failed to start Chromium"
  exit 1
}

kill_chromium() {
  if pkill -f "$BROWSER_NAME.*--remote-debugging-port=9222"; then
    echo "$BROWSER_NAME killed"
  else
    echo "No $BROWSER_NAME process found"
  fi
}

case "$1" in
  start)
    start_chromium
    ;;
  start:bg)
    start_chromium_bg
    ;;
  kill)
    kill_chromium
    ;;
  *)
    echo "Usage: $0 {start|start:bg|kill}"
    echo ""
    echo "  start     Start Chromium in foreground (headful)"
    echo "  start:bg  Start Chromium in background (headless)"
    echo "  kill      Kill running Chromium"
    exit 1
    ;;
esac
