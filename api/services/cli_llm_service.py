"""
CLI LLM Service - Execute LLM prompts via CLI tools (Claude Code, Gemini CLI).

Uses subprocess to run CLI commands and capture output.
Parses JSON output for token tracking when --output-format json is used.
"""
import asyncio
import json
import sys
import shutil
from typing import Tuple, Optional

CLI_TIMEOUT_SECONDS = 120


class CLILLMService:
    """Service for generating LLM output via CLI tools."""

    def __init__(self, cli_type: str = "claude_code"):
        """
        Args:
            cli_type: 'claude_code' or 'gemini_cli'
        """
        self.cli_type = cli_type
        self.total_tokens_used = 0  # CLI doesn't track tokens

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

        args = self._build_args(cli_path, prompt)
        use_shell = sys.platform == "win32" and (
            cli_path.endswith(".cmd") or cli_path.endswith(".bat")
        )

        try:
            if use_shell:
                # Windows .cmd files need cmd.exe /c prefix with subprocess_exec
                # to avoid double-quote conflicts from subprocess_shell
                exec_args = ["cmd.exe", "/c"] + args
                proc = await asyncio.create_subprocess_exec(
                    *exec_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            else:
                proc = await asyncio.create_subprocess_exec(
                    *args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )

            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=CLI_TIMEOUT_SECONDS
            )

            output = stdout.decode("utf-8", errors="replace").strip()
            if not output and stderr:
                error_text = stderr.decode("utf-8", errors="replace").strip()
                raise RuntimeError(f"CLI error: {error_text[:500]}")

            if proc.returncode != 0 and not output:
                raise RuntimeError(
                    f"CLI exited with code {proc.returncode}"
                )

            content, token_count = self._parse_json_output(output)
            self.total_tokens_used += token_count
            return content, token_count

        except asyncio.TimeoutError:
            raise RuntimeError(
                f"CLI timed out after {CLI_TIMEOUT_SECONDS}s"
            )

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
        """Find CLI executable path."""
        if self.cli_type == "claude_code":
            return shutil.which("claude")
        return shutil.which("gemini")

    def _build_args(self, cli_path: str, prompt: str) -> list:
        """Build CLI command arguments."""
        if self.cli_type == "claude_code":
            return [cli_path, "-p", prompt, "--output-format", "json"]
        # Gemini CLI
        return [cli_path, "-p", prompt, "--output-format", "json"]

    def _parse_json_output(self, raw_output: str) -> Tuple[str, int]:
        """
        Parse JSON output from CLI to extract content and token count.

        Claude JSON: { "result": "...", "usage": { "input_tokens": N, "output_tokens": N } }
        Gemini JSON: { "response": "...", "stats": { "models": { "model-name": { "tokens": { "total": N } } } } }

        Falls back to (raw_output, 0) on parse failure.
        """
        try:
            data = json.loads(raw_output)
        except (json.JSONDecodeError, ValueError):
            return raw_output, 0

        if not isinstance(data, dict):
            return raw_output, 0

        # Extract content
        content = ""
        token_count = 0

        if "result" in data:
            # Claude format
            content = data["result"] if isinstance(data["result"], str) else str(data["result"])
            usage = data.get("usage", {})
            token_count = (
                usage.get("input_tokens", 0)
                + usage.get("output_tokens", 0)
            )
        elif "response" in data:
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
