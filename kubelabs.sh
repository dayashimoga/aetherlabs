#!/usr/bin/env bash
set -e

echo "=============================================================================="
echo " Launching KubeLabs v3.0 (Cloud-Native & Kubernetes Learn-by-Doing Engine)"
echo "=============================================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is required to run KubeLabs. Please install Node.js 22+ from https://nodejs.org" >&2
  exit 1
fi

PORT="${PORT:-4100}"
HOST="${HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}"

echo "Opening KubeLabs in default browser: ${URL}"
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1 && xdg-open "$URL") &
elif command -v open >/dev/null 2>&1; then
  (sleep 1 && open "$URL") &
fi

exec node src/server.js
