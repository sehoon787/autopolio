#!/bin/bash
# ==============================================================================
# Generate Test Report
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="$SCRIPT_DIR/../reports"

echo "Generating test reports..."

# Create reports directory
mkdir -p "$REPORT_DIR"

# Generate API test report
echo "Generating API test report..."
cd "$SCRIPT_DIR/../api"

if [ -d "venv" ]; then
    source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
fi

python -m pytest --html="$REPORT_DIR/api-report.html" --self-contained-html -v || true

deactivate 2>/dev/null || true

# E2E report is already generated in playwright-report
echo "E2E report available at: $SCRIPT_DIR/../e2e/playwright-report"

# Summary
echo ""
echo "Reports generated:"
echo "  - API Report: $REPORT_DIR/api-report.html"
echo "  - E2E Report: $SCRIPT_DIR/../e2e/playwright-report/index.html"
echo ""
echo "To view E2E report: npx playwright show-report $SCRIPT_DIR/../e2e/playwright-report"
