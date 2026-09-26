#!/bin/sh
set -e

echo "[*] Starting game server on port 8888..."
python server.py &
SERVER_PID=$!

# Give the TCP server a moment to bind
sleep 1

echo "[*] Starting bridge (HTTP 8080 + WebSocket 8765)..."
python bridge.py &
BRIDGE_PID=$!

term() {
  echo "[!] Shutting down..."
  kill "$BRIDGE_PID" "$SERVER_PID" 2>/dev/null || true
  wait "$BRIDGE_PID" "$SERVER_PID" 2>/dev/null || true
  exit 0
}

trap term INT TERM

wait -n "$SERVER_PID" "$BRIDGE_PID"
EXIT_CODE=$?
kill "$BRIDGE_PID" "$SERVER_PID" 2>/dev/null || true
wait "$BRIDGE_PID" "$SERVER_PID" 2>/dev/null || true
exit "$EXIT_CODE"
