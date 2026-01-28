"""
LLM Configuration Router - Manage API keys and CLI status.
"""
import asyncio
import sys
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
    CLITestResponse,
    LLMTestRequest,
    LLMTestResponse,
    StoredAPIKeysResponse,
)
from api.services.cli_service import get_cli_service
from api.services.encryption_service import EncryptionService
from api.config import get_settings

router = APIRouter()
encryption_service = EncryptionService()
settings = get_settings()


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
    user_id: int = Query(None),  # Optional - can work without user
    db: AsyncSession = Depends(get_db)
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

    # Build provider list with configuration status
    providers = []
    for provider_info in LLM_PROVIDERS:
        env_configured = False
        user_configured = False
        selected_model = provider_info.default_model
        is_primary = provider_info.id == "openai"  # Default primary

        # Check environment variable configuration (.env)
        if provider_info.id == "openai":
            env_configured = bool(settings.openai_api_key)
        elif provider_info.id == "anthropic":
            env_configured = bool(settings.anthropic_api_key)
        elif provider_info.id == "gemini":
            env_configured = bool(settings.gemini_api_key)

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

        providers.append(LLMProvider(
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
        ))

    return LLMConfigResponse(
        preferred_llm=user.preferred_llm if user else "openai",
        openai_configured=user.openai_api_key_encrypted is not None if user else False,
        anthropic_configured=user.anthropic_api_key_encrypted is not None if user else False,
        gemini_configured=user.gemini_api_key_encrypted is not None if user else False,
        openai_model=user.openai_model if user else "gpt-4-turbo-preview",
        anthropic_model=user.anthropic_model if user else "claude-3-5-sonnet-20241022",
        gemini_model=user.gemini_model if user else "gemini-2.0-flash",
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


@router.get("/keys", response_model=StoredAPIKeysResponse)
async def get_stored_keys(
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Get stored (decrypted) API keys for a user. Only for Electron/desktop apps."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Decrypt stored keys
    openai_key = None
    anthropic_key = None
    gemini_key = None

    if user.openai_api_key_encrypted:
        try:
            openai_key = encryption_service.decrypt(user.openai_api_key_encrypted)
        except Exception:
            pass

    if user.anthropic_api_key_encrypted:
        try:
            anthropic_key = encryption_service.decrypt(user.anthropic_api_key_encrypted)
        except Exception:
            pass

    if user.gemini_api_key_encrypted:
        try:
            gemini_key = encryption_service.decrypt(user.gemini_api_key_encrypted)
        except Exception:
            pass

    return StoredAPIKeysResponse(
        openai_api_key=openai_key,
        anthropic_api_key=anthropic_key,
        gemini_api_key=gemini_key,
    )


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


@router.post("/cli/test/{cli_type}", response_model=CLITestResponse)
async def test_cli(cli_type: str):
    """Test a CLI tool by running a simple command."""
    if cli_type not in ["claude_code", "gemini_cli"]:
        raise HTTPException(status_code=400, detail="Invalid CLI type")

    provider_map = {"claude_code": "anthropic", "gemini_cli": "gemini"}
    mapped_provider = provider_map[cli_type]
    cli_service = get_cli_service()

    try:
        if cli_type == "claude_code":
            status = await cli_service.detect_claude_code()
            if not status.get("installed"):
                return CLITestResponse(
                    success=False,
                    tool=cli_type,
                    message="Claude Code CLI is not installed",
                    provider=mapped_provider,
                )
            # Test by getting version
            cli_path = status["path"]
            # Windows .cmd/.bat files need shell execution
            use_shell = sys.platform == "win32" and (cli_path.endswith('.cmd') or cli_path.endswith('.bat'))

            if use_shell:
                proc = await asyncio.create_subprocess_shell(
                    f'"{cli_path}" --version',
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            else:
                proc = await asyncio.create_subprocess_exec(
                    cli_path, "--version",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            output = stdout.decode().strip() if stdout else stderr.decode().strip()
            return CLITestResponse(
                success=True,
                tool=cli_type,
                message=f"Claude Code CLI is working! Version: {status.get('version', 'unknown')}",
                output=output,
                provider=mapped_provider,
            )
        else:  # gemini_cli
            status = await cli_service.detect_gemini_cli()
            if not status.get("installed"):
                return CLITestResponse(
                    success=False,
                    tool=cli_type,
                    message="Gemini CLI is not installed",
                    provider=mapped_provider,
                )
            # Test by getting version
            cli_path = status["path"]
            # Windows .cmd/.bat files need shell execution
            use_shell = sys.platform == "win32" and (cli_path.endswith('.cmd') or cli_path.endswith('.bat'))

            if use_shell:
                proc = await asyncio.create_subprocess_shell(
                    f'"{cli_path}" --version',
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            else:
                proc = await asyncio.create_subprocess_exec(
                    cli_path, "--version",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            output = stdout.decode().strip() if stdout else stderr.decode().strip()
            return CLITestResponse(
                success=True,
                tool=cli_type,
                message=f"Gemini CLI is working! Version: {status.get('version', 'unknown')}",
                output=output,
                provider=mapped_provider,
            )
    except asyncio.TimeoutError:
        return CLITestResponse(
            success=False,
            tool=cli_type,
            message="CLI test timed out",
            provider=mapped_provider,
        )
    except Exception as e:
        return CLITestResponse(
            success=False,
            tool=cli_type,
            message=f"CLI test failed: {str(e)}",
            provider=mapped_provider,
        )


@router.post("/test/{provider}", response_model=LLMTestResponse)
async def test_provider(
    provider: str,
    request: LLMTestRequest = None,
    user_id: int = Query(None),
    use_env: bool = Query(True, description="Whether to fall back to .env API keys (False for Electron)"),
    db: AsyncSession = Depends(get_db)
):
    """Test an LLM provider by making a simple API call.

    If api_key is provided in request body, it will be used directly.
    Otherwise, falls back to stored user key or environment variables.
    """
    if provider not in ["openai", "anthropic", "gemini"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    # Default model based on provider
    default_models = {
        "openai": "gpt-4-turbo-preview",
        "anthropic": "claude-3-5-sonnet-20241022",
        "gemini": "gemini-2.0-flash",
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
                    api_key = encryption_service.decrypt(user.anthropic_api_key_encrypted)
                model = model or user.anthropic_model or default_models["anthropic"]
            elif provider == "gemini":
                if user.gemini_api_key_encrypted:
                    api_key = encryption_service.decrypt(user.gemini_api_key_encrypted)
                model = model or user.gemini_model or default_models["gemini"]

    # Priority 3: Fall back to settings (environment variables) only if use_env is True (Web mode)
    if not api_key and use_env:
        if provider == "openai":
            api_key = settings.openai_api_key or None
            model = model or settings.openai_model
        elif provider == "anthropic":
            api_key = settings.anthropic_api_key or None
            model = model or settings.anthropic_model
        elif provider == "gemini":
            api_key = settings.gemini_api_key or None
            model = model or settings.gemini_model

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
        test_prompt = "Say 'Hello, I am working!' in one sentence."

        if provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": test_prompt}],
                max_tokens=50,
            )
            tokens = response.usage.total_tokens if response.usage else 0
            return LLMTestResponse(
                success=True,
                provider=provider,
                model=model,
                response=response.choices[0].message.content,
                token_usage=tokens,
            )

        elif provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=model,
                max_tokens=50,
                messages=[{"role": "user", "content": test_prompt}]
            )
            tokens = (response.usage.input_tokens + response.usage.output_tokens) if response.usage else 0
            return LLMTestResponse(
                success=True,
                provider=provider,
                model=model,
                response=response.content[0].text,
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
                tokens = (
                    getattr(response.usage_metadata, 'prompt_token_count', 0) +
                    getattr(response.usage_metadata, 'candidates_token_count', 0)
                )
            return LLMTestResponse(
                success=True,
                provider=provider,
                model=model,
                response=response.text,
                token_usage=tokens,
            )

    except Exception as e:
        return LLMTestResponse(
            success=False,
            provider=provider,
            model=model or "unknown",
            response=f"Test failed: {str(e)[:200]}",
        )
