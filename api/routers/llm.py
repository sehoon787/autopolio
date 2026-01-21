"""
LLM Configuration Router - Manage API keys and CLI status.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

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
)
from api.services.cli_service import get_cli_service
from api.services.encryption_service import EncryptionService

router = APIRouter()
encryption_service = EncryptionService()


# Available LLM providers configuration
LLM_PROVIDERS = [
    LLMProviderInfo(
        id="openai",
        name="OpenAI",
        description="GPT-4 and GPT-3.5 models for text generation",
        models=["gpt-4-turbo-preview", "gpt-4", "gpt-3.5-turbo"],
        default_model="gpt-4-turbo-preview",
        docs_url="https://platform.openai.com/docs",
        has_cli=False,
    ),
    LLMProviderInfo(
        id="anthropic",
        name="Anthropic",
        description="Claude models for text generation",
        models=["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
        default_model="claude-3-5-sonnet-20241022",
        docs_url="https://docs.anthropic.com",
        has_cli=True,  # Claude Code CLI exists
    ),
    LLMProviderInfo(
        id="gemini",
        name="Google Gemini",
        description="Gemini models for text generation",
        models=["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
        default_model="gemini-2.0-flash",
        docs_url="https://ai.google.dev/docs",
        has_cli=True,  # Gemini CLI supported
    ),
]


@router.get("/config", response_model=LLMConfigResponse)
async def get_llm_config(
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Get LLM configuration and CLI status for a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get CLI status
    cli_service = get_cli_service()
    claude_status = await cli_service.detect_claude_code()
    gemini_status = await cli_service.detect_gemini_cli()

    # Build provider list with configuration status
    providers = []
    for provider_info in LLM_PROVIDERS:
        configured = False
        selected_model = provider_info.default_model
        if provider_info.id == "openai":
            configured = user.openai_api_key_encrypted is not None
            selected_model = user.openai_model or provider_info.default_model
        elif provider_info.id == "anthropic":
            configured = user.anthropic_api_key_encrypted is not None
            selected_model = user.anthropic_model or provider_info.default_model
        elif provider_info.id == "gemini":
            configured = user.gemini_api_key_encrypted is not None
            selected_model = user.gemini_model or provider_info.default_model

        providers.append(LLMProvider(
            id=provider_info.id,
            name=provider_info.name,
            description=provider_info.description,
            configured=configured,
            is_primary=user.preferred_llm == provider_info.id,
            models=provider_info.models,
            default_model=provider_info.default_model,
            selected_model=selected_model,
        ))

    return LLMConfigResponse(
        preferred_llm=user.preferred_llm or "openai",
        openai_configured=user.openai_api_key_encrypted is not None,
        anthropic_configured=user.anthropic_api_key_encrypted is not None,
        gemini_configured=user.gemini_api_key_encrypted is not None,
        openai_model=user.openai_model or "gpt-4-turbo-preview",
        anthropic_model=user.anthropic_model or "claude-3-5-sonnet-20241022",
        gemini_model=user.gemini_model or "gemini-2.0-flash",
        claude_code_status=CLIStatus(**claude_status),
        gemini_cli_status=CLIStatus(**gemini_status),
        providers=providers,
    )


@router.put("/config", response_model=LLMConfigResponse)
async def update_llm_config(
    config: LLMConfigUpdate,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db)
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
            user.openai_api_key_encrypted = encryption_service.encrypt(config.openai_api_key)

    if config.anthropic_api_key is not None:
        if config.anthropic_api_key == "":
            user.anthropic_api_key_encrypted = None
        else:
            user.anthropic_api_key_encrypted = encryption_service.encrypt(config.anthropic_api_key)

    if config.gemini_api_key is not None:
        if config.gemini_api_key == "":
            user.gemini_api_key_encrypted = None
        else:
            user.gemini_api_key_encrypted = encryption_service.encrypt(config.gemini_api_key)

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
                model="claude-3-haiku-20240307",
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}]
            )

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            # List models to validate
            models = genai.list_models()
            # Force evaluation
            list(models)

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


@router.post("/cli/refresh", response_model=CLIStatus)
async def refresh_cli_status():
    """Force refresh CLI detection (clears cache)."""
    # Clear the version cache
    from api.services.cli_service import CLIService
    CLIService._cached_latest_version = None

    cli_service = get_cli_service()
    status = await cli_service.detect_claude_code()
    return CLIStatus(**status)


@router.get("/providers", response_model=List[LLMProviderInfo])
async def get_providers():
    """List available LLM providers."""
    return LLM_PROVIDERS
