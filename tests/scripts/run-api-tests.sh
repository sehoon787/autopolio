#!/bin/bash
# ==============================================================================
# Run API Tests Only
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$SCRIPT_DIR/../api"

cd "$API_DIR"

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate venv
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null

# Install dependencies
pip install -q -r requirements.txt

# Run tests
echo "Running API tests..."
python -m pytest "$@"

deactivate 2>/dev/null || true
