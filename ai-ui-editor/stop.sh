#!/bin/bash

# AI UI Editor - Stop Script
# Stops both middleware server and sample project

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Stopping AI UI Editor..."
echo ""

# Kill processes by port
echo "Checking port 3000 (middleware)..."
if lsof -ti:3000 > /dev/null 2>&1; then
    MIDDLWARE_PID=$(lsof -ti:3000)
    kill -9 $MIDDLWARE_PID 2>/dev/null || true
    echo "✅ Middleware server stopped (PID: $MIDDLWARE_PID)"
else
    echo "ℹ️  No process running on port 3000"
fi

echo ""
echo "Checking port 5174 (sample project)..."
if lsof -ti:5174 > /dev/null 2>&1; then
    SAMPLE_PID=$(lsof -ti:5174)
    kill -9 $SAMPLE_PID 2>/dev/null || true
    echo "✅ Sample project stopped (PID: $SAMPLE_PID)"
else
    echo "ℹ️  No process running on port 5174"
fi

# Also kill any node processes in our directories
echo ""
echo "Cleaning up background processes..."
pkill -f "ai-ui-editor/middleware" 2>/dev/null || true
pkill -f "ai-ui-editor/sample-project" 2>/dev/null || true

# Remove PID file
if [ -f .pids ]; then
    rm .pids
    echo "✅ Removed .pids file"
fi

echo ""
echo "✅ All servers stopped successfully!"
echo ""

# Verify ports are free
echo "🔍 Verifying ports are free..."
sleep 1

if lsof -ti:3000 > /dev/null 2>&1; then
    echo "⚠️  Port 3000 still in use"
else
    echo "✅ Port 3000 is free"
fi

if lsof -ti:5174 > /dev/null 2>&1; then
    echo "⚠️  Port 5174 still in use"
else
    echo "✅ Port 5174 is free"
fi

echo ""
echo "👋 Goodbye!"
