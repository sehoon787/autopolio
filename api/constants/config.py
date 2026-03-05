"""LLM and CLI configuration constants."""

from pathlib import Path

from api.constants.enums import CLIType, LLMProvider


# Max token limits for various LLM generation tasks
class LLM_MAX_TOKENS:
    KEY_TASKS = 3000
    IMPLEMENTATION = 4000
    ACHIEVEMENTS = 6000
    SUMMARY = 4000
    DESCRIPTION = 2000
    CONTENT_GENERATION = 6000
    CONTENT_GENERATION_MID = 6000
    ACHIEVEMENT_DETECTION = 2000


# Default models per provider
DEFAULT_MODELS: dict[str, str] = {
    LLMProvider.OPENAI: "gpt-4.1",
    LLMProvider.ANTHROPIC: "claude-sonnet-4-6-20260217",
    LLMProvider.GEMINI: "gemini-2.5-flash",
}

# CLI process timeout in seconds
CLI_TIMEOUT_SECONDS = 180

# --- CLI Name Mappings ---

CLI_EXECUTABLE_NAMES: dict[str, str] = {
    CLIType.CLAUDE_CODE: "claude",
    CLIType.GEMINI_CLI: "gemini",
    CLIType.CODEX_CLI: "codex",
}

CLI_DISPLAY_NAMES: dict[str, str] = {
    CLIType.CLAUDE_CODE: "Claude Code",
    CLIType.GEMINI_CLI: "Gemini",
    CLIType.CODEX_CLI: "Codex",
}

CLI_PROVIDER_ACCOUNT_NAMES: dict[str, str] = {
    CLIType.CLAUDE_CODE: "Anthropic",
    CLIType.GEMINI_CLI: "Google",
    CLIType.CODEX_CLI: "OpenAI",
}

CLI_PROVIDER_MAP: dict[str, str] = {
    CLIType.CLAUDE_CODE: LLMProvider.ANTHROPIC,
    CLIType.CODEX_CLI: LLMProvider.OPENAI,
    CLIType.GEMINI_CLI: LLMProvider.GEMINI,
}

# --- CLI Environment Variable Mappings ---

# CLI type → (source .env var, target subprocess env var)
CLI_SUBPROCESS_ENV_MAP: dict[str, tuple[str, str]] = {
    CLIType.CLAUDE_CODE: ("CLAUDE_CODE_API_KEY", "ANTHROPIC_API_KEY"),
    CLIType.CODEX_CLI: ("CODEX_API_KEY", "OPENAI_API_KEY"),
    CLIType.GEMINI_CLI: ("GEMINI_CLI_API_KEY", "GEMINI_API_KEY"),
}

# --- CLI Auth Constants ---

GEMINI_AUTH_OAUTH = "oauth-personal"
GEMINI_AUTH_API_KEY = "gemini-api-key"
CODEX_AUTH_MODE_API_KEY = "apikey"

CLI_OAUTH_ATTEMPT_TIMEOUT = 30  # seconds, short timeout for OAuth first attempt

# --- CLI File Paths ---

GEMINI_SETTINGS_PATH = Path.home() / ".gemini" / "settings.json"
CODEX_AUTH_PATH = Path.home() / ".codex" / "auth.json"

# --- CLI Error Patterns ---

CAPACITY_ERROR_PATTERNS: tuple[str, ...] = (
    "model_capacity_exhausted",
    "no capacity available",
    "quota exceeded",
    "credit balance",
)

CLI_STDERR_NOISE_PATTERNS: tuple[str, ...] = (
    "(node:",
    "DeprecationWarning",
    "Use `node --trace-deprecation",
    "Loaded cached credentials",
    "ExperimentalWarning",
    "Hook registry initialized",
    "hook entries",
)
