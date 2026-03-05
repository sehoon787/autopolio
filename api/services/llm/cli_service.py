"""
CLI Service - Detect and manage Claude Code CLI on the server.
"""

import asyncio
import json
import logging
import platform
import os
import re
import subprocess
from typing import Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import httpx

from api.config import get_settings
from api.constants import CLIType, CODEX_AUTH_PATH

settings = get_settings()
logger = logging.getLogger(__name__)

# Active login process (singleton — only one login at a time)
_active_login_process: Optional[subprocess.Popen] = None


class CLIService:
    """Service for detecting and managing CLI tools."""

    # Cache for latest version (avoid hammering npm registry)
    _cached_latest_version: Optional[dict] = None
    _cached_gemini_latest_version: Optional[dict] = None
    _cached_codex_latest_version: Optional[dict] = None
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
            "{HOME}/.claude/local/bin/claude",
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

    # Platform-specific detection paths for Codex CLI
    CODEX_PATHS = {
        "win32": [
            "{USERPROFILE}\\AppData\\Local\\npm\\codex.cmd",
            "{USERPROFILE}\\AppData\\Roaming\\npm\\codex.cmd",
        ],
        "darwin": [
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex",
            "{HOME}/.npm-global/bin/codex",
        ],
        "linux": [
            "{HOME}/.local/bin/codex",
            "/usr/local/bin/codex",
            "{HOME}/.npm-global/bin/codex",
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

    # Installation command for Codex CLI (npm package)
    CODEX_INSTALL_COMMAND = "npm install -g @openai/codex"

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
            "tool": CLIType.CLAUDE_CODE,
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
            "tool": CLIType.GEMINI_CLI,
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

            # Fallback: gemini --version hangs in some environments (e.g. Docker)
            if not result["version"]:
                result["version"] = await self._get_npm_package_version(
                    "@google/gemini-cli"
                )

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

    async def _get_npm_package_version(self, package_name: str) -> Optional[str]:
        """Get installed npm global package version via `npm list -g`."""
        success, output = await self._run_command(
            ["npm", "list", "-g", package_name, "--json"], timeout=10
        )
        if success and output:
            try:
                data = json.loads(output)
                return data.get("dependencies", {}).get(package_name, {}).get("version")
            except (json.JSONDecodeError, ValueError):
                pass
        return None

    async def detect_codex_cli(self) -> dict:
        """
        Detect Codex CLI installation status.
        Returns dict with: installed, version, latest_version, is_outdated, path, install_command
        """
        result = {
            "tool": CLIType.CODEX_CLI,
            "installed": False,
            "version": None,
            "latest_version": None,
            "is_outdated": False,
            "path": None,
            "install_command": self.CODEX_INSTALL_COMMAND,
            "platform": self.platform,
        }

        # First, try to find in system PATH
        path = await self._find_cli_in_path("codex")

        # If not found in PATH, check npm global path
        if not path:
            npm_global = await self._find_npm_global_path()
            if npm_global:
                if self.platform == "win32":
                    codex_cmd = os.path.join(npm_global, "codex.cmd")
                    if os.path.exists(codex_cmd):
                        path = codex_cmd
                else:
                    codex_bin = os.path.join(npm_global, "codex")
                    if os.path.exists(codex_bin):
                        path = codex_bin

        # If still not found, check known locations
        if not path:
            paths = self.CODEX_PATHS.get(self.platform, self.CODEX_PATHS["linux"])
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
            result["latest_version"] = await self.get_latest_codex_version()
            if result["version"] and result["latest_version"]:
                result["is_outdated"] = self._compare_versions(
                    result["version"], result["latest_version"]
                )
        except Exception:
            result["latest_version"] = "unknown"

        return result

    async def get_latest_codex_version(self) -> str:
        """Fetch the latest version of Codex CLI from npm registry."""
        import time

        # Check cache first
        if (
            self._cached_codex_latest_version
            and time.time() - self._cached_codex_latest_version.get("timestamp", 0)
            < self._cache_duration_seconds
        ):
            return self._cached_codex_latest_version["version"]

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://registry.npmjs.org/@openai/codex/latest",
                headers={"Accept": "application/json"},
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            version = data.get("version")

            if version:
                CLIService._cached_codex_latest_version = {
                    "version": version,
                    "timestamp": time.time(),
                }
                return version

        raise ValueError("Could not fetch latest Codex CLI version from npm registry")

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

    # ========================================================================
    # CLI Auth Methods (for web-local mode)
    # ========================================================================

    async def check_auth_status(self, cli_type: str) -> dict:
        """Check CLI authentication status (no token consumed)."""
        if cli_type == CLIType.CLAUDE_CODE:
            return await self._check_claude_auth()
        elif cli_type == CLIType.GEMINI_CLI:
            return self._check_gemini_auth()
        elif cli_type == CLIType.CODEX_CLI:
            return await self._check_codex_auth()
        return {"authenticated": False, "error": f"Unknown CLI type: {cli_type}"}

    async def _check_claude_auth(self) -> dict:
        """Check Claude Code auth via `claude auth status`."""
        path = await self._find_cli_in_path("claude")
        if not path:
            return {"authenticated": False, "error": "Claude Code CLI not found"}

        success, output = await self._run_command([path, "auth", "status"], timeout=10)
        if not success and not output:
            return {"authenticated": False}

        combined = output.strip()
        logger.info("claude auth status output: %s", combined[:200])

        # Try JSON parse (Claude Code v2.1+)
        try:
            data = json.loads(combined)
            if data.get("loggedIn"):
                method = "oauth" if self.is_oauth_auth_method(data) else "api_key"
                return {
                    "authenticated": True,
                    "method": method,
                    "email": data.get("email"),
                }
            return {"authenticated": False}
        except (json.JSONDecodeError, ValueError):
            pass

        # Fallback text matching
        lower = combined.lower()
        if "logged in" in lower or "\u2713" in combined:
            email_match = re.search(
                r"(?:email|account|as)\s*[:=]?\s*(\S+@\S+)", combined, re.IGNORECASE
            )
            return {
                "authenticated": True,
                "method": "oauth",
                "email": email_match.group(1) if email_match else None,
            }
        return {"authenticated": False}

    def _check_gemini_auth(self) -> dict:
        """Check Gemini CLI auth by checking credential files."""
        home = os.environ.get("HOME", str(Path.home()))
        gemini_dir = os.path.join(home, ".gemini")
        oauth_creds = os.path.join(gemini_dir, "oauth_creds.json")
        google_accounts = os.path.join(gemini_dir, "google_accounts.json")

        try:
            if os.path.exists(oauth_creds):
                account = None
                if os.path.exists(google_accounts):
                    try:
                        with open(google_accounts) as f:
                            data = json.load(f)
                        if isinstance(data, list) and len(data) > 0:
                            account = data[0].get("email") or data[0].get("account")
                        elif isinstance(data, dict):
                            # {"active": "user@gmail.com", "old": []}
                            account = (
                                data.get("active")
                                or data.get("email")
                                or data.get("account")
                            )
                    except (json.JSONDecodeError, OSError):
                        pass
                return {"authenticated": True, "method": "oauth", "account": account}
        except OSError:
            pass
        return {"authenticated": False}

    async def _check_codex_auth(self) -> dict:
        """Check Codex CLI auth via `codex login status`, fallback to auth file."""
        path = await self._find_cli_in_path("codex")
        if not path:
            return {"authenticated": False, "error": "Codex CLI not found"}

        success, output = await self._run_command([path, "login", "status"], timeout=10)
        combined = output.strip()
        logger.info("codex login status output: %s", combined[:200])

        if success or "logged in" in combined.lower() or "\u2713" in combined:
            email_match = re.search(
                r"(?:email|account|as|user)\s*[:=]?\s*(\S+@\S+)",
                combined,
                re.IGNORECASE,
            )
            account = email_match.group(1) if email_match else None

            # If no email in CLI output, try extracting from auth.json JWT
            if not account:
                account = self._get_codex_account_from_file()

            return {
                "authenticated": True,
                "method": "oauth",
                "account": account,
            }

        # Fallback: check ~/.codex/auth.json
        auth_file = str(CODEX_AUTH_PATH)
        try:
            if os.path.exists(auth_file):
                with open(auth_file) as f:
                    data = json.load(f)

                # Check for tokens (OAuth login via ChatGPT)
                tokens = data.get("tokens", {})
                has_auth = (
                    data.get("token")
                    or data.get("api_key")
                    or tokens.get("access_token")
                )
                if has_auth:
                    account = data.get("email")
                    method = "api_key" if data.get("api_key") else "oauth"

                    # Try extracting email from JWT id_token
                    if not account and tokens.get("id_token"):
                        account = self._extract_email_from_jwt(tokens["id_token"])

                    return {
                        "authenticated": True,
                        "method": method,
                        "account": account,
                    }
        except (json.JSONDecodeError, OSError):
            pass
        return {"authenticated": False}

    @staticmethod
    def is_oauth_auth_method(auth_data: dict) -> bool:
        """Check if Claude auth status JSON indicates OAuth (not API key).

        Shared logic used by both cli_service and cli_llm_service.
        Policy: authMethod == "api_key" means .env key, NOT OAuth.
        """
        if not auth_data.get("loggedIn", False):
            return False
        return auth_data.get("authMethod") != "api_key"

    @staticmethod
    def _extract_email_from_jwt(token: str) -> Optional[str]:
        """Extract email from JWT payload (no signature verification)."""
        import base64

        try:
            parts = token.split(".")
            if len(parts) < 2:
                return None
            # Add padding
            payload = parts[1]
            payload += "=" * (4 - len(payload) % 4)
            decoded = base64.urlsafe_b64decode(payload)
            data = json.loads(decoded)
            return data.get("email")
        except Exception:
            return None

    def _get_codex_account_from_file(self) -> Optional[str]:
        """Try to extract account email from ~/.codex/auth.json JWT."""
        auth_file = str(CODEX_AUTH_PATH)
        try:
            if os.path.exists(auth_file):
                with open(auth_file) as f:
                    data = json.load(f)
                # Direct email field
                if data.get("email"):
                    return data["email"]
                # Extract from JWT id_token
                tokens = data.get("tokens", {})
                if tokens.get("id_token"):
                    return self._extract_email_from_jwt(tokens["id_token"])
        except (json.JSONDecodeError, OSError):
            pass
        return None

    async def start_login(self, cli_type: str) -> dict:
        """Start CLI login process, return URL if applicable."""
        global _active_login_process

        # Cancel any active login
        if _active_login_process:
            try:
                _active_login_process.kill()
            except OSError:
                pass
            _active_login_process = None

        if cli_type == CLIType.CLAUDE_CODE:
            return await self._start_claude_login()
        elif cli_type == CLIType.CODEX_CLI:
            return await self._start_codex_login()
        elif cli_type == CLIType.GEMINI_CLI:
            return await self._start_gemini_login()

        return {"success": False, "message": f"Login not supported for {cli_type}"}

    async def _spawn_login_and_extract_url(
        self, cmd: list[str], timeout_sec: int = 15
    ) -> str | None:
        """Spawn a CLI login command, read stdout/stderr for up to
        *timeout_sec* seconds, and return the first URL found (or None).

        The CLI process is kept alive after URL extraction so it can complete
        the OAuth callback exchange. A background thread waits for the process
        to finish (up to 3 minutes) and cleans up afterward.
        """
        global _active_login_process
        url_pattern = re.compile(r"https?://[^\s<>\x1b]+")

        import select
        import time
        import threading

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE,
        )
        _active_login_process = proc

        # Phase 1: read output until URL is found or timeout
        output = b""
        deadline = time.time() + timeout_sec
        url = None
        while time.time() < deadline:
            try:
                readable, _, _ = select.select([proc.stdout, proc.stderr], [], [], 2.0)
                for stream in readable:
                    chunk = os.read(stream.fileno(), 4096)
                    if chunk:
                        output += chunk
            except (OSError, ValueError):
                break

            text = output.decode("utf-8", errors="replace")
            url_match = url_pattern.search(text)
            if url_match:
                url = url_match.group(0)
                break

            if proc.poll() is not None:
                break

        if not url:
            # No URL found — kill the process
            try:
                proc.kill()
            except OSError:
                pass
            _active_login_process = None
            return None

        # Phase 2: keep process alive in background so CLI can complete
        # OAuth token exchange when user authorizes in the browser
        def _wait_for_login_completion():
            global _active_login_process
            try:
                proc.wait(timeout=180)  # 3 minutes max
            except subprocess.TimeoutExpired:
                try:
                    proc.kill()
                except OSError:
                    pass
            finally:
                if _active_login_process is proc:
                    _active_login_process = None

        threading.Thread(target=_wait_for_login_completion, daemon=True).start()

        return url

    async def _start_claude_login(self) -> dict:
        """Start Claude Code OAuth login via `claude auth login`."""
        path = await self._find_cli_in_path("claude")
        if not path:
            return {"success": False, "message": "Claude Code CLI not found"}

        cmd = self._shell_wrap(path, ["auth", "login"])
        url = await self._spawn_login_and_extract_url(cmd)
        if url:
            return {"success": True, "url": url}
        return {
            "success": True,
            "url": "https://console.anthropic.com/settings/keys",
            "message": "Could not extract login URL. Opening API key page.",
        }

    async def _start_codex_login(self) -> dict:
        """Start Codex OAuth login via `codex login --device-auth`."""
        path = await self._find_cli_in_path("codex")
        if not path:
            return {"success": False, "message": "Codex CLI not found"}

        cmd = self._shell_wrap(path, ["login", "--device-auth"])
        url = await self._spawn_login_and_extract_url(cmd)
        if url:
            return {"success": True, "url": url}
        return {
            "success": True,
            "url": "https://platform.openai.com/api-keys",
            "message": "Could not extract login URL. Opening API key page.",
        }

    async def _start_gemini_login(self) -> dict:
        """Start Gemini CLI OAuth login via `gemini auth login`."""
        path = await self._find_cli_in_path("gemini")
        if not path:
            return {"success": False, "message": "Gemini CLI not found"}

        cmd = self._shell_wrap(path, ["auth", "login"])
        url = await self._spawn_login_and_extract_url(cmd)
        if url:
            return {"success": True, "url": url}
        return {
            "success": True,
            "url": "https://aistudio.google.com/apikey",
            "message": "Could not extract login URL. Opening API key page.",
        }

    def _shell_wrap(self, path: str, args: list[str]) -> list[str]:
        """Wrap a CLI command for platform-specific shell execution."""
        if self.platform == "win32" and path.lower().endswith((".cmd", ".bat")):
            return ["cmd.exe", "/c", path, *args]
        return [path, *args]

    async def submit_auth_code(self, code: str) -> dict:
        """Submit OAuth authorization code to the active CLI login process.

        Claude Code's `auth login` prints a URL, then waits for the user to
        paste the authorization code into stdin.  This method writes the code
        to the running process's stdin so the CLI can exchange it for tokens.
        """
        global _active_login_process
        if not _active_login_process:
            return {"success": False, "message": "No active login process"}

        if _active_login_process.poll() is not None:
            _active_login_process = None
            return {"success": False, "message": "Login process already exited"}

        try:
            _active_login_process.stdin.write((code.strip() + "\n").encode("utf-8"))
            _active_login_process.stdin.flush()
            return {"success": True, "message": "Auth code submitted"}
        except (OSError, BrokenPipeError) as e:
            return {"success": False, "message": f"Failed to write code: {e}"}

    async def cancel_login(self) -> dict:
        """Cancel any active login process."""
        global _active_login_process
        if _active_login_process:
            try:
                _active_login_process.kill()
            except OSError:
                pass
            _active_login_process = None
            return {"success": True}
        return {"success": True, "message": "No active login process"}

    async def logout(self, cli_type: str) -> dict:
        """Logout from a CLI tool."""
        if cli_type == CLIType.CLAUDE_CODE:
            path = await self._find_cli_in_path("claude")
            if not path:
                return {"success": False, "message": "Claude Code CLI not found"}
            await self._run_command([path, "auth", "logout"], timeout=10)
            return {"success": True, "message": "Logged out from Claude Code"}

        if cli_type == CLIType.CODEX_CLI:
            path = await self._find_cli_in_path("codex")
            if not path:
                return {"success": False, "message": "Codex CLI not found"}
            success, output = await self._run_command([path, "logout"], timeout=10)
            return {"success": True, "message": "Logged out from Codex CLI"}

        if cli_type == CLIType.GEMINI_CLI:
            path = await self._find_cli_in_path("gemini")
            if path:
                await self._run_command([path, "auth", "logout"], timeout=10)
            # Also clean up credential files as fallback
            home = os.environ.get("HOME", str(Path.home()))
            gemini_dir = os.path.join(home, ".gemini")
            for fname in ["oauth_creds.json", "google_accounts.json"]:
                fpath = os.path.join(gemini_dir, fname)
                try:
                    if os.path.exists(fpath):
                        os.remove(fpath)
                except OSError as e:
                    logger.warning("Failed to remove %s: %s", fpath, e)
            return {"success": True, "message": "Logged out from Gemini CLI"}

        return {"success": False, "message": f"Logout not supported for {cli_type}"}

    def get_installation_command(self, tool: str = CLIType.CLAUDE_CODE) -> str:
        """Get platform-specific installation command."""
        if tool == CLIType.CLAUDE_CODE:
            return self.INSTALL_COMMANDS.get(
                self.platform, self.INSTALL_COMMANDS["linux"]
            )
        elif tool == CLIType.GEMINI_CLI:
            return self.GEMINI_INSTALL_COMMAND
        elif tool == CLIType.CODEX_CLI:
            return self.CODEX_INSTALL_COMMAND
        return ""


# Singleton instance
_cli_service: Optional[CLIService] = None


def get_cli_service() -> CLIService:
    """Get singleton CLI service instance."""
    global _cli_service
    if _cli_service is None:
        _cli_service = CLIService()
    return _cli_service
