#!/bin/bash

# AI UI Editor - Start Script
# Starts both middleware server and sample project

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting AI UI Editor..."
echo ""

# Check if middleware is already running
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "⚠️  Middleware server already running on port 3000"
else
    echo "📦 Starting middleware server on port 3000..."
    cd middleware
    npm run dev &
    MIDDLWARE_PID=$!
    cd ..
    echo "✅ Middleware server started (PID: $MIDDLWARE_PID)"
fi

# Check if sample project is already running
if lsof -ti:5174 > /dev/null 2>&1; then
    echo "⚠️  Sample project already running on port 5174"
else
    echo "📦 Starting sample project on port 5174..."
    cd sample-project
    npm run dev &
    SAMPLE_PID=$!
    cd ..
    echo "✅ Sample project started (PID: $SAMPLE_PID)"
fi

echo ""
echo "⏳ Waiting for servers to be ready..."
sleep 3

# Verify servers are running
echo ""
echo "🔍 Checking server status..."

if curl -s --connect-timeout 2 http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Middleware server is healthy (http://localhost:3000)"
else
    echo "❌ Middleware server failed to start"
fi

if curl -s --connect-timeout 2 http://localhost:5174 > /dev/null 2>&1; then
    echo "✅ Sample project is running (http://localhost:5174)"
else
    echo "❌ Sample project failed to start"
fi

echo ""
echo "🎉 AI UI Editor is ready!"
echo ""
echo "📝 Next steps:"
echo "   1. Build extension: cd extension && npm run build"
echo "   2. Load extension in Chrome: chrome://extensions/ -> Developer mode -> Load unpacked"
echo "   3. Navigate to: http://localhost:5174"
echo "   4. Right-click any element to start editing with AI"
echo ""
echo "🛑 To stop: ./stop.sh"
echo ""

# Save PIDs to file for later cleanup
if [ -n "$MIDDLWARE_PID" ] || [ -n "$SAMPLE_PID" ]; then
    echo "$MIDDLWARE_PID" > .pids
    echo "$SAMPLE_PID" >> .pids
    echo "💾 PIDs saved to .pids"
fi
