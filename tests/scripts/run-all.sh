#!/bin/bash
# ==============================================================================
# Autopolio E2E Test Suite - Run All Tests
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            Autopolio E2E Test Suite                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Docker
echo -e "${YELLOW}[1/4] Checking Docker containers...${NC}"
if ! docker-compose -f "$ROOT_DIR/docker-compose.yml" ps | grep -q "Up"; then
    echo -e "${YELLOW}Starting Docker containers...${NC}"
    docker-compose -f "$ROOT_DIR/docker-compose.yml" up -d --build
    echo "Waiting for services to be ready..."
    sleep 15
else
    echo -e "${GREEN}Docker containers are running.${NC}"
fi

# Run API tests
echo ""
echo -e "${YELLOW}[2/4] Running API Tests (pytest)...${NC}"
cd "$SCRIPT_DIR/../api"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null

pip install -q -r requirements.txt

echo ""
python -m pytest -v --tb=short
API_EXIT_CODE=$?

deactivate 2>/dev/null || true

# Run E2E tests
echo ""
echo -e "${YELLOW}[3/4] Running E2E Tests (Playwright)...${NC}"
cd "$SCRIPT_DIR/../e2e"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Install Playwright browsers if needed
npx playwright install chromium --with-deps 2>/dev/null || true

echo ""
npx playwright test --reporter=html
E2E_EXIT_CODE=$?

# Summary
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Results Summary                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $API_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ API Tests: PASSED${NC}"
else
    echo -e "${RED}✗ API Tests: FAILED${NC}"
fi

if [ $E2E_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ E2E Tests: PASSED${NC}"
else
    echo -e "${RED}✗ E2E Tests: FAILED${NC}"
fi

echo ""
echo -e "${YELLOW}[4/4] View E2E report:${NC}"
echo "  npx playwright show-report $SCRIPT_DIR/../e2e/playwright-report"
echo ""

# Exit with error if any tests failed
if [ $API_EXIT_CODE -ne 0 ] || [ $E2E_EXIT_CODE -ne 0 ]; then
    exit 1
fi

echo -e "${GREEN}All tests completed successfully!${NC}"
