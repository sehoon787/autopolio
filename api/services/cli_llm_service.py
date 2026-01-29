"""
CLI LLM Service - Execute LLM prompts via CLI tools (Claude Code, Gemini CLI).

Uses subprocess to run CLI commands and capture output.
Parses JSON output for token tracking when --output-format json is used.
"""
import asyncio
import json
import os
import subprocess
import sys
import shutil
import traceback
from typing import Tuple, Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Timeout for each CLI call (3 minutes per call)
# Note: Analysis may make multiple LLM calls, so total time can be longer
CLI_TIMEOUT_SECONDS = 180


class CLILLMProvider:
    """Provider wrapper for CLI LLM to match API LLMService interface."""

    def __init__(self, cli_service: "CLILLMService"):
        self.cli_service = cli_service

    async def generate(
        self,
        prompt: str,
        system_prompt: str = None,
        max_tokens: int = 1000,
        temperature: float = 0.7
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

    def __init__(self, cli_type: str = "claude_code", model: str | None = None):
        """
        Args:
            cli_type: 'claude_code' or 'gemini_cli'
            model: Optional model name to pass via --model flag
        """
        self.cli_type = cli_type
        self.model = model
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
            cli_name = "claude" if self.cli_type == "claude_code" else "gemini"
            raise RuntimeError(
                f"{cli_name} CLI not found. Please install it first."
            )

        args = self._build_args(cli_path)
        cli_path_lower = cli_path.lower()
        use_shell = sys.platform == "win32" and (
            cli_path_lower.endswith(".cmd") or cli_path_lower.endswith(".bat")
        )

        # Encode prompt as UTF-8 bytes for stdin
        prompt_bytes = prompt.encode("utf-8")

        print(f"[CLI] Executing: {cli_path}", flush=True)
        print(f"[CLI] Use shell: {use_shell}, prompt length: {len(prompt)} chars, {len(prompt_bytes)} bytes", flush=True)
        if self.model:
            print(f"[CLI] Model: {self.model}", flush=True)

        def run_subprocess():
            """Run CLI subprocess in a thread (Windows asyncio subprocess compatibility)."""
            if use_shell:
                # Windows .cmd files need shell=True or cmd.exe /c prefix
                exec_args = ["cmd.exe", "/c"] + args
                print(f"[CLI] Command: cmd.exe /c {args[0]} -p - --output-format json" + (f" --model {self.model}" if self.model else ""))
            else:
                exec_args = args
                print(f"[CLI] Command: {' '.join(args[:4])}..." + (f" --model {self.model}" if self.model else ""))

            print(f"[CLI] Running with stdin pipe... (timeout: {CLI_TIMEOUT_SECONDS}s)", flush=True)
            result = subprocess.run(
                exec_args,
                capture_output=True,
                timeout=CLI_TIMEOUT_SECONDS,
                input=prompt_bytes,  # Pass prompt via stdin
                text=False,  # Get bytes, decode manually for better error handling
            )
            return result

        try:
            # Run subprocess in thread pool to avoid blocking event loop
            # and to work around Windows asyncio subprocess limitations
            # Use get_running_loop() for compatibility with uvicorn's event loop
            loop = asyncio.get_running_loop()
            with ThreadPoolExecutor(max_workers=1) as executor:
                result = await loop.run_in_executor(executor, run_subprocess)

            output = result.stdout.decode("utf-8", errors="replace").strip()
            stderr_text = result.stderr.decode("utf-8", errors="replace").strip() if result.stderr else ""

            print(f"[CLI] Return code: {result.returncode}")
            print(f"[CLI] Output length: {len(output)}, stderr length: {len(stderr_text)}")

            if not output and stderr_text:
                raise RuntimeError(f"CLI error: {stderr_text[:500]}")

            if result.returncode != 0 and not output:
                raise RuntimeError(
                    f"CLI exited with code {result.returncode}. Stderr: {stderr_text[:500]}"
                )

            content, token_count = self._parse_json_output(output)
            print(f"[CLI] Parsed content length: {len(content)}, tokens: {token_count}")
            self.total_tokens_used += token_count
            return content, token_count

        except subprocess.TimeoutExpired:
            raise RuntimeError(
                f"CLI timed out after {CLI_TIMEOUT_SECONDS}s"
            )
        except Exception as e:
            print(f"[CLI] Exception during execution: {type(e).__name__}: {e}")
            raise

    async def generate_project_summary(
        self, project_data: dict, style: Optional[str] = None
    ) -> dict:
        """
        Generate a project summary using CLI, matching LLMService interface.
        """
        prompt = self._build_summary_prompt(project_data, style)
        content, token_count = await self.generate_with_cli(prompt)

        return {
            "summary": content,
            "key_features": [],
            "token_usage": token_count,
        }

    def _find_cli_path(self) -> Optional[str]:
        """Find CLI executable path with Windows npm global support."""
        exe_name = "claude" if self.cli_type == "claude_code" else "gemini"

        # Windows: Prefer .cmd files for proper execution
        if sys.platform == "win32":
            # First try shutil.which for .cmd version
            cmd_path = shutil.which(f"{exe_name}.cmd")
            if cmd_path:
                print(f"[CLI] Found {exe_name}.cmd via shutil.which: {cmd_path}")
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
                    print(f"[CLI] Found {exe_name} at npm global path: {npm_path}")
                    return str(npm_path)

            # Fallback: check if shutil.which returns extensionless and try .cmd
            path = shutil.which(exe_name)
            if path:
                cmd_version = Path(path).with_suffix('.cmd')
                if cmd_version.exists():
                    print(f"[CLI] Found {exe_name}.cmd alongside: {cmd_version}")
                    return str(cmd_version)
                # Last resort: return the extensionless path
                print(f"[CLI] Found {exe_name} via shutil.which (no .cmd): {path}")
                return path

        else:
            # Non-Windows: use shutil.which directly
            path = shutil.which(exe_name)
            if path:
                print(f"[CLI] Found {exe_name} via shutil.which: {path}")
                return path

        print(f"[CLI] {exe_name} not found in PATH or npm global paths")
        return None

    def _build_args(self, cli_path: str) -> list:
        """Build CLI command arguments (prompt passed via stdin)."""
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

        Falls back to (raw_output, 0) on parse failure.
        """
        try:
            data = json.loads(raw_output)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"[CLI] JSON parse failed: {e}")
            print(f"[CLI] Raw output preview: {raw_output[:500]}..." if len(raw_output) > 500 else f"[CLI] Raw output: {raw_output}")
            return raw_output, 0

        if not isinstance(data, dict):
            print(f"[CLI] Expected dict, got {type(data).__name__}")
            return raw_output, 0

        # Extract content
        content = ""
        token_count = 0

        if self.cli_type == "claude_code" and "result" in data:
            # Claude format (include cache tokens for accurate billing)
            content = data["result"] if isinstance(data["result"], str) else str(data["result"])
            usage = data.get("usage", {})
            token_count = (
                usage.get("input_tokens", 0)
                + usage.get("output_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0)
            )
        elif self.cli_type == "gemini_cli" and "response" in data:
            # Gemini format
            content = data["response"] if isinstance(data["response"], str) else str(data["response"])
            stats = data.get("stats", {})
            models = stats.get("models", {})
            for model_data in models.values():
                tokens = model_data.get("tokens", {})
                token_count += tokens.get("total", 0)
        else:
            # Unknown format, return raw
            content = raw_output

        return content or raw_output, token_count

    def _build_summary_prompt(
        self, project_data: dict, style: Optional[str] = None
    ) -> str:
        """Build a prompt for project summary generation."""
        style_hint = f" Style: {style}." if style else ""
        techs = ", ".join(project_data.get("technologies", []))
        commits = project_data.get("total_commits", "N/A")
        commit_summary = project_data.get("commit_summary", "")

        return (
            f"Summarize this software project for a resume/portfolio.{style_hint}\n\n"
            f"Project: {project_data.get('name', 'Unknown')}\n"
            f"Description: {project_data.get('description', 'N/A')}\n"
            f"Role: {project_data.get('role', 'N/A')}\n"
            f"Team size: {project_data.get('team_size', 'N/A')}\n"
            f"Technologies: {techs}\n"
            f"Total commits: {commits}\n"
            f"Commit summary: {commit_summary[:500] if commit_summary else 'N/A'}\n\n"
            "Provide a concise professional summary (2-3 paragraphs) highlighting "
            "key contributions, technical decisions, and impact."
        )
