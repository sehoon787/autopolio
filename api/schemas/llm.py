"""
LLM Configuration Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class CLIStatus(BaseModel):
    """Status of a CLI tool installation."""

    tool: str = Field(
        ..., description="Tool identifier: 'claude_code', 'gemini_cli', or 'codex_cli'"
    )
    installed: bool = Field(..., description="Whether the CLI is installed")
    version: Optional[str] = Field(None, description="Installed version")
    latest_version: Optional[str] = Field(None, description="Latest available version")
    is_outdated: bool = Field(False, description="Whether an update is available")
    path: Optional[str] = Field(None, description="Path to CLI executable")
    install_command: str = Field(
        "", description="Platform-specific installation command"
    )
    update_command: Optional[str] = Field(
        None, description="Command to update the CLI (if different from install)"
    )
    platform: Optional[str] = Field(None, description="Detected platform")


class LLMProvider(BaseModel):
    """Information about an LLM provider."""

    id: str = Field(
        ..., description="Provider identifier: 'openai', 'anthropic', 'gemini'"
    )
    name: str = Field(..., description="Display name")
    description: str = Field("", description="Provider description")
    configured: bool = Field(
        False, description="Whether API key is configured (user or env)"
    )
    env_configured: bool = Field(
        False, description="Whether API key is set in server .env"
    )
    user_configured: bool = Field(False, description="Whether API key is set by user")
    is_primary: bool = Field(False, description="Whether this is the selected provider")
    models: List[str] = Field(default_factory=list, description="Available models")
    default_model: str = Field("", description="Default model for this provider")
    selected_model: str = Field(
        "", description="Currently selected model for this provider"
    )


class LLMConfigResponse(BaseModel):
    """Response for LLM configuration."""

    preferred_llm: str = Field(..., description="Currently selected LLM provider")
    openai_configured: bool = Field(False, description="Whether OpenAI API key is set")
    anthropic_configured: bool = Field(
        False, description="Whether Anthropic API key is set"
    )
    gemini_configured: bool = Field(False, description="Whether Gemini API key is set")
    openai_model: str = Field("gpt-4.1", description="Selected OpenAI model")
    anthropic_model: str = Field(
        "claude-sonnet-4-6-20260217", description="Selected Anthropic model"
    )
    gemini_model: str = Field("gemini-2.5-flash", description="Selected Gemini model")
    claude_code_status: CLIStatus = Field(..., description="Claude Code CLI status")
    gemini_cli_status: Optional[CLIStatus] = Field(
        None, description="Gemini CLI status"
    )
    codex_cli_status: Optional[CLIStatus] = Field(None, description="Codex CLI status")
    providers: List[LLMProvider] = Field(
        default_factory=list, description="Available providers"
    )
    runtime: str = Field(
        "external",
        description="Runtime environment: 'docker', 'local', 'electron', or 'external'",
    )


class LLMConfigUpdate(BaseModel):
    """Request to update LLM configuration."""

    provider: Optional[str] = Field(None, description="Set preferred provider")
    openai_api_key: Optional[str] = Field(
        None, description="OpenAI API key (will be encrypted)"
    )
    anthropic_api_key: Optional[str] = Field(
        None, description="Anthropic API key (will be encrypted)"
    )
    gemini_api_key: Optional[str] = Field(
        None, description="Gemini API key (will be encrypted)"
    )
    openai_model: Optional[str] = Field(None, description="Selected OpenAI model")
    anthropic_model: Optional[str] = Field(None, description="Selected Anthropic model")
    gemini_model: Optional[str] = Field(None, description="Selected Gemini model")


class APIKeyValidationRequest(BaseModel):
    """Request to validate an API key."""

    api_key: str = Field(..., description="API key to validate")


class APIKeyValidationResponse(BaseModel):
    """Response from API key validation."""

    valid: bool = Field(..., description="Whether the API key is valid")
    error: Optional[str] = Field(None, description="Error message if validation failed")
    provider: str = Field(..., description="Provider that was validated")


class LLMProviderInfo(BaseModel):
    """Information about available LLM providers."""

    id: str
    name: str
    description: str
    models: List[str]
    default_model: str
    docs_url: str
    has_cli: bool = False  # Claude Code and Gemini CLI are supported


class CLITestResponse(BaseModel):
    """Response from CLI test."""

    success: bool = Field(..., description="Whether the test was successful")
    tool: str = Field(..., description="Tool that was tested")
    message: str = Field(..., description="Test result message")
    output: Optional[str] = Field(None, description="CLI output if any")
    model: Optional[str] = Field(None, description="Model used for the test")
    provider: Optional[str] = Field(
        None, description="Mapped provider for usage tracking"
    )
    token_usage: int = Field(default=0, description="Token usage from actual API call")
    auth_status: str = Field(
        default="unknown",
        description="Authentication status: 'authenticated', 'auth_failed', or 'unknown'",
    )


class CLIConnectRequest(BaseModel):
    """Request to connect a CLI tool by providing an API key."""

    api_key: str = Field(..., description="API key for the CLI tool's provider")


class CLIConnectResponse(BaseModel):
    """Response from CLI connect/disconnect."""

    success: bool = Field(..., description="Whether the operation was successful")
    message: str = Field(..., description="Result message")
    provider: Optional[str] = Field(None, description="Mapped provider ID")
    env_var: Optional[str] = Field(
        None, description="Environment variable that was set/unset"
    )


class LLMTestRequest(BaseModel):
    """Request to test an LLM provider with a specific API key."""

    api_key: Optional[str] = Field(
        None, description="API key to test (if not provided, uses stored key)"
    )
    model: Optional[str] = Field(None, description="Model to use for testing")


class StoredAPIKeysResponse(BaseModel):
    """Response containing stored (decrypted) API keys for a user."""

    openai_api_key: Optional[str] = Field(None, description="Stored OpenAI API key")
    anthropic_api_key: Optional[str] = Field(
        None, description="Stored Anthropic API key"
    )
    gemini_api_key: Optional[str] = Field(None, description="Stored Gemini API key")


class LLMTestResponse(BaseModel):
    """Response from LLM provider test."""

    success: bool = Field(..., description="Whether the test was successful")
    provider: str = Field(..., description="Provider that was tested")
    model: str = Field(..., description="Model that was used")
    response: str = Field(..., description="LLM response")
    token_usage: int = Field(default=0, description="Total tokens used")
