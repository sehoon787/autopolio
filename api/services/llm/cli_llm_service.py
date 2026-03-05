"""
CLI LLM Service - Execute LLM prompts via CLI tools (Claude Code, Gemini CLI).

Uses subprocess to run CLI commands and capture output.
Parses JSON output for token tracking when --output-format json is used.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import shutil
from typing import Tuple, Optional, List
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from api.constants import (
    CLIType,
    SummaryStyle,
    CLI_TIMEOUT_SECONDS,
    CLI_EXECUTABLE_NAMES,
    CLI_SUBPROCESS_ENV_MAP,
    CLI_STDERR_NOISE_PATTERNS,
    GEMINI_SETTINGS_PATH,
    GEMINI_AUTH_API_KEY,
    GEMINI_AUTH_OAUTH,
    CLI_OAUTH_ATTEMPT_TIMEOUT,
    CAPACITY_ERROR_PATTERNS,
    CODEX_AUTH_PATH,
)

logger = logging.getLogger(__name__)


def _switch_gemini_auth(auth_type: str) -> bool:
    """Switch Gemini CLI auth type in settings.json. Returns True on success."""
    try:
        data = {}
        if GEMINI_SETTINGS_PATH.exists():
            data = json.loads(GEMINI_SETTINGS_PATH.read_text())
        data.setdefault("security", {}).setdefault("auth", {})["selectedType"] = (
            auth_type
        )
        GEMINI_SETTINGS_PATH.write_text(json.dumps(data))
        logger.info("[CLI] Gemini auth switched to %s", auth_type)
        return True
    except Exception as e:
        logger.warning("[CLI] Failed to switch Gemini auth: %s", e)
        return False


class CLILLMProvider:
    """Provider wrapper for CLI LLM to match API LLMService interface."""

    def __init__(self, cli_service: "CLILLMService"):
        self.cli_service = cli_service

    async def generate(
        self,
        prompt: str,
        system_prompt: str = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> tuple[str, int]:
        """Generate text using CLI, matching LLMService.provider.generate() interface."""
        # CLI tools typically don't support separate system prompts,
        # so we prepend it to the main prompt
        full_prompt = prompt
        if system_prompt:
            full_prompt = f"[System] {system_prompt}\n\n{prompt}"

        return await self.cli_service.generate_with_cli(full_prompt)


class CLILLMService:
    """Service for generating LLM output via CLI tools."""

    def __init__(self, cli_type: str = CLIType.CLAUDE_CODE, model: str | None = None):
        """
        Args:
            cli_type: 'claude_code', 'gemini_cli', or 'codex_cli'
            model: Optional model name to pass via --model flag
        """
        self.cli_type = cli_type
        # 'default' is a frontend sentinel meaning "let CLI pick best model"
        self.model = model if model and model != "default" else None
        self.total_tokens_used = 0
        # Provide a provider attribute to match LLMService interface
        self.provider = CLILLMProvider(self)
        self.provider_name = f"cli:{cli_type}"

    async def generate_with_cli(self, prompt: str) -> Tuple[str, int]:
        """
        Generate text using CLI tool.

        Returns:
            Tuple of (content, token_count).
        """
        cli_path = self._find_cli_path()
        if not cli_path:
            cli_name = CLI_EXECUTABLE_NAMES.get(self.cli_type, self.cli_type)
            logger.error(
                "[CLI] %s CLI not found! Searched: shutil.which, npm global paths",
                cli_name,
            )
            raise RuntimeError(f"{cli_name} CLI not found. Please install it first.")
        logger.info("[CLI] Found CLI at: %s (type=%s)", cli_path, self.cli_type)

        # Codex CLI uses session-based auth (codex login), not env vars.
        # Only auto-login with API key if CLI has no bound auth at all.
        if self.cli_type == CLIType.CODEX_CLI and not self._has_cli_auth():
            await self._ensure_codex_login(cli_path)

        args = self._build_args(cli_path)
        cli_path_lower = cli_path.lower()
        use_shell = sys.platform == "win32" and (
            cli_path_lower.endswith(".cmd") or cli_path_lower.endswith(".bat")
        )

        # Encode prompt as UTF-8 bytes for stdin
        prompt_bytes = prompt.encode("utf-8")

        # OAuth capacity fallback: shorter first attempt if .env key available
        force_api_key = False
        has_fallback = bool(self._get_fallback_api_key()) and self._has_cli_auth()
        attempt_timeout = (
            CLI_OAUTH_ATTEMPT_TIMEOUT if has_fallback else CLI_TIMEOUT_SECONDS
        )

        logger.info("Executing CLI: %s", cli_path)
        logger.debug(
            "Use shell: %s, prompt length: %d chars, %d bytes",
            use_shell,
            len(prompt),
            len(prompt_bytes),
        )
        if self.model:
            logger.debug("Model: %s", self.model)

        def run_subprocess():
            """Run CLI subprocess in a thread (Windows asyncio subprocess compatibility)."""
            if use_shell:
                # Windows .cmd files need shell=True or cmd.exe /c prefix
                exec_args = ["cmd.exe", "/c"] + args
                logger.debug(
                    "Command: cmd.exe /c %s -p - --output-format json%s",
                    args[0],
                    f" --model {self.model}" if self.model else "",
                )
            else:
                exec_args = args
                logger.debug(
                    "Command: %s...%s",
                    " ".join(args[:4]),
                    f" --model {self.model}" if self.model else "",
                )

            logger.debug("Running with stdin pipe (timeout: %ds)", attempt_timeout)

            # Use Popen instead of subprocess.run to handle Windows process tree kill on timeout.
            # subprocess.run's timeout kills only the parent (cmd.exe) but orphans child node.exe,
            # causing communicate() to block forever on pipe drain.
            creation_flags = (
                subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
            )

            # Clean env: remove Claude Code session markers to avoid "nested session"
            # error when backend runs inside a Claude Code session (e.g., local dev).
            clean_env = {
                k: v
                for k, v in os.environ.items()
                if k not in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT")
            }

            # Inject CLI-specific API key into subprocess environment
            # BUT: if CLI has bound auth (OAuth or local API key), skip injection
            # so CLI uses its own credentials (unless force_api_key is set for fallback)
            # Priority: bound credentials > OAuth > .env API keys
            settings_modified = False
            cli_env_mapping = CLI_SUBPROCESS_ENV_MAP.get(self.cli_type)
            if cli_env_mapping:
                src_var, dst_var = cli_env_mapping
                cli_key = os.environ.get(src_var, "")
                if cli_key:
                    if force_api_key:
                        # Bound auth failed (capacity exhausted), force .env API key
                        clean_env[dst_var] = cli_key
                        # Gemini CLI requires settings.json change to switch auth
                        if self.cli_type == CLIType.GEMINI_CLI:
                            settings_modified = _switch_gemini_auth(GEMINI_AUTH_API_KEY)
                    else:
                        has_bound_auth = self._has_cli_auth()
                        if has_bound_auth:
                            logger.info(
                                "[CLI] %s has bound auth, skipping .env key injection",
                                self.cli_type,
                            )
                            clean_env.pop(dst_var, None)
                        else:
                            clean_env[dst_var] = cli_key
                            # Gemini CLI: settings.json must match auth type
                            # or CLI ignores the API key and prompts OAuth
                            if self.cli_type == CLIType.GEMINI_CLI:
                                settings_modified = _switch_gemini_auth(
                                    GEMINI_AUTH_API_KEY
                                )
                elif not force_api_key and dst_var in clean_env:
                    # No explicit CLI key set, but the target env var is inherited
                    # from the parent process. Strip it if CLI has bound auth
                    # to prevent overriding bound credentials with inherited key.
                    if self._has_cli_auth():
                        logger.info(
                            "[CLI] %s has bound auth, stripping inherited %s from env",
                            self.cli_type,
                            dst_var,
                        )
                        clean_env.pop(dst_var, None)

            process = subprocess.Popen(
                exec_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,
                creationflags=creation_flags,
                env=clean_env,
            )
            try:
                stdout, stderr = process.communicate(
                    input=prompt_bytes, timeout=attempt_timeout
                )
                return subprocess.CompletedProcess(
                    exec_args, process.returncode, stdout, stderr
                )
            except subprocess.TimeoutExpired:
                logger.warning(
                    "[CLI] Timeout after %ds, killing process tree (pid=%d)",
                    attempt_timeout,
                    process.pid,
                )
                if sys.platform == "win32":
                    # Kill entire process tree (cmd.exe + node.exe + children)
                    subprocess.run(
                        ["taskkill", "/T", "/F", "/PID", str(process.pid)],
                        capture_output=True,
                        timeout=10,
                    )
                else:
                    process.kill()
                # Drain any remaining output with short timeout
                try:
                    process.communicate(timeout=5)
                except (subprocess.TimeoutExpired, OSError):
                    pass
                raise
            finally:
                # Restore Gemini settings only if bound auth credentials exist
                # (no point restoring oauth-personal if there are no OAuth creds)
                if settings_modified and self._has_cli_auth():
                    _switch_gemini_auth(GEMINI_AUTH_OAUTH)

        try:
            # Run subprocess in thread pool to avoid blocking event loop
            # and to work around Windows asyncio subprocess limitations
            # Use get_running_loop() for compatibility with uvicorn's event loop
            loop = asyncio.get_running_loop()

            need_fallback = False
            try:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    result = await loop.run_in_executor(executor, run_subprocess)
                output = result.stdout.decode("utf-8", errors="replace").strip()
                stderr_text = (
                    result.stderr.decode("utf-8", errors="replace").strip()
                    if result.stderr
                    else ""
                )
                need_fallback = self._is_capacity_error(output, stderr_text)
            except subprocess.TimeoutExpired:
                if not has_fallback:
                    raise  # No fallback — let outer except handle it
                need_fallback = True

            # OAuth capacity fallback: retry with .env API key
            if need_fallback and has_fallback:
                logger.info(
                    "[CLI] OAuth capacity exhausted for %s, retrying with .env API key",
                    self.cli_type,
                )
                force_api_key = True
                attempt_timeout = CLI_TIMEOUT_SECONDS  # Full timeout for retry
                # Codex: re-login with API key to override OAuth session
                if self.cli_type == CLIType.CODEX_CLI:
                    await self._ensure_codex_login(cli_path)
                with ThreadPoolExecutor(max_workers=1) as executor2:
                    result = await loop.run_in_executor(executor2, run_subprocess)
                output = result.stdout.decode("utf-8", errors="replace").strip()
                stderr_text = (
                    result.stderr.decode("utf-8", errors="replace").strip()
                    if result.stderr
                    else ""
                )

            logger.debug("Return code: %d", result.returncode)
            logger.debug(
                "Output length: %d, stderr length: %d", len(output), len(stderr_text)
            )

            # Filter out harmless CLI noise from stderr
            stderr_significant = "\n".join(
                line
                for line in stderr_text.splitlines()
                if not any(noise in line for noise in CLI_STDERR_NOISE_PATTERNS)
            ).strip()

            if not output and stderr_significant:
                raise RuntimeError(f"CLI error: {stderr_significant[:500]}")

            if not output and not stderr_significant:
                logger.warning(
                    "[CLI] Empty stdout and no significant stderr (cli=%s, returncode=%d)",
                    self.cli_type,
                    result.returncode,
                )
                return "", 0

            if result.returncode != 0 and not output:
                raise RuntimeError(
                    f"CLI exited with code {result.returncode}. Stderr: {stderr_significant[:500]}"
                )

            content, token_count = self._parse_json_output(output)
            logger.info(
                "[CLI] Parsed: content_len=%d, tokens=%d, cli=%s",
                len(content),
                token_count,
                self.cli_type,
            )
            if not content:
                logger.warning(
                    "[CLI] Empty content returned (cli=%s, output_preview=%.200s)",
                    self.cli_type,
                    output,
                )
            elif content == output:
                logger.warning(
                    "[CLI] Content is raw/unparsed — JSON wrapper not found (cli=%s, output_preview=%.200s)",
                    self.cli_type,
                    output[:200],
                )
            self.total_tokens_used += token_count
            return content, token_count

        except subprocess.TimeoutExpired:
            raise RuntimeError(f"CLI timed out after {CLI_TIMEOUT_SECONDS}s")
        except Exception as e:
            logger.error("Exception during execution: %s: %s", type(e).__name__, e)
            raise

    async def generate_project_summary(
        self, project_data: dict, style: Optional[str] = None, language: str = "ko"
    ) -> dict:
        """
        Generate a project summary using CLI, matching LLMService interface.

        Args:
            project_data: Project information dictionary
            style: Style hint (professional, casual, technical)
            language: Output language ('ko' for Korean, 'en' for English)
        """
        prompt = self._build_summary_prompt(project_data, style, language)
        content, token_count = await self.generate_with_cli(prompt)

        # Try to parse key_features from structured CLI response
        key_features = []
        technical_highlights = []
        role_description = ""
        try:
            json_str = content
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]
            parsed = json.loads(json_str.strip())
            if isinstance(parsed, dict):
                kf = parsed.get("key_features", [])
                if isinstance(kf, list):
                    key_features = kf
                th = parsed.get("technical_highlights", [])
                if isinstance(th, list):
                    technical_highlights = th
                role_description = parsed.get("role_description", "")
                content = parsed.get("summary", content)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(
                "[CLI Summary] JSON parse failed: %s (preview=%.200s)",
                e,
                content[:200] if content else "",
            )

        return {
            "summary": content,
            "key_features": key_features,
            "technical_highlights": technical_highlights,
            "role_description": role_description,
            "token_usage": token_count,
        }

    def _is_capacity_error(self, output: str, stderr: str) -> bool:
        """Detect OAuth capacity/quota exhaustion (Gemini cloudcode-pa 429, Codex quota)."""
        combined = (output + stderr).lower()
        return any(pattern in combined for pattern in CAPACITY_ERROR_PATTERNS)

    def _get_fallback_api_key(self) -> Optional[str]:
        """Return .env API key for this CLI type, or None if not set."""
        cli_env_mapping = CLI_SUBPROCESS_ENV_MAP.get(self.cli_type)
        if not cli_env_mapping:
            return None
        src_var, dst_var = cli_env_mapping
        key = os.environ.get(src_var, "").strip()
        # Fallback to the target env var (e.g., OPENAI_API_KEY for Codex)
        if not key:
            key = os.environ.get(dst_var, "").strip()
        return key or None

    def _has_cli_auth(self) -> bool:
        """Check if CLI has any bound/local authentication (OAuth OR local API key).

        Returns True when the CLI has its own credentials stored locally.
        Returns False when the CLI has no local auth and needs .env key injection.

        Priority: bound credentials (local auth files) > OAuth > .env API keys
        """
        from api.services.llm.cli_service import CLIService

        svc = CLIService()
        if self.cli_type == CLIType.GEMINI_CLI:
            # Gemini: only OAuth creds file counts as bound auth
            return svc._check_gemini_auth().get("authenticated", False)
        elif self.cli_type == CLIType.CODEX_CLI:
            # Codex: ANY auth in auth.json is bound (both "login" OAuth and "apikey")
            if CODEX_AUTH_PATH.exists():
                try:
                    data = json.loads(CODEX_AUTH_PATH.read_text())
                    return data.get("auth_mode") is not None
                except (json.JSONDecodeError, OSError):
                    pass
            return False
        elif self.cli_type == CLIType.CLAUDE_CODE:
            # Claude: any loggedIn state = bound auth (OAuth or stored API key)
            # Strip ANTHROPIC_API_KEY from env so CLI reports only its own stored creds
            try:
                cli_path = self._find_cli_path()
                if cli_path:
                    clean = {
                        k: v
                        for k, v in os.environ.items()
                        if k
                        not in (
                            "CLAUDECODE",
                            "CLAUDE_CODE_ENTRYPOINT",
                            "ANTHROPIC_API_KEY",
                        )
                    }
                    result = subprocess.run(
                        [cli_path, "auth", "status"],
                        capture_output=True,
                        timeout=5,
                        env=clean,
                    )
                    if result.returncode == 0:
                        data = json.loads(
                            result.stdout.decode("utf-8", errors="replace")
                        )
                        return data.get("loggedIn", False)
            except (json.JSONDecodeError, subprocess.TimeoutExpired, OSError):
                pass
            return False
        return False

    def _find_cli_path(self) -> Optional[str]:
        """Find CLI executable path with Windows npm global support."""
        exe_name = CLI_EXECUTABLE_NAMES.get(self.cli_type, "claude")

        # Windows: Prefer .cmd files for proper execution
        if sys.platform == "win32":
            # First try shutil.which for .cmd version
            cmd_path = shutil.which(f"{exe_name}.cmd")
            if cmd_path:
                logger.debug("Found %s.cmd via shutil.which: %s", exe_name, cmd_path)
                return cmd_path

            # Check npm global paths explicitly
            home = Path.home()
            npm_paths = [
                home / "AppData" / "Roaming" / "npm" / f"{exe_name}.cmd",
                home / "AppData" / "Local" / "npm" / f"{exe_name}.cmd",
                Path(os.environ.get("APPDATA", "")) / "npm" / f"{exe_name}.cmd",
            ]

            for npm_path in npm_paths:
                if npm_path.exists():
                    logger.debug("Found %s at npm global path: %s", exe_name, npm_path)
                    return str(npm_path)

            # Fallback: check if shutil.which returns extensionless and try .cmd
            path = shutil.which(exe_name)
            if path:
                cmd_version = Path(path).with_suffix(".cmd")
                if cmd_version.exists():
                    logger.debug("Found %s.cmd alongside: %s", exe_name, cmd_version)
                    return str(cmd_version)
                # Last resort: return the extensionless path
                logger.debug("Found %s via shutil.which (no .cmd): %s", exe_name, path)
                return path

        else:
            # Non-Windows: use shutil.which directly
            path = shutil.which(exe_name)
            if path:
                logger.debug("Found %s via shutil.which: %s", exe_name, path)
                return path

        logger.warning("%s not found in PATH or npm global paths", exe_name)
        return None

    async def _ensure_codex_login(self, cli_path: str) -> None:
        """Ensure Codex CLI is authenticated. Auto-login with API key if available."""
        api_key = self._get_fallback_api_key()
        if not api_key:
            logger.debug("[Codex] No API key found for auto-login")
            return

        try:
            proc = subprocess.run(
                [cli_path, "login", "--with-api-key"],
                input=api_key.encode("utf-8"),
                capture_output=True,
                timeout=10,
            )
            if proc.returncode == 0:
                logger.info("[Codex] Auto-login successful")
            else:
                stderr = proc.stderr.decode("utf-8", errors="replace").strip()
                logger.debug(
                    "[Codex] Login returned code %d: %s", proc.returncode, stderr
                )
        except Exception as e:
            logger.debug("[Codex] Auto-login failed: %s", e)

    def _build_args(self, cli_path: str) -> list:
        """Build CLI command arguments (prompt passed via stdin)."""
        if self.cli_type == CLIType.CODEX_CLI:
            # Codex CLI: codex exec --skip-git-repo-check - --json [--model MODEL]
            args = [cli_path, "exec", "--skip-git-repo-check", "-", "--json"]
            if self.model:
                args.extend(["--model", self.model])
            return args

        # Claude Code / Gemini CLI: cli -p - --output-format json
        # Use -p without argument to read prompt from stdin
        # This avoids command-line length limits on Windows (~8191 chars)
        args = [cli_path, "-p", "-", "--output-format", "json"]
        if self.model:
            args.extend(["--model", self.model])
        return args

    def _parse_json_output(self, raw_output: str) -> Tuple[str, int]:
        """
        Parse JSON output from CLI to extract content and token count.

        Claude JSON: { "result": "...", "usage": { "input_tokens": N, "output_tokens": N } }
        Gemini JSON: { "response": "...", "stats": { "models": { "model-name": { "tokens": { "total": N } } } } }
        Codex JSONL: Multiple lines, each a JSON object:
            {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
            {"type":"turn.completed","usage":{"input_tokens":N,"output_tokens":N}}

        Falls back to (raw_output, 0) on parse failure.
        """
        # Codex CLI outputs JSONL (one JSON object per line), not a single JSON object
        if self.cli_type == CLIType.CODEX_CLI:
            return self._parse_codex_jsonl(raw_output)

        try:
            data = json.loads(raw_output)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(
                "[CLI] JSON parse failed: %s (output length: %d)", e, len(raw_output)
            )
            logger.warning("[CLI] Raw output preview: %.300s", raw_output)
            return raw_output, 0

        if not isinstance(data, dict):
            logger.debug("Expected dict, got %s", type(data).__name__)
            return raw_output, 0

        # Extract content
        content = ""
        token_count = 0

        if self.cli_type == CLIType.CLAUDE_CODE and "result" in data:
            # Claude format (include cache tokens for accurate billing)
            content = (
                data["result"]
                if isinstance(data["result"], str)
                else str(data["result"])
            )
            usage = data.get("usage", {})
            token_count = (
                usage.get("input_tokens", 0)
                + usage.get("output_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0)
            )
            if token_count == 0:
                logger.warning(
                    "[CLI] Claude Code: 'usage' field present=%s, keys=%s",
                    "usage" in data,
                    list(usage.keys()) if usage else "empty",
                )
        elif self.cli_type == CLIType.GEMINI_CLI and "response" in data:
            # Gemini format
            content = (
                data["response"]
                if isinstance(data["response"], str)
                else str(data["response"])
            )
            stats = data.get("stats", {})
            models = stats.get("models", {})
            for model_data in models.values():
                tokens = model_data.get("tokens", {})
                token_count += tokens.get("total", 0)
            if token_count == 0:
                logger.warning(
                    "[CLI] Gemini CLI: 'stats' field present=%s, stats_keys=%s, models_keys=%s",
                    "stats" in data,
                    list(stats.keys()) if stats else "empty",
                    list(models.keys()) if models else "empty",
                )
        else:
            # Unknown format, return raw
            logger.warning(
                "[CLI] Unrecognized JSON format for %s. Top-level keys: %s",
                self.cli_type,
                list(data.keys()),
            )
            content = raw_output

        return content or raw_output, token_count

    def _parse_codex_jsonl(self, raw_output: str) -> Tuple[str, int]:
        """Parse Codex CLI JSONL output.

        Codex CLI outputs one JSON object per line:
          {"type":"thread.started",...}
          {"type":"turn.started"}
          {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
          {"type":"turn.completed","usage":{"input_tokens":N,"output_tokens":N}}
        """
        messages: list[str] = []
        token_count = 0

        for line in raw_output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue

            if not isinstance(obj, dict):
                continue

            msg_type = obj.get("type", "")

            if msg_type == "item.completed":
                item = obj.get("item", {})
                if item.get("type") == "agent_message":
                    text = item.get("text", "")
                    if text:
                        messages.append(text)
            elif msg_type == "turn.completed":
                usage = obj.get("usage", {})
                token_count += usage.get("input_tokens", 0) + usage.get(
                    "output_tokens", 0
                )

        content = "\n".join(messages)
        if not content:
            logger.warning(
                "[CLI] Codex JSONL: no agent_message found (output_preview=%.300s)",
                raw_output,
            )
            return raw_output, 0

        return content, token_count

    def _build_summary_prompt(
        self, project_data: dict, style: Optional[str] = None, language: str = "ko"
    ) -> str:
        """Build a prompt for project summary generation.

        Args:
            project_data: Project information dictionary
            style: Style hint (professional, casual, technical)
            language: Output language ('ko' for Korean, 'en' for English)
        """
        techs = ", ".join(project_data.get("technologies", []))
        commits = project_data.get("total_commits", "N/A")
        user_commits = project_data.get("user_commits", "N/A")
        commit_summary = project_data.get("commit_summary", "")

        # Build commit categories description
        commit_categories = project_data.get("commit_categories", {})
        categories_desc = ""
        if commit_categories:
            cat_parts = []
            if commit_categories.get("feature", 0) > 0:
                cat_parts.append(f"Features: {commit_categories['feature']}")
            if commit_categories.get("fix", 0) > 0:
                cat_parts.append(f"Fixes: {commit_categories['fix']}")
            if commit_categories.get("refactor", 0) > 0:
                cat_parts.append(f"Refactoring: {commit_categories['refactor']}")
            categories_desc = ", ".join(cat_parts)

        # Build code stats description
        lines_added = project_data.get("lines_added", 0)
        lines_deleted = project_data.get("lines_deleted", 0)
        files_changed = project_data.get("files_changed", 0)
        code_stats = (
            f"+{lines_added:,} / -{lines_deleted:,} lines, {files_changed} files"
            if lines_added
            else "N/A"
        )

        # Get key tasks if available
        key_tasks = project_data.get("key_tasks", [])
        key_tasks_desc = (
            "\n".join(f"  • {task}" for task in key_tasks[:5]) if key_tasks else ""
        )

        if language == "en":
            style_hint = f" Style: {style}." if style else ""
            return (
                f"Write a DETAILED professional summary of this software project for a resume/portfolio.{style_hint}\n\n"
                f"Project: {project_data.get('name', 'Unknown')}\n"
                f"Description: {project_data.get('description', 'N/A')}\n"
                f"Role: {project_data.get('role', 'N/A')}\n"
                f"Team size: {project_data.get('team_size', 'N/A')}\n"
                f"Technologies: {techs}\n"
                f"Period: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}\n\n"
                f"Code Contribution:\n"
                f"- Total commits: {commits}\n"
                f"- My commits: {user_commits}\n"
                f"- Code changes: {code_stats}\n"
                f"- Commit types: {categories_desc or 'N/A'}\n"
                f"- Commit summary: {commit_summary[:500] if commit_summary else 'N/A'}\n\n"
                f"Key Tasks:\n{key_tasks_desc or '(Not available)'}\n\n"
                "Respond in the following JSON format ONLY (no markdown, no explanation):\n"
                "{\n"
                '  "summary": "4-6 sentence comprehensive summary covering project purpose, your role, key contributions, and measurable impact",\n'
                '  "key_features": ["Feature 1 with impact", "Feature 2", "Feature 3", "Feature 4"],\n'
                '  "technical_highlights": ["Achievement 1", "Achievement 2", "Achievement 3"],\n'
                '  "role_description": "Detailed description of responsibilities"\n'
                "}\n\n"
                "IMPORTANT: Respond ONLY in English. Return ONLY valid JSON."
            )
        else:
            # Korean (default)
            style_map = {
                SummaryStyle.PROFESSIONAL: "전문적인",
                SummaryStyle.CASUAL: "캐주얼한",
                SummaryStyle.TECHNICAL: "기술적인",
            }
            style_hint = f" 스타일: {style_map.get(style, style)}." if style else ""
            return (
                f"이력서/포트폴리오를 위해 이 소프트웨어 프로젝트의 **상세한** 요약을 작성해주세요.{style_hint}\n\n"
                f"프로젝트: {project_data.get('name', 'Unknown')}\n"
                f"설명: {project_data.get('description', 'N/A')}\n"
                f"역할: {project_data.get('role', 'N/A')}\n"
                f"팀 규모: {project_data.get('team_size', 'N/A')}\n"
                f"기술 스택: {techs}\n"
                f"기간: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}\n\n"
                f"코드 기여:\n"
                f"- 총 커밋: {commits}\n"
                f"- 내 커밋: {user_commits}\n"
                f"- 코드 변경량: {code_stats}\n"
                f"- 커밋 유형: {categories_desc or 'N/A'}\n"
                f"- 커밋 요약: {commit_summary[:500] if commit_summary else 'N/A'}\n\n"
                f"주요 수행 업무:\n{key_tasks_desc or '(정보 없음)'}\n\n"
                "다음 JSON 형식으로만 응답하세요 (마크다운 없이, 설명 없이):\n"
                "{\n"
                '  "summary": "4-6문장의 포괄적 요약 (프로젝트 목적, 역할, 핵심 기여, 측정 가능한 성과 포함)",\n'
                '  "key_features": ["구체적 기능 1 (영향 포함)", "기능 2", "기능 3", "기능 4"],\n'
                '  "technical_highlights": ["기술적 성과 1", "성과 2", "성과 3"],\n'
                '  "role_description": "책임과 역할에 대한 상세 설명"\n'
                "}\n\n"
                "중요: 반드시 한국어로 응답하세요. 유효한 JSON만 반환하세요."
            )

    async def generate_key_tasks(
        self,
        project_data: dict,
        commit_summary: Optional[str] = None,
        language: str = "ko",
        user_context: Optional[str] = None,
        code_context: Optional[str] = None,
    ) -> List[str]:
        """
        Generate key tasks using CLI, matching LLMService interface.
        Delegates to generate_key_tasks_llm via the provider wrapper.
        """
        from .llm_generation import generate_key_tasks_llm

        tasks, tokens = await generate_key_tasks_llm(
            self.provider,
            project_data,
            commit_summary,
            language,
            user_context,
            code_context,
        )
        # Note: tokens already counted in generate_with_cli() via self.total_tokens_used
        return tasks

    async def generate_implementation_details(
        self,
        project_data: dict,
        commit_summary: Optional[str] = None,
        language: str = "ko",
        user_context: Optional[str] = None,
    ) -> List[dict]:
        """
        Generate implementation details using CLI, matching LLMService interface.
        Delegates to generate_implementation_details_llm via the provider wrapper.
        """
        from .llm_generation import generate_implementation_details_llm

        details, tokens = await generate_implementation_details_llm(
            self.provider, project_data, commit_summary, language, user_context
        )
        # Note: tokens already counted in generate_with_cli() via self.total_tokens_used
        return details

    async def generate_detailed_achievements(
        self,
        project_data: dict,
        existing_achievements: Optional[List[dict]] = None,
        language: str = "ko",
        user_context: Optional[str] = None,
    ) -> dict:
        """
        Generate detailed achievements using CLI, matching LLMService interface.
        Delegates to generate_detailed_achievements_llm via the provider wrapper.
        """
        from .llm_generation import generate_detailed_achievements_llm

        achievements, tokens = await generate_detailed_achievements_llm(
            self.provider, project_data, existing_achievements, language, user_context
        )
        # Note: tokens already counted in generate_with_cli() via self.total_tokens_used
        return achievements

    async def generate_multi_repo_summary(
        self,
        project_data: dict,
        repo_summaries: List[dict],
        style: str = "professional",
        language: str = "ko",
    ) -> dict:
        """
        Generate a holistic AI summary for a multi-repo project using CLI.
        Delegates to generate_multi_repo_summary_llm via the provider wrapper.
        """
        from .llm_generation import generate_multi_repo_summary_llm

        result = await generate_multi_repo_summary_llm(
            self.provider, project_data, repo_summaries, style, language
        )
        # Note: tokens already counted in generate_with_cli() via self.total_tokens_used
        return result
