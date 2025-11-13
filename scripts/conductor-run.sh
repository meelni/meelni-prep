#!/bin/bash

echo "🚀 Starting Meelni development servers..."
echo ""

# Get the workspace root (parent of scripts directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKSPACE_DIR"

echo "📂 Working directory: $WORKSPACE_DIR"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM EXIT

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
    echo ""
fi

# Start Next.js dev server from workspace directory
echo "▶️  Starting Next.js dev server on http://localhost:3000"
npm run dev &
NEXT_PID=$!

# Wait a moment for Next.js to start
sleep 2

# Start Python agent from parent project (where venv actually exists)
echo "▶️  Starting Python LiveKit agent"
PARENT_DIR="$(dirname "$(dirname "$WORKSPACE_DIR")")"
if [ -d "$PARENT_DIR/agent" ]; then
    cd "$PARENT_DIR/agent"
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
        python agent.py dev &
        AGENT_PID=$!
        cd "$WORKSPACE_DIR"
        echo "   ✓ Agent started from $PARENT_DIR/agent"
    else
        echo "   ⚠️  Python venv not found. Skipping agent startup."
        echo "   Run: cd $PARENT_DIR/agent && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    fi
else
    echo "   ⚠️  Agent directory not found. Skipping agent startup."
fi

echo ""
echo "✅ Servers status:"
echo "   - Next.js: http://localhost:3000 (PID: $NEXT_PID)"
if [ ! -z "$AGENT_PID" ]; then
    echo "   - Agent: LiveKit worker (PID: $AGENT_PID)"
else
    echo "   - Agent: Not running (manual start required)"
fi
echo ""
echo "Press Ctrl+C to stop servers"

# Wait for processes
wait
