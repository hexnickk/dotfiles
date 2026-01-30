#!/usr/bin/env bash

DESTINATION="$1"

if [ -z "$DESTINATION" ]; then
  echo "Usage: $0 <destination>"
  exit 1
fi

echo "Backing up to $DESTINATION"

# Create dated backup folder if it doesn't exist
DATE=$(date +%Y-%m-%d)
BACKUP_PATH="$DESTINATION/backup-$DATE"
mkdir -p "$BACKUP_PATH"

# Array of backup directories
BACKUP_DIRS=(
  "Downloads"
  "Google Drive"
  "Models"
  "Documents"
  "Projects"
  "Scripts"
  "Photos"
)

# Copy all directories to the destination using rsync
for dir in "${BACKUP_DIRS[@]}"; do
  rsync -avL \
    --exclude="node_modules/" \
    --exclude=".deno/" \
    --exclude="build/" \
    --exclude="dist/" \
    --exclude=".yarn/" \
    --exclude=".next/" \
    --exclude=".cache/" \
    --exclude=".venv/" \
    --exclude="target/" \
    --exclude="Google Drive/.*" \
    --exclude=".DS_Store" \
    --exclude="ios/" \
    "/Users/$USER/$dir" "$BACKUP_PATH";
done
