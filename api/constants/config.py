"""LLM and CLI configuration constants."""

from api.constants.enums import LLMProvider


# Max token limits for various LLM generation tasks
class LLM_MAX_TOKENS:
    KEY_TASKS = 1500
    IMPLEMENTATION = 2000
    ACHIEVEMENTS = 2500
    SUMMARY = 2000
    DESCRIPTION = 1000
    CONTENT_GENERATION = 4000
    CONTENT_GENERATION_MID = 3000
    ACHIEVEMENT_DETECTION = 1500


# Default models per provider
DEFAULT_MODELS: dict[str, str] = {
    LLMProvider.OPENAI: "gpt-4.1",
    LLMProvider.ANTHROPIC: "claude-sonnet-4-6-20260217",
    LLMProvider.GEMINI: "gemini-2.5-flash",
}

# CLI process timeout in seconds
CLI_TIMEOUT_SECONDS = 180
