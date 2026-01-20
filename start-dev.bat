@echo off
echo Starting Autopolio Development Environment...

:: Check if .env exists
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo Please edit .env with your API keys before continuing.
    pause
    exit /b 1
)

:: Create data directories if they don't exist
if not exist data mkdir data
if not exist result mkdir result

:: Install dependencies with uv
echo Installing dependencies with uv...
uv sync

:: Start backend in new terminal
echo Starting FastAPI backend...
start "Autopolio API" cmd /k "cd /d %~dp0 && uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000"

:: Wait for backend to start
timeout /t 3 /nobreak > nul

:: Start frontend in new terminal
echo Starting React frontend...
start "Autopolio Frontend" cmd /k "cd /d %~dp0frontend && npm install && npm run dev"

echo.
echo ============================================
echo Autopolio Development Environment Started!
echo ============================================
echo API:      http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo Frontend: http://localhost:5173
echo ============================================
echo.
