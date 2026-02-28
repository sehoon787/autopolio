"""
LLM Configuration Router - Manage API keys and CLI status.
"""

import logging
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.database import get_db
from api.models.user import User
from api.schemas.llm import (
    CLIStatus,
    LLMConfigResponse,
    LLMConfigUpdate,
    APIKeyValidationRequest,
    APIKeyValidationResponse,
    LLMProvider,
    LLMProviderInfo,
    CLITestResponse,
    CLIConnectRequest,
    CLIConnectResponse,
    LLMTestRequest,
    LLMTestResponse,
)
from api.services.llm import get_cli_service
from api.services.core import EncryptionService
from api.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()
encryption_service = EncryptionService()

# CLI type → .env variable mapping (separate from API provider keys)
CLI_ENV_MAP = {
    "claude_code": "CLAUDE_CODE_API_KEY",
    "codex_cli": "CODEX_API_KEY",
    "gemini_cli": "GEMINI_CLI_API_KEY",
}

# CLI type → provider ID mapping
CLI_PROVIDER_MAP = {
    "claude_code": "anthropic",
    "codex_cli": "openai",
    "gemini_cli": "gemini",
}


def _get_env_path() -> str:
    """Get the path to the .env file."""
    import os
    from pathlib import Path

    # In Docker, .env is mounted at /app/.env
    env_path = (
        Path(os.environ.get("AUTOPOLIO_BASE_DIR", Path(__file__).parent.parent.parent))
        / ".env"
    )
    return str(env_path)


def _set_env_key(key: str, value: str) -> None:
    """Set a key in .env file and update os.environ + settings cache."""
    import os
    from dotenv import set_key

    env_path = _get_env_path()
    set_key(env_path, key, value)
    os.environ[key] = value
    get_settings.cache_clear()


def _unset_env_key(key: str) -> None:
    """Remove a key from .env file and update os.environ + settings cache."""
    import os
    from dotenv import unset_key

    env_path = _get_env_path()
    unset_key(env_path, key)
    os.environ.pop(key, None)
    get_settings.cache_clear()
    # Verify removal
    remaining = os.environ.get(key)
    if remaining:
        logger.warning(
            "_unset_env_key: %s still in os.environ after pop (value length=%d), forcing removal",
            key,
            len(remaining),
        )
        del os.environ[key]


# Available LLM providers configuration (order: Anthropic → Gemini → OpenAI)
LLM_PROVIDERS = [
    LLMProviderInfo(
        id="anthropic",
        name="Anthropic",
        description="Claude models for text generation",
        models=[
            "claude-sonnet-4-6-20260217",
            "claude-opus-4-6-20260205",
            "claude-sonnet-4-20250514",
            "claude-opus-4-20250514",
            "claude-haiku-4-5-20251001",
        ],
        default_model="claude-sonnet-4-6-20260217",
        docs_url="https://docs.anthropic.com",
        has_cli=True,  # Claude Code CLI exists
    ),
    LLMProviderInfo(
        id="gemini",
        name="Google Gemini",
        description="Gemini models for text generation",
        models=["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
        default_model="gemini-2.5-flash",
        docs_url="https://ai.google.dev/docs",
        has_cli=True,  # Gemini CLI supported
    ),
    LLMProviderInfo(
        id="openai",
        name="OpenAI",
        description="GPT-4.1 and GPT-4o models for text generation",
        models=["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini"],
        default_model="gpt-4.1",
        docs_url="https://platform.openai.com/docs",
        has_cli=True,  # Codex CLI exists
    ),
]


@router.get("/config", response_model=LLMConfigResponse)
async def get_llm_config(
    user_id: int = Query(None),  # Optional - can work without user
    db: AsyncSession = Depends(get_db),
):
    """Get LLM configuration and CLI status. User ID is optional for viewing providers."""
    user = None
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    # Get CLI status
    cli_service = get_cli_service()
    claude_status = await cli_service.detect_claude_code()
    gemini_status = await cli_service.detect_gemini_cli()
    codex_status = await cli_service.detect_codex_cli()

    # Build provider list with configuration status
    current_settings = get_settings()
    providers = []
    for provider_info in LLM_PROVIDERS:
        env_configured = False
        user_configured = False
        selected_model = provider_info.default_model
        is_primary = provider_info.id == "openai"  # Default primary

        # Check environment variable configuration (.env)
        if provider_info.id == "openai":
            env_configured = bool(current_settings.openai_api_key)
        elif provider_info.id == "anthropic":
            env_configured = bool(current_settings.anthropic_api_key)
        elif provider_info.id == "gemini":
            env_configured = bool(current_settings.gemini_api_key)

        # Check user database configuration
        if user:
            if provider_info.id == "openai":
                user_configured = user.openai_api_key_encrypted is not None
                selected_model = user.openai_model or provider_info.default_model
            elif provider_info.id == "anthropic":
                user_configured = user.anthropic_api_key_encrypted is not None
                selected_model = user.anthropic_model or provider_info.default_model
            elif provider_info.id == "gemini":
                user_configured = user.gemini_api_key_encrypted is not None
                selected_model = user.gemini_model or provider_info.default_model
            is_primary = user.preferred_llm == provider_info.id

        # configured = either env or user configured
        configured = env_configured or user_configured

        providers.append(
            LLMProvider(
                id=provider_info.id,
                name=provider_info.name,
                description=provider_info.description,
                configured=configured,
                env_configured=env_configured,
                user_configured=user_configured,
                is_primary=is_primary,
                models=provider_info.models,
                default_model=provider_info.default_model,
                selected_model=selected_model,
            )
        )

    runtime = os.environ.get("AUTOPOLIO_RUNTIME", "external")

    return LLMConfigResponse(
        preferred_llm=user.preferred_llm if user else "openai",
        openai_configured=user.openai_api_key_encrypted is not None if user else False,
        anthropic_configured=user.anthropic_api_key_encrypted is not None
        if user
        else False,
        gemini_configured=user.gemini_api_key_encrypted is not None if user else False,
        openai_model=user.openai_model if user else "gpt-4.1",
        anthropic_model=user.anthropic_model if user else "claude-sonnet-4-6-20260217",
        gemini_model=user.gemini_model if user else "gemini-2.5-flash",
        claude_code_status=CLIStatus(**claude_status),
        gemini_cli_status=CLIStatus(**gemini_status),
        codex_cli_status=CLIStatus(**codex_status),
        providers=providers,
        runtime=runtime,
    )


@router.put("/config", response_model=LLMConfigResponse)
async def update_llm_config(
    config: LLMConfigUpdate,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Update LLM configuration (API keys and provider preference)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update preferred provider
    if config.provider:
        if config.provider not in ["openai", "anthropic", "gemini"]:
            raise HTTPException(status_code=400, detail="Invalid provider")
        user.preferred_llm = config.provider

    # Update API keys (encrypt before storing)
    if config.openai_api_key is not None:
        if config.openai_api_key == "":
            user.openai_api_key_encrypted = None
        else:
            user.openai_api_key_encrypted = encryption_service.encrypt(
                config.openai_api_key
            )

    if config.anthropic_api_key is not None:
        if config.anthropic_api_key == "":
            user.anthropic_api_key_encrypted = None
        else:
            user.anthropic_api_key_encrypted = encryption_service.encrypt(
                config.anthropic_api_key
            )

    if config.gemini_api_key is not None:
        if config.gemini_api_key == "":
            user.gemini_api_key_encrypted = None
        else:
            user.gemini_api_key_encrypted = encryption_service.encrypt(
                config.gemini_api_key
            )

    # Update model preferences
    if config.openai_model is not None:
        user.openai_model = config.openai_model
    if config.anthropic_model is not None:
        user.anthropic_model = config.anthropic_model
    if config.gemini_model is not None:
        user.gemini_model = config.gemini_model

    await db.flush()
    await db.refresh(user)

    # Return updated config
    return await get_llm_config(user_id=user_id, db=db)


@router.post("/validate/{provider}", response_model=APIKeyValidationResponse)
async def validate_api_key(
    provider: str,
    request: APIKeyValidationRequest,
):
    """Validate an API key for a specific provider."""
    if provider not in ["openai", "anthropic", "gemini"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    api_key = request.api_key.strip()

    # Basic format validation
    if not api_key:
        return APIKeyValidationResponse(
            valid=False,
            error="API key is empty",
            provider=provider,
        )

    # Provider-specific format validation
    if provider == "openai":
        if not api_key.startswith("sk-"):
            return APIKeyValidationResponse(
                valid=False,
                error="OpenAI API keys should start with 'sk-'",
                provider=provider,
            )

    elif provider == "anthropic":
        if not api_key.startswith("sk-ant-"):
            return APIKeyValidationResponse(
                valid=False,
                error="Anthropic API keys should start with 'sk-ant-'",
                provider=provider,
            )

    # Try to make a test API call
    try:
        if provider == "openai":
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=api_key)
            # Simple models list call to validate
            await client.models.list()

        elif provider == "anthropic":
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=api_key)
            # Simple message to validate
            await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}],
            )

        elif provider == "gemini":
            from google import genai

            client = genai.Client(api_key=api_key)
            # List models to validate the API key
            models = client.models.list()
            # Force evaluation by accessing the result
            _ = list(models)

        return APIKeyValidationResponse(
            valid=True,
            provider=provider,
        )

    except Exception as e:
        error_msg = str(e)
        # Simplify error message for user
        if "authentication" in error_msg.lower() or "invalid" in error_msg.lower():
            error_msg = "Invalid API key"
        elif "rate" in error_msg.lower():
            error_msg = "Rate limited - key may be valid"
        elif "quota" in error_msg.lower():
            error_msg = "Quota exceeded - key may be valid"

        return APIKeyValidationResponse(
            valid=False,
            error=error_msg[:200],  # Limit error message length
            provider=provider,
        )


@router.get("/cli/status", response_model=CLIStatus)
async def get_cli_status():
    """Get Claude Code CLI detection status."""
    cli_service = get_cli_service()
    status = await cli_service.detect_claude_code()
    return CLIStatus(**status)


@router.get("/cli/gemini/status", response_model=CLIStatus)
async def get_gemini_cli_status():
    """Get Gemini CLI detection status."""
    cli_service = get_cli_service()
    status = await cli_service.detect_gemini_cli()
    return CLIStatus(**status)


@router.get("/cli/codex/status", response_model=CLIStatus)
async def get_codex_cli_status():
    """Get Codex CLI detection status."""
    cli_service = get_cli_service()
    status = await cli_service.detect_codex_cli()
    return CLIStatus(**status)


@router.post("/cli/refresh", response_model=CLIStatus)
async def refresh_cli_status():
    """Force refresh CLI detection (clears cache)."""
    # Clear the version cache
    from api.services.llm import CLIService

    CLIService._cached_latest_version = None

    cli_service = get_cli_service()
    status = await cli_service.detect_claude_code()
    return CLIStatus(**status)


@router.get("/providers", response_model=List[LLMProviderInfo])
async def get_providers():
    """List available LLM providers."""
    return LLM_PROVIDERS


@router.post("/cli/test/{cli_type}", response_model=CLITestResponse)
async def test_cli(cli_type: str, model: str = Query(None)):
    """Test a CLI tool by sending a real prompt to verify authentication."""
    if cli_type not in ["claude_code", "gemini_cli", "codex_cli"]:
        raise HTTPException(status_code=400, detail="Invalid CLI type")

    mapped_provider = CLI_PROVIDER_MAP[cli_type]
    cli_service = get_cli_service()

    # 1. Check CLI installation
    if cli_type == "claude_code":
        status = await cli_service.detect_claude_code()
    elif cli_type == "codex_cli":
        status = await cli_service.detect_codex_cli()
    else:
        status = await cli_service.detect_gemini_cli()

    if not status.get("installed"):
        cli_names = {
            "claude_code": "Claude Code",
            "gemini_cli": "Gemini",
            "codex_cli": "Codex",
        }
        cli_name = cli_names.get(cli_type, cli_type)
        return CLITestResponse(
            success=False,
            tool=cli_type,
            message=f"{cli_name} CLI is not installed",
            provider=mapped_provider,
            auth_status="unknown",
        )

    # 2. Send a real prompt via CLILLMService to test authentication
    used_model = model or ""
    try:
        from api.services.llm.cli_llm_service import CLILLMService

        cli_llm = CLILLMService(cli_type=cli_type, model=model)
        content, token_count = await cli_llm.generate_with_cli("Reply with only 'OK'")

        # Check if output content indicates auth failure (CLI may not error out)
        content_lower = (content or "").lower()
        auth_fail_patterns = [
            "not logged in",
            "please run /login",
            "login required",
            "api key",
            "unauthorized",
            "credit balance",
            "quota exceeded",
            "model metadata",
            "model not found",
            "does not exist",
            "insufficient",
        ]
        is_content_auth_fail = any(p in content_lower for p in auth_fail_patterns)

        if is_content_auth_fail and token_count == 0:
            # Classify CLI error for consistent messaging
            cli_names = {
                "claude_code": "Anthropic",
                "codex_cli": "OpenAI",
                "gemini_cli": "Google",
            }
            account_name = cli_names.get(cli_type, cli_type)
            if "quota" in content_lower or "exceeded" in content_lower:
                fail_msg = f"Quota exceeded — check your {account_name} billing plan."
            elif "credit" in content_lower or "balance" in content_lower:
                fail_msg = (
                    f"Insufficient credit balance — top up your {account_name} account."
                )
            elif "model" in content_lower and (
                "not found" in content_lower
                or "not exist" in content_lower
                or "metadata" in content_lower
            ):
                fail_msg = (
                    f"Model not found — {used_model or 'default'} is not available."
                )
            else:
                fail_msg = content[:200] if content else "Unknown error"
            return CLITestResponse(
                success=False,
                tool=cli_type,
                message=fail_msg,
                output=content[:200] if content else None,
                model=used_model,
                provider=mapped_provider,
                token_usage=0,
                auth_status="auth_failed",
            )

        # No meaningful response = failure
        if not content or not content.strip():
            return CLITestResponse(
                success=False,
                tool=cli_type,
                message="CLI returned empty response",
                output=None,
                model=used_model,
                provider=mapped_provider,
                token_usage=0,
                auth_status="auth_failed",
            )

        return CLITestResponse(
            success=True,
            tool=cli_type,
            message=f"CLI authenticated and working! Version: {status.get('version', 'unknown')}",
            output=content[:200] if content else None,
            model=used_model,
            provider=mapped_provider,
            token_usage=token_count,
            auth_status="authenticated",
        )
    except Exception as e:
        error_str = str(e)
        logger.warning("CLI test failed for %s: %s", cli_type, error_str[:300])

        cli_names = {
            "claude_code": "Anthropic",
            "codex_cli": "OpenAI",
            "gemini_cli": "Google",
        }
        account_name = cli_names.get(cli_type, cli_type)
        error_lower = error_str.lower()
        if "quota" in error_lower or "exceeded" in error_lower or "429" in error_str:
            msg = f"Quota exceeded — check your {account_name} billing plan."
        elif "credit" in error_lower or "balance" in error_lower:
            msg = f"Insufficient credit balance — top up your {account_name} account."
        elif (
            "not found" in error_lower
            or "does not exist" in error_lower
            or "metadata" in error_lower
        ):
            msg = f"Model not found — {used_model or 'default'} is not available."
        else:
            msg = f"CLI test failed: {error_str[:200]}"

        return CLITestResponse(
            success=False,
            tool=cli_type,
            message=msg,
            model=used_model,
            provider=mapped_provider,
            auth_status="auth_failed",
        )


@router.post("/cli/connect/{cli_type}", response_model=CLIConnectResponse)
async def connect_cli(cli_type: str, request: CLIConnectRequest):
    """Connect a CLI tool by saving its API key to .env."""
    if cli_type not in CLI_ENV_MAP:
        raise HTTPException(status_code=400, detail="Invalid CLI type")

    env_var = CLI_ENV_MAP[cli_type]
    provider = CLI_PROVIDER_MAP[cli_type]

    try:
        api_key = request.api_key.strip()
        if not api_key:
            raise HTTPException(status_code=400, detail="API key cannot be empty")

        _set_env_key(env_var, api_key)
        logger.info("CLI connect: %s → %s set in .env", cli_type, env_var)

        return CLIConnectResponse(
            success=True,
            message=f"{env_var} saved to .env",
            provider=provider,
            env_var=env_var,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("CLI connect failed for %s: %s", cli_type, e)
        return CLIConnectResponse(
            success=False,
            message=f"Failed to save API key: {str(e)[:200]}",
            provider=provider,
            env_var=env_var,
        )


@router.post("/cli/disconnect/{cli_type}", response_model=CLIConnectResponse)
async def disconnect_cli(cli_type: str):
    """Disconnect a CLI tool by removing its API key from .env."""
    if cli_type not in CLI_ENV_MAP:
        raise HTTPException(status_code=400, detail="Invalid CLI type")

    env_var = CLI_ENV_MAP[cli_type]
    provider = CLI_PROVIDER_MAP[cli_type]

    try:
        import os

        _unset_env_key(env_var)
        # Verify the key is truly gone from both os.environ and settings
        env_val = os.environ.get(env_var, "")
        settings = get_settings()
        settings_val = getattr(settings, env_var.lower(), "")
        logger.info(
            "CLI disconnect: %s → %s removed. os.environ has key=%s, settings has key=%s",
            cli_type,
            env_var,
            bool(env_val),
            bool(settings_val),
        )

        return CLIConnectResponse(
            success=True,
            message=f"{env_var} removed from .env",
            provider=provider,
            env_var=env_var,
        )
    except Exception as e:
        logger.exception("CLI disconnect failed for %s: %s", cli_type, e)
        return CLIConnectResponse(
            success=False,
            message=f"Failed to remove API key: {str(e)[:200]}",
            provider=provider,
            env_var=env_var,
        )


@router.post("/test/{provider}", response_model=LLMTestResponse)
async def test_provider(
    provider: str,
    request: LLMTestRequest = None,
    user_id: int = Query(None),
    use_env: bool = Query(
        True, description="Whether to fall back to .env API keys (False for Electron)"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Test an LLM provider by making a simple API call.

    If api_key is provided in request body, it will be used directly.
    Otherwise, falls back to stored user key or environment variables.
    """
    if provider not in ["openai", "anthropic", "gemini"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    # Default model based on provider
    default_models = {
        "openai": "gpt-4.1",
        "anthropic": "claude-sonnet-4-6-20260217",
        "gemini": "gemini-2.5-flash",
    }

    # Priority 1: Use API key from request body (for direct testing without saving)
    api_key = None
    model = None

    if request and request.api_key:
        api_key = request.api_key.strip()
        model = request.model or default_models.get(provider)

    # Priority 2: Get user's stored API key from database
    if not api_key and user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user:
            if provider == "openai":
                if user.openai_api_key_encrypted:
                    api_key = encryption_service.decrypt(user.openai_api_key_encrypted)
                model = model or user.openai_model or default_models["openai"]
            elif provider == "anthropic":
                if user.anthropic_api_key_encrypted:
                    api_key = encryption_service.decrypt(
                        user.anthropic_api_key_encrypted
                    )
                model = model or user.anthropic_model or default_models["anthropic"]
            elif provider == "gemini":
                if user.gemini_api_key_encrypted:
                    api_key = encryption_service.decrypt(user.gemini_api_key_encrypted)
                model = model or user.gemini_model or default_models["gemini"]

    # Priority 3: Fall back to settings (environment variables) only if use_env is True (Web mode)
    if not api_key and use_env:
        current_settings = get_settings()
        if provider == "openai":
            api_key = current_settings.openai_api_key or None
            model = model or current_settings.openai_model
        elif provider == "anthropic":
            api_key = current_settings.anthropic_api_key or None
            model = model or current_settings.anthropic_model
        elif provider == "gemini":
            api_key = current_settings.gemini_api_key or None
            model = model or current_settings.gemini_model

    # Ensure model is set
    model = model or default_models.get(provider, "unknown")

    if not api_key:
        return LLMTestResponse(
            success=False,
            provider=provider,
            model=model,
            response=f"No API key configured for {provider}",
        )

    try:
        test_prompt = "Reply with only 'OK' and nothing else."
        logger.info("LLM test: provider=%s, model=%s", provider, model)

        if provider == "openai":
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": test_prompt}],
                max_tokens=50,
            )
            tokens = response.usage.total_tokens if response.usage else 0
            output = response.choices[0].message.content
            logger.info("OpenAI test success: tokens=%d", tokens)
            return LLMTestResponse(
                success=True,
                provider=provider,
                model=model,
                response=output,
                token_usage=tokens,
            )

        elif provider == "anthropic":
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=model,
                max_tokens=50,
                messages=[{"role": "user", "content": test_prompt}],
            )
            tokens = (
                (response.usage.input_tokens + response.usage.output_tokens)
                if response.usage
                else 0
            )
            output = response.content[0].text
            in_tokens = getattr(response.usage, "input_tokens", 0)
            out_tokens = getattr(response.usage, "output_tokens", 0)
            logger.info(
                "Anthropic test success: tokens=%d (in=%d, out=%d)",
                tokens,
                in_tokens,
                out_tokens,
            )
            return LLMTestResponse(
                success=True,
                provider=provider,
                model=model,
                response=output,
                token_usage=tokens,
            )

        elif provider == "gemini":
            from google import genai

            client = genai.Client(api_key=api_key)
            response = await client.aio.models.generate_content(
                model=model,
                contents=test_prompt,
            )
            tokens = 0
            if response.usage_metadata:
                tokens = getattr(
                    response.usage_metadata, "prompt_token_count", 0
                ) + getattr(response.usage_metadata, "candidates_token_count", 0)
            output = response.text
            logger.info("Gemini test success: tokens=%d", tokens)
            return LLMTestResponse(
                success=True,
                provider=provider,
                model=model,
                response=output,
                token_usage=tokens,
            )

    except Exception as e:
        error_str = str(e)
        logger.warning("LLM test failed for %s: %s", provider, error_str[:300])

        # Classify error for consistent messaging
        error_lower = error_str.lower()
        if "quota" in error_lower or "exceeded" in error_lower or "429" in error_str:
            msg = f"Quota exceeded — check your {provider.capitalize()} billing plan."
        elif (
            "credit" in error_lower
            or "balance" in error_lower
            or "insufficient" in error_lower
        ):
            msg = f"Insufficient credit balance — top up your {provider.capitalize()} account."
        elif (
            "401" in error_str
            or "unauthorized" in error_lower
            or "invalid" in error_lower
        ):
            msg = f"Invalid API key — check your {provider.capitalize()} API key."
        elif (
            "404" in error_str
            or "not found" in error_lower
            or "does not exist" in error_lower
        ):
            msg = f"Model not found — {model} is not available for your {provider.capitalize()} account."
        else:
            msg = f"Test failed: {error_str[:200]}"

        return LLMTestResponse(
            success=False,
            provider=provider,
            model=model or "unknown",
            response=msg,
        )
