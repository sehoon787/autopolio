#!/bin/bash
# ==============================================================================
# Setup Test Database
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Setting up test database..."

# Create test data directory if not exists
mkdir -p "$ROOT_DIR/data"

# Backup existing database if exists
if [ -f "$ROOT_DIR/data/autopolio.db" ]; then
    echo "Backing up existing database..."
    cp "$ROOT_DIR/data/autopolio.db" "$ROOT_DIR/data/autopolio.db.backup"
fi

# Run database migrations
cd "$ROOT_DIR"

if [ -d "venv" ]; then
    source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
fi

echo "Initializing database..."
python -c "
from api.database import engine, Base
from api.models import *
Base.metadata.create_all(bind=engine)
print('Database initialized successfully.')
"

# Initialize platform templates
echo "Initializing platform templates..."
python -c "
import httpx
try:
    response = httpx.post('http://localhost:8000/api/platforms/init-system')
    if response.status_code == 200:
        print('Platform templates initialized.')
    else:
        print('Platform templates may already exist.')
except Exception as e:
    print(f'Note: Could not initialize templates via API: {e}')
"

echo "Test database setup complete."
