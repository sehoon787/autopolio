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

:: Load .env into environment (so CLI subprocess keys like GEMINI_CLI_API_KEY are available)
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if not "%%a"=="" if not "%%a:~0,1%"=="#" set "%%a=%%b"
)

:: Set runtime to local (enables CLI native login in web mode)
set AUTOPOLIO_RUNTIME=local

:: Start backend in new terminal
echo Starting FastAPI backend...
start "Autopolio API" cmd /k "cd /d %~dp0 && for /f \"usebackq tokens=1,* delims==\" %%a in (\".env\") do @if not \"%%a\"==\"\" set \"%%a=%%b\" && set AUTOPOLIO_RUNTIME=local && python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8085"

:: Wait for backend to start
timeout /t 3 /nobreak > nul

:: Start frontend in new terminal
echo Starting React frontend...
start "Autopolio Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo Autopolio Development Environment Started!
echo ============================================
echo API:      http://localhost:8085
echo API Docs: http://localhost:8085/docs
echo Frontend: http://localhost:3035
echo ============================================
echo.
