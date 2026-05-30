#!/bin/bash
echo "Starting bp-correlation..."

# Kill anything already on these ports
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null
sleep 1

# Start Open Wearables (Oura)
echo "Starting Open Wearables..."
cd ~/open-wearables && docker compose up -d
sleep 2

# Start backend
cd ~/bp-correlation
node server.js &
BACKEND_PID=$!
echo "Backend started (PID $BACKEND_PID)"

# Start frontend
cd ~/bp-correlation/client
npx vite &
FRONTEND_PID=$!
echo "Frontend started (PID $FRONTEND_PID)"

echo ""
echo "App running at http://192.168.50.242:5173"
echo "Press Ctrl+C to stop both servers"

# Stop both when Ctrl+C is pressed
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
