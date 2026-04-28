#!/bin/bash
set -e

# Parse named flags
while getopts "n:f:p:" opt; do
  case $opt in
    n) ITERATIONS="$OPTARG" ;;
    f) SPEC_FILE="$OPTARG" ;;
    p) PROGRESS_FILE="$OPTARG" ;;
    \?) echo "Invalid option: -$OPTARG" >&2; exit 1 ;;
  esac
done

# Defaults
ITERATIONS="${ITERATIONS:-20}"
SPEC_FILE="${SPEC_FILE:-SPEC.md}"
PROGRESS_FILE="${PROGRESS_FILE:-progress.md}"

# Validate dependencies
require_command() {
  for cmd in "$@"; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "Error: Required command '$cmd' not found"
      exit 1
    fi
  done
}

require_command claude

# Validate files
if [[ ! -f "$SPEC_FILE" ]]; then
  echo "Error: $SPEC_FILE not found"
  exit 1
fi

[[ -f $PROGRESS_FILE ]] || touch $PROGRESS_FILE

# Iteration loop
for ((i=1; i<=ITERATIONS; i++)); do
  echo "=== Iteration $i ==="

  result=$(claude --permission-mode acceptEdits -p "@$SPEC_FILE @$PROGRESS_FILE
1. Find the highest-priority task and implement it.
2. Run your tests and type checks.
3. Update the SPEC with what was done.
4. Append your progress to $PROGRESS_FILE.
5. Commit your changes with format: ralf: lowercase description
ONLY WORK ON A SINGLE TASK.
If the SPEC is complete, output <promise>COMPLETE</promise>.")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "SPEC complete!"
    break
  fi
done

echo "Done!"
