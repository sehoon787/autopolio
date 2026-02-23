@echo off
REM ==============================================================================
REM Run E2E Tests Only (Windows)
REM ==============================================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%..\e2e"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

call npx playwright install chromium 2>nul

echo Running E2E tests...
call npx playwright test %*

echo.
echo View report: npx playwright show-report
