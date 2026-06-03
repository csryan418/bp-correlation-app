#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZROK_LOG="$(mktemp /tmp/zrok-share.XXXXXX)"

BACKEND_PID=""
FRONTEND_PID=""
ZROK_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [[ -n "$ZROK_PID" ]]    && kill "$ZROK_PID"    2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null || true
  echo "Stopping Open Wearables..."
  cd ~/open-wearables && docker compose down 2>/dev/null || true
  rm -f "$ZROK_LOG"
  echo "Reloading launchd server..."
  launchctl load ~/Library/LaunchAgents/com.bpcorrelation.server.plist 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# --- Open Wearables ---
echo "Starting Open Wearables..."
cd ~/open-wearables && docker compose up -d
echo "✓ Open Wearables running"

# --- Unload launchd plist to free port 3001 ---
launchctl unload ~/Library/LaunchAgents/com.bpcorrelation.server.plist 2>/dev/null || true
sleep 1

# --- Kill any existing processes on required ports ---
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

# --- Backend ---
echo "Starting backend..."
cd "$SCRIPT_DIR"
node server.js &
BACKEND_PID=$!

# --- Frontend ---
echo "Starting frontend..."
cd "$SCRIPT_DIR/client"
npm run dev &
FRONTEND_PID=$!

# --- Wait for servers ---
echo "Waiting for servers to be ready..."
sleep 4

# Verify backend
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "ERROR: Backend failed to start." >&2
  exit 1
fi
echo "✓ Backend running on port 3001"

# Verify frontend
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "ERROR: Frontend failed to start." >&2
  exit 1
fi
echo "✓ Frontend running on port 5173"
echo "✓ Open Wearables running"

# --- zrok share ---
echo "Starting zrok share..."
zrok share public http://localhost:5173 >"$ZROK_LOG" 2>&1 &
ZROK_PID=$!

# Wait up to 15 seconds for the share URL to appear
ZROK_URL=""
for i in $(seq 1 30); do
  if ! kill -0 "$ZROK_PID" 2>/dev/null; then
    echo "ERROR: zrok exited unexpectedly. Output:" >&2
    cat "$ZROK_LOG" >&2
    exit 1
  fi
  ZROK_URL=$(grep -o 'https://[^ ]*share\.zrok\.io[^ ]*' "$ZROK_LOG" 2>/dev/null | head -1 || true)
  [[ -n "$ZROK_URL" ]] && break
  sleep 0.5
done

if [[ -z "$ZROK_URL" ]]; then
  echo "ERROR: Could not detect zrok share URL after 15 seconds." >&2
  echo "zrok output:" >&2
  cat "$ZROK_LOG" >&2
  exit 1
fi

echo "✓ zrok share active"
echo ""
echo "📱 Open on your phone:"
echo "   $ZROK_URL"
echo ""
echo "Press Ctrl+C to stop all services."

# Keep script alive while background processes run
wait "$BACKEND_PID" "$FRONTEND_PID" "$ZROK_PID"
