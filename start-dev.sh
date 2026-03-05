#!/bin/bash

echo "Starting Autopolio Development Environment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "Please edit .env with your API keys before continuing."
    exit 1
fi

# Create data directories if they don't exist
mkdir -p data result

# Function to cleanup on exit
cleanup() {
    echo "Stopping services..."
    kill $API_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Install dependencies with uv
echo "Installing dependencies with uv..."
uv sync

# Load .env into shell environment (so CLI subprocess keys like GEMINI_CLI_API_KEY are available)
set -a && source .env && set +a

# Set runtime to local (enables CLI native login in web mode)
export AUTOPOLIO_RUNTIME=local

# Start backend
echo "Starting FastAPI backend..."
uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8085 &
API_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting React frontend..."
cd frontend && npm install && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "============================================"
echo "Autopolio Development Environment Started!"
echo "============================================"
echo "API:      http://localhost:8085"
echo "API Docs: http://localhost:8085/docs"
echo "Frontend: http://localhost:3035"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for processes
wait
