@echo off
REM ==============================================================================
REM Autopolio E2E Test Suite - Run All Tests (Windows)
REM ==============================================================================

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..\..

echo ======================================================================
echo              Autopolio E2E Test Suite
echo ======================================================================
echo.

REM Check Docker
echo [1/4] Checking Docker containers...
docker-compose -f "%ROOT_DIR%\docker-compose.yml" ps | findstr "Up" >nul
if errorlevel 1 (
    echo Starting Docker containers...
    docker-compose -f "%ROOT_DIR%\docker-compose.yml" up -d --build
    echo Waiting for services to be ready...
    timeout /t 15 /nobreak >nul
) else (
    echo Docker containers are running.
)

REM Run API tests
echo.
echo [2/4] Running API Tests ^(pytest^)...
cd /d "%SCRIPT_DIR%..\api"

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat

pip install -q -r requirements.txt

echo.
python -m pytest -v --tb=short
set API_EXIT_CODE=%errorlevel%

call deactivate 2>nul

REM Run E2E tests
echo.
echo [3/4] Running E2E Tests ^(Playwright^)...
cd /d "%SCRIPT_DIR%..\e2e"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

REM Install Playwright browsers if needed
call npx playwright install chromium 2>nul

echo.
call npx playwright test --reporter=html
set E2E_EXIT_CODE=%errorlevel%

REM Summary
echo.
echo ======================================================================
echo                     Test Results Summary
echo ======================================================================
echo.

if %API_EXIT_CODE% equ 0 (
    echo [PASS] API Tests: PASSED
) else (
    echo [FAIL] API Tests: FAILED
)

if %E2E_EXIT_CODE% equ 0 (
    echo [PASS] E2E Tests: PASSED
) else (
    echo [FAIL] E2E Tests: FAILED
)

echo.
echo [4/4] View E2E report:
echo   npx playwright show-report "%SCRIPT_DIR%..\e2e\playwright-report"
echo.

REM Exit with error if any tests failed
set /a TOTAL_EXIT=%API_EXIT_CODE%+%E2E_EXIT_CODE%
if %TOTAL_EXIT% neq 0 (
    echo Some tests failed.
    exit /b 1
)

echo All tests completed successfully!
exit /b 0
