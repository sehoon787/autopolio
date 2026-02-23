@echo off
REM ==============================================================================
REM Run API Tests Only (Windows)
REM ==============================================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%..\api"

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat

pip install -q -r requirements.txt

echo Running API tests...
python -m pytest %*

call deactivate 2>nul
