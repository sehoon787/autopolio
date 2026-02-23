"""
CLI Service - Detect and manage Claude Code CLI on the server.
"""

import asyncio
import platform
import os
import re
import subprocess
from typing import Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import httpx

from api.config import get_settings

settings = get_settings()


class CLIService:
    """Service for detecting and managing CLI tools."""

    # Cache for latest version (avoid hammering npm registry)
    _cached_latest_version: Optional[dict] = None
    _cached_gemini_latest_version: Optional[dict] = None
    _cache_duration_seconds = 24 * 60 * 60  # 24 hours

    # Platform-specific detection paths for Claude Code
    CLAUDE_PATHS = {
        "win32": [
            "{USERPROFILE}\\AppData\\Local\\npm\\claude.cmd",
            "{USERPROFILE}\\AppData\\Roaming\\npm\\claude.cmd",
            "{USERPROFILE}\\.local\\bin\\claude.exe",
            "{LOCALAPPDATA}\\Programs\\claude\\claude.exe",
        ],
        "darwin": [
            "/opt/homebrew/bin/claude",  # Apple Silicon
            "/usr/local/bin/claude",  # Intel Mac
            "{HOME}/.local/bin/claude",
            "{HOME}/.npm-global/bin/claude",
        ],
        "linux": [
            "{HOME}/.local/bin/claude",
            "/usr/local/bin/claude",
            "{HOME}/.npm-global/bin/claude",
        ],
    }

    # Platform-specific detection paths for Gemini CLI
    GEMINI_PATHS = {
        "win32": [
            "{USERPROFILE}\\AppData\\Local\\npm\\gemini.cmd",
            "{USERPROFILE}\\AppData\\Roaming\\npm\\gemini.cmd",
        ],
        "darwin": [
            "/opt/homebrew/bin/gemini",  # Apple Silicon
            "/usr/local/bin/gemini",  # Intel Mac
            "{HOME}/.npm-global/bin/gemini",
        ],
        "linux": [
            "{HOME}/.local/bin/gemini",
            "/usr/local/bin/gemini",
            "{HOME}/.npm-global/bin/gemini",
        ],
    }

    # Installation commands per platform for Claude Code (native installer)
    INSTALL_COMMANDS = {
        "win32": "irm https://claude.ai/install.ps1 | iex",
        "darwin": "curl -fsSL https://claude.ai/install.sh | bash",
        "linux": "curl -fsSL https://claude.ai/install.sh | bash",
    }

    # Update command for Claude Code (same for all platforms)
    CLAUDE_UPDATE_COMMAND = "claude update"

    # Installation command for Gemini CLI (npm package)
    GEMINI_INSTALL_COMMAND = "npm install -g @google/gemini-cli"

    def __init__(self):
        system = platform.system().lower()
        # Normalize platform names
        if system == "windows":
            self.platform = "win32"
        elif system == "darwin":
            self.platform = "darwin"
        else:
            self.platform = "linux"

    def _expand_path(self, path_template: str) -> str:
        """Expand environment variables in path template."""
        result = path_template
        result = result.replace("{USERPROFILE}", os.environ.get("USERPROFILE", ""))
        result = result.replace("{LOCALAPPDATA}", os.environ.get("LOCALAPPDATA", ""))
        result = result.replace("{HOME}", os.environ.get("HOME", str(Path.home())))
        return result

    async def _run_command(self, cmd: list[str], timeout: int = 5) -> tuple[bool, str]:
        """Run a command and return (success, output).

        Uses subprocess.run with ThreadPoolExecutor for Windows asyncio compatibility.
        """

        def run_sync():
            # On Windows, .cmd and .bat files need to be run through cmd.exe
            use_shell = False
            if self.platform == "win32" and len(cmd) > 0:
                first_cmd = cmd[0].lower()
                use_shell = first_cmd.endswith(".cmd") or first_cmd.endswith(".bat")

            if use_shell:
                # Use cmd.exe /c prefix for Windows batch/cmd files
                exec_cmd = ["cmd.exe", "/c"] + cmd
            else:
                exec_cmd = cmd

            result = subprocess.run(
                exec_cmd,
                capture_output=True,
                timeout=timeout,
                text=True,
            )
            return result.returncode, result.stdout.strip(), result.stderr.strip()

        try:
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor(max_workers=1) as executor:
                returncode, stdout, stderr = await loop.run_in_executor(
                    executor, run_sync
                )

            if returncode == 0:
                return True, stdout
            return False, stderr
        except subprocess.TimeoutExpired:
            return False, "Command timed out"
        except FileNotFoundError:
            return False, "Command not found"
        except Exception as e:
            return False, str(e)

    async def _find_cli_in_path(self, cli_name: str) -> Optional[str]:
        """Find CLI in system PATH using which/where command."""
        if self.platform == "win32":
            # On Windows, prefer .cmd files for proper execution
            # Try with .cmd extension FIRST
            success, output = await self._run_command(["where", f"{cli_name}.cmd"])
            if success and output:
                return output.split("\n")[0].strip()

            # Then try without extension (may return shell script)
            success, output = await self._run_command(["where", cli_name])
            if success and output:
                path = output.split("\n")[0].strip()
                # Check if a .cmd version exists alongside
                cmd_path = path + ".cmd"
                if os.path.exists(cmd_path):
                    return cmd_path
                return path

            # Try PowerShell Get-Command as fallback
            success, output = await self._run_command(
                [
                    "powershell",
                    "-Command",
                    f"(Get-Command {cli_name}.cmd -ErrorAction SilentlyContinue).Source",
                ]
            )
            if success and output:
                return output.strip()

            # Final fallback without extension
            success, output = await self._run_command(
                [
                    "powershell",
                    "-Command",
                    f"(Get-Command {cli_name} -ErrorAction SilentlyContinue).Source",
                ]
            )
            if success and output:
                path = output.strip()
                cmd_path = path + ".cmd"
                if os.path.exists(cmd_path):
                    return cmd_path
                return path
        else:
            success, output = await self._run_command(["which", cli_name])
            if success and output:
                return output.split("\n")[0].strip()

        return None

    async def _find_npm_global_path(self) -> Optional[str]:
        """Find npm global packages path."""
        if self.platform == "win32":
            success, output = await self._run_command(["npm", "root", "-g"])
        else:
            success, output = await self._run_command(["npm", "root", "-g"])

        if success and output:
            # npm root -g returns node_modules path, we need parent/bin
            npm_modules = output.strip()
            if npm_modules:
                parent = Path(npm_modules).parent
                if self.platform == "win32":
                    return str(parent)  # Windows: scripts are in the same folder
                else:
                    return str(parent / "bin")
        return None

    async def _get_cli_version(self, cli_path: str) -> Optional[str]:
        """Get version from CLI tool."""
        success, output = await self._run_command([cli_path, "--version"])

        if success and output:
            # Extract version number (e.g., "1.0.17" from "claude v1.0.17")
            match = re.search(r"(\d+\.\d+\.\d+)", output)
            if match:
                return match.group(1)
            # Return first line if no version pattern found
            return output.split("\n")[0].strip()
        return None

    async def detect_claude_code(self) -> dict:
        """
        Detect Claude Code CLI installation status.
        Returns dict with: installed, version, latest_version, is_outdated, path, install_command, update_command
        """
        result = {
            "tool": "claude_code",
            "installed": False,
            "version": None,
            "latest_version": None,
            "is_outdated": False,
            "path": None,
            "install_command": self.INSTALL_COMMANDS.get(
                self.platform, self.INSTALL_COMMANDS["linux"]
            ),
            "update_command": self.CLAUDE_UPDATE_COMMAND,
            "platform": self.platform,
        }

        # First, try to find in system PATH
        path = await self._find_cli_in_path("claude")

        # If not found in PATH, check npm global path
        if not path:
            npm_global = await self._find_npm_global_path()
            if npm_global:
                if self.platform == "win32":
                    claude_cmd = os.path.join(npm_global, "claude.cmd")
                    if os.path.exists(claude_cmd):
                        path = claude_cmd
                else:
                    claude_bin = os.path.join(npm_global, "claude")
                    if os.path.exists(claude_bin):
                        path = claude_bin

        # If still not found, check known locations
        if not path:
            paths = self.CLAUDE_PATHS.get(self.platform, self.CLAUDE_PATHS["linux"])
            for path_template in paths:
                expanded_path = self._expand_path(path_template)
                if os.path.exists(expanded_path):
                    path = expanded_path
                    break

        if path:
            result["installed"] = True
            result["path"] = path
            result["version"] = await self._get_cli_version(path)

        # Claude Code has moved to native installer - no longer on npm
        # Users should run 'claude update' to check for updates
        # We don't fetch latest version anymore as there's no public registry
        result["latest_version"] = None
        result["is_outdated"] = False

        return result

    async def detect_gemini_cli(self) -> dict:
        """
        Detect Gemini CLI installation status.
        Returns dict with: installed, version, latest_version, is_outdated, path, install_command
        """
        result = {
            "tool": "gemini_cli",
            "installed": False,
            "version": None,
            "latest_version": None,
            "is_outdated": False,
            "path": None,
            "install_command": self.GEMINI_INSTALL_COMMAND,
            "platform": self.platform,
        }

        # First, try to find in system PATH
        path = await self._find_cli_in_path("gemini")

        # If not found in PATH, check npm global path
        if not path:
            npm_global = await self._find_npm_global_path()
            if npm_global:
                if self.platform == "win32":
                    gemini_cmd = os.path.join(npm_global, "gemini.cmd")
                    if os.path.exists(gemini_cmd):
                        path = gemini_cmd
                else:
                    gemini_bin = os.path.join(npm_global, "gemini")
                    if os.path.exists(gemini_bin):
                        path = gemini_bin

        # If still not found, check known locations
        if not path:
            paths = self.GEMINI_PATHS.get(self.platform, self.GEMINI_PATHS["linux"])
            for path_template in paths:
                expanded_path = self._expand_path(path_template)
                if os.path.exists(expanded_path):
                    path = expanded_path
                    break

        if path:
            result["installed"] = True
            result["path"] = path
            result["version"] = await self._get_cli_version(path)

        # Fetch latest version from npm registry
        try:
            result["latest_version"] = await self.get_latest_gemini_version()
            if result["version"] and result["latest_version"]:
                result["is_outdated"] = self._compare_versions(
                    result["version"], result["latest_version"]
                )
        except Exception:
            result["latest_version"] = "unknown"

        return result

    async def get_latest_gemini_version(self) -> str:
        """Fetch the latest version of Gemini CLI from npm registry."""
        import time

        # Check cache first
        if (
            self._cached_gemini_latest_version
            and time.time() - self._cached_gemini_latest_version.get("timestamp", 0)
            < self._cache_duration_seconds
        ):
            return self._cached_gemini_latest_version["version"]

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://registry.npmjs.org/@google/gemini-cli/latest",
                headers={"Accept": "application/json"},
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            version = data.get("version")

            if version:
                # Cache the result
                CLIService._cached_gemini_latest_version = {
                    "version": version,
                    "timestamp": time.time(),
                }
                return version

        raise ValueError("Could not fetch latest Gemini CLI version from npm registry")

    def _compare_versions(self, current: str, latest: str) -> bool:
        """Compare version strings. Returns True if current < latest."""
        try:
            current_parts = [int(x) for x in current.replace("v", "").split(".")]
            latest_parts = [int(x) for x in latest.replace("v", "").split(".")]

            # Pad shorter version with zeros
            while len(current_parts) < len(latest_parts):
                current_parts.append(0)
            while len(latest_parts) < len(current_parts):
                latest_parts.append(0)

            return current_parts < latest_parts
        except (ValueError, AttributeError):
            return False

    def get_installation_command(self, tool: str = "claude_code") -> str:
        """Get platform-specific installation command."""
        if tool == "claude_code":
            return self.INSTALL_COMMANDS.get(
                self.platform, self.INSTALL_COMMANDS["linux"]
            )
        elif tool == "gemini_cli":
            return self.GEMINI_INSTALL_COMMAND
        return ""


# Singleton instance
_cli_service: Optional[CLIService] = None


def get_cli_service() -> CLIService:
    """Get singleton CLI service instance."""
    global _cli_service
    if _cli_service is None:
        _cli_service = CLIService()
    return _cli_service
