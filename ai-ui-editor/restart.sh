#!/bin/bash

# AI UI Editor - Restart Script
# Restarts both middleware server and sample project

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔄 Restarting AI UI Editor..."
echo ""

# Run stop script
echo "⏹️  Stopping existing servers..."
./stop.sh

echo ""
echo "----------------------------------------"
echo ""

# Wait a moment for ports to be released
sleep 2

# Run start script
echo "▶️  Starting servers..."
./start.sh
