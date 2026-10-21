#!/usr/bin/env bash
# Open Clipboard Copilot Standalone file in default browser
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$DIR/clipboard-copilot-standalone.html"

if command -v xdg-open > /dev/null 2>&1; then
  xdg-open "$FILE"
elif command -v open > /dev/null 2>&1; then
  open "$FILE"
elif command -v google-chrome > /dev/null 2>&1; then
  google-chrome "$FILE"
elif command -v firefox > /dev/null 2>&1; then
  firefox "$FILE"
else
  echo "Please open $FILE in your browser."
fi
