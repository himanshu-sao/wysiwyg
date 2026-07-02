#!/bin/bash

# AI UI Editor - Validate Script
# Validates servers, extension build, and project structure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔍 Validating AI UI Editor..."
echo ""

ERRORS=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check result
check_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        ERRORS=$((ERRORS + 1))
    fi
}

check_warning() {
    if [ $1 -ne 0 ]; then
        echo -e "${YELLOW}⚠️  $2${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✅ $2${NC}"
    fi
}

echo "═══════════════════════════════════════"
echo "1. Server Status"
echo "═══════════════════════════════════════"

# Check middleware server
curl -s --connect-timeout 2 http://localhost:3000/health > /dev/null 2>&1
check_result $? "Middleware server (port 3000)"

# Check sample project
curl -s --connect-timeout 2 http://localhost:5174 > /dev/null 2>&1
check_result $? "Sample project (port 5174)"

echo ""
echo "═══════════════════════════════════════"
echo "2. Project Structure"
echo "═══════════════════════════════════════"

# Check required directories
[ -d "extension" ]
check_result $? "extension/ directory exists"

[ -d "middleware" ]
check_result $? "middleware/ directory exists"

[ -d "sample-project" ]
check_result $? "sample-project/ directory exists"

[ -d "shared" ]
check_result $? "shared/ directory exists"

# Check required files
[ -f "extension/manifest.json" ]
check_result $? "extension/manifest.json exists"

[ -f "middleware/package.json" ]
check_result $? "middleware/package.json exists"

[ -f "sample-project/package.json" ]
check_result $? "sample-project/package.json exists"

[ -f "shared/types.ts" ]
check_result $? "shared/types.ts exists"

[ -f "README.md" ]
check_result $? "README.md exists"

echo ""
echo "═══════════════════════════════════════"
echo "3. Extension Build"
echo "═══════════════════════════════════════"

# Check if extension is built
[ -d "extension/dist" ]
check_result $? "extension/dist/ directory exists"

[ -f "extension/dist/popup/index.html" ]
check_result $? "extension/dist/popup/index.html exists"

if [ ! -d "extension/dist" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Extension not built. Run: cd extension && npm run build${NC}"
fi

echo ""
echo "═══════════════════════════════════════"
echo "4. Dependencies"
echo "═══════════════════════════════════════"

# Check node_modules
[ -d "middleware/node_modules" ]
check_result $? "middleware dependencies installed"

[ -d "extension/node_modules" ]
check_result $? "extension dependencies installed"

[ -d "sample-project/node_modules" ]
check_result $? "sample-project dependencies installed"

echo ""
echo "═══════════════════════════════════════"
echo "5. API Health Checks"
echo "═══════════════════════════════════════"

# Test AI edit endpoint
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/ai_test.json http://localhost:3000/api/ai/edit \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"element":{"html":"<div>Test</div>","computedStyles":{},"classNames":[],"hierarchy":["div","body"],"eventListeners":[]},"instruction":"Make it blue","context":{"url":"http://localhost","framework":"react","projectRoot":"/tmp"}}')

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ POST /api/ai/edit${NC}"
else
    echo -e "${RED}❌ POST /api/ai/edit (HTTP $RESPONSE)${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Test health endpoint
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/health.json http://localhost:3000/health)
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ GET /health${NC}"
else
    echo -e "${RED}❌ GET /health (HTTP $HEALTH_RESPONSE)${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "═══════════════════════════════════════"
echo "6. TypeScript Validation"
echo "═══════════════════════════════════════"

# Check if TypeScript compiles
cd middleware
if command -v npx &> /dev/null; then
    npx tsc --noEmit > /tmp/tsc_middleware.log 2>&1
    check_warning $? "middleware TypeScript compiles"
else
    echo -e "${YELLOW}⚠️  TypeScript not available for validation${NC}"
fi
cd ..

cd extension
if command -v npx &> /dev/null; then
    npx tsc --noEmit > /tmp/tsc_extension.log 2>&1
    check_warning $? "extension TypeScript compiles"
else
    echo -e "${YELLOW}⚠️  TypeScript not available for validation${NC}"
fi
cd ..

echo ""
echo "═══════════════════════════════════════"
echo "Validation Summary"
echo "═══════════════════════════════════════"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}🎉 All validations passed!${NC}"
    echo ""
    echo "Your AI UI Editor is ready to use!"
    echo ""
    echo "Quick start:"
    echo "  1. Open Chrome and go to chrome://extensions/"
    echo "  2. Enable Developer mode"
    echo "  3. Click 'Load unpacked' and select extension/dist/"
    echo "  4. Navigate to http://localhost:5174"
    echo "  5. Right-click any element to edit with AI"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Passed with $WARNINGS warning(s)${NC}"
    echo ""
    echo "The project is functional but has some warnings."
    exit 0
else
    echo -e "${RED}❌ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo "Please fix the errors above before continuing."
    exit 1
fi
