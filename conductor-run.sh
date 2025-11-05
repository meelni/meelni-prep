#!/bin/bash

echo "🚀 Starting MockMate development servers..."
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM EXIT

# Start Next.js dev server
echo "▶️  Starting Next.js dev server on http://localhost:3000"
npm run dev &
NEXT_PID=$!

# Wait a moment for Next.js to start
sleep 2

# Start Python agent
echo "▶️  Starting Python LiveKit agent"
cd agent
source venv/bin/activate
python agent.py dev &
AGENT_PID=$!
cd ..

echo ""
echo "✅ Both servers running:"
echo "   - Next.js: http://localhost:3000 (PID: $NEXT_PID)"
echo "   - Agent: LiveKit worker (PID: $AGENT_PID)"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for both processes
wait
