#!/usr/bin/env bash
set -uo pipefail

ZROK_FRONTEND_LOG="$(mktemp /tmp/zrok-frontend.XXXXXX)"
ZROK_BACKEND_LOG="$(mktemp /tmp/zrok-backend.XXXXXX)"

ZROK_FRONTEND_PID=""
ZROK_BACKEND_PID=""

cleanup() {
  echo ""
  echo "Shutting down tunnels..."
  [[ -n "$ZROK_FRONTEND_PID" ]] && kill "$ZROK_FRONTEND_PID" 2>/dev/null || true
  [[ -n "$ZROK_BACKEND_PID" ]]  && kill "$ZROK_BACKEND_PID"  2>/dev/null || true
  rm -f "$ZROK_FRONTEND_LOG" "$ZROK_BACKEND_LOG"
  echo "Done."
}
trap cleanup EXIT INT TERM

echo "Starting zrok tunnel for frontend (port 5173)..."
zrok share public http://localhost:5173 >"$ZROK_FRONTEND_LOG" 2>&1 &
ZROK_FRONTEND_PID=$!

sleep 2

echo "Starting zrok tunnel for backend API (port 3001)..."
zrok share public http://localhost:3001 >"$ZROK_BACKEND_LOG" 2>&1 &
ZROK_BACKEND_PID=$!

# Wait up to 15 seconds for both share URLs to appear
ZROK_FRONTEND_URL=""
ZROK_BACKEND_URL=""
for i in $(seq 1 30); do
  if ! kill -0 "$ZROK_FRONTEND_PID" 2>/dev/null; then
    echo "ERROR: zrok frontend tunnel exited unexpectedly. Output:" >&2
    cat "$ZROK_FRONTEND_LOG" >&2
    exit 1
  fi
  if ! kill -0 "$ZROK_BACKEND_PID" 2>/dev/null; then
    echo "ERROR: zrok backend tunnel exited unexpectedly. Output:" >&2
    cat "$ZROK_BACKEND_LOG" >&2
    exit 1
  fi
  [[ -z "$ZROK_FRONTEND_URL" ]] && ZROK_FRONTEND_URL=$(grep -o 'https://[^ ]*share\.zrok\.io[^ ]*' "$ZROK_FRONTEND_LOG" 2>/dev/null | head -1 || true)
  [[ -z "$ZROK_BACKEND_URL" ]]  && ZROK_BACKEND_URL=$(grep -o 'https://[^ ]*share\.zrok\.io[^ ]*' "$ZROK_BACKEND_LOG"  2>/dev/null | head -1 || true)
  [[ -n "$ZROK_FRONTEND_URL" && -n "$ZROK_BACKEND_URL" ]] && break
  sleep 0.5
done

if [[ -z "$ZROK_FRONTEND_URL" ]]; then
  echo "ERROR: Could not detect zrok frontend URL after 15 seconds." >&2
  echo "zrok frontend output:" >&2
  cat "$ZROK_FRONTEND_LOG" >&2
  exit 1
fi

if [[ -z "$ZROK_BACKEND_URL" ]]; then
  echo "ERROR: Could not detect zrok backend URL after 15 seconds." >&2
  echo "zrok backend output:" >&2
  cat "$ZROK_BACKEND_LOG" >&2
  exit 1
fi

echo "✓ zrok tunnels active"
echo ""
echo "📱 Frontend:"
echo "   $ZROK_FRONTEND_URL"
echo ""
echo "🔌 Backend API:"
echo "   $ZROK_BACKEND_URL"
echo ""
echo "Press Ctrl+C to stop tunnels."

wait "$ZROK_FRONTEND_PID" "$ZROK_BACKEND_PID"
