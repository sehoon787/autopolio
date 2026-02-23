#!/bin/bash
# ==============================================================================
# Run E2E Tests Only
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$SCRIPT_DIR/../e2e"

cd "$E2E_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Install Playwright browsers if needed
npx playwright install chromium --with-deps 2>/dev/null || true

# Run tests
echo "Running E2E tests..."
npx playwright test "$@"

echo ""
echo "View report: npx playwright show-report"
