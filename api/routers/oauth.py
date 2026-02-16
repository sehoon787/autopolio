"""
OAuth Router - Unified OAuth endpoints for all providers
Supports: GitHub (more providers coming soon)
"""

import json
import base64
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from api.database import get_db
from api.config import get_settings
from api.services.oauth.factory import OAuthProviderFactory
from api.services.oauth import OAuthService

router = APIRouter()
settings = get_settings()


# ==================== Schemas ====================

class OAuthConnectResponse(BaseModel):
    """Response for OAuth connect endpoint"""
    auth_url: str
    provider: str


class OAuthIdentityResponse(BaseModel):
    """Response for OAuth identity"""
    id: int
    provider: str
    username: Optional[str]
    email: Optional[str]
    avatar_url: Optional[str]
    is_primary: bool
    created_at: str


class OAuthIdentitiesResponse(BaseModel):
    """Response for list of OAuth identities"""
    identities: list[OAuthIdentityResponse]


class AvailableProvidersResponse(BaseModel):
    """Response for available OAuth providers"""
    providers: list[dict]


# ==================== Helper Functions ====================

def encode_state(data: dict) -> str:
    """Encode state data to base64 string"""
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def decode_state(state: str) -> dict:
    """Decode base64 state string to dict"""
    try:
        return json.loads(base64.urlsafe_b64decode(state.encode()).decode())
    except Exception:
        return {}


def get_redirect_uri(provider: str, is_electron: bool = False) -> str:
    """Get the OAuth redirect URI for a provider"""
    if is_electron:
        # Electron uses custom protocol
        return f"autopolio://oauth-callback/{provider}"
    else:
        # Use the existing GitHub callback URL for compatibility
        # This must match the URL registered in GitHub OAuth App settings
        if provider == "github":
            return f"{settings.api_url}/api/github/callback"
        else:
            return f"{settings.api_url}/api/oauth/{provider}/callback"


def get_frontend_redirect_url(
    user_id: int,
    provider: str,
    is_electron: bool = False,
    redirect_path: str = "/setup/github"
) -> str:
    """Get the frontend URL to redirect to after OAuth"""
    params = {
        "user_id": user_id,
        "github_connected": "true",  # Keep for backwards compatibility
        "provider": provider,
    }

    if is_electron:
        # Electron custom protocol
        return f"autopolio://oauth-callback?{urlencode(params)}"
    else:
        return f"{settings.frontend_url}{redirect_path}?{urlencode(params)}"


# ==================== Endpoints ====================

@router.get("/providers", response_model=AvailableProvidersResponse)
async def get_available_providers():
    """
    Get list of available OAuth providers.
    Returns both configured and unconfigured providers with their status.
    """
    providers = OAuthProviderFactory.get_provider_info()
    return AvailableProvidersResponse(providers=providers)


@router.get("/{provider}/connect", response_model=OAuthConnectResponse)
async def oauth_connect(
    provider: str,
    redirect_path: str = Query("/setup/github", description="Path to redirect to after OAuth"),
    is_electron: bool = Query(False, description="Whether request is from Electron app"),
    user_id: Optional[int] = Query(None, description="User ID for account linking"),
    frontend_origin: Optional[str] = Query(None, description="Frontend origin for redirect after OAuth"),
):
    """
    Start OAuth flow for a provider.

    Args:
        provider: OAuth provider name (e.g., "github")
        redirect_path: Frontend path to redirect to after OAuth
        is_electron: True if request is from Electron desktop app
        user_id: Optional user ID to link the OAuth account to

    Returns:
        Authorization URL to redirect user to
    """
    # Validate provider
    if not OAuthProviderFactory.is_provider_configured(provider):
        raise HTTPException(
            status_code=400,
            detail=f"OAuth provider '{provider}' is not configured"
        )

    # Get provider instance
    oauth_provider = OAuthProviderFactory.get_provider(provider)

    # Build state with user context
    # For GitHub, use the same state format as the existing /api/github/callback handler
    if provider == "github":
        state_data = {
            "path": redirect_path,
            "origin": frontend_origin,
            "is_electron": is_electron,
            "user_id": user_id,
        }
    else:
        state_data = {
            "user_id": user_id,
            "provider": provider,
            "redirect_path": redirect_path,
            "is_electron": is_electron,
        }
    state = encode_state(state_data)

    # Get redirect URI
    redirect_uri = get_redirect_uri(provider, is_electron)

    # Generate authorization URL
    auth_url = oauth_provider.get_authorization_url(state, redirect_uri)

    return OAuthConnectResponse(auth_url=auth_url, provider=provider)


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str = Query(..., description="Authorization code from provider"),
    state: str = Query("", description="State parameter"),
    db: AsyncSession = Depends(get_db)
):
    """
    OAuth callback handler.

    Args:
        provider: OAuth provider name
        code: Authorization code from provider
        state: State parameter containing user context

    Returns:
        Redirect to frontend with user_id
    """
    # Decode state
    state_data = decode_state(state)
    user_id = state_data.get("user_id")
    redirect_path = state_data.get("redirect_path", "/setup/github")
    is_electron = state_data.get("is_electron", False)

    # Validate provider
    if not OAuthProviderFactory.is_provider_configured(provider):
        raise HTTPException(
            status_code=400,
            detail=f"OAuth provider '{provider}' is not configured"
        )

    try:
        # Get provider instance
        oauth_provider = OAuthProviderFactory.get_provider(provider)

        # Get redirect URI (must match what was used in connect)
        redirect_uri = get_redirect_uri(provider, is_electron)

        # Exchange code for access token
        access_token = await oauth_provider.exchange_code(code, redirect_uri)

        # Get user info from provider
        user_info = await oauth_provider.get_user_info(access_token)

        # Create or update OAuth identity
        oauth_service = OAuthService(db)
        identity, is_new = await oauth_service.create_or_update_identity(
            provider, user_info, user_id
        )

        await db.commit()

        # Redirect to frontend
        frontend_url = get_frontend_redirect_url(
            identity.user_id, provider, is_electron, redirect_path
        )
        return RedirectResponse(url=frontend_url)

    except ValueError as e:
        # OAuth error - redirect with error
        error_params = urlencode({"error": str(e)})
        error_url = f"{settings.frontend_url}{redirect_path}?{error_params}"
        return RedirectResponse(url=error_url)


@router.delete("/{provider}/disconnect")
async def oauth_disconnect(
    provider: str,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Disconnect an OAuth provider from a user's account.

    Args:
        provider: OAuth provider name
        user_id: User ID

    Returns:
        Success message
    """
    oauth_service = OAuthService(db)
    disconnected = False

    # Check that user has at least one other login method before disconnecting
    identities = await oauth_service.get_user_identities(user_id)
    if len(identities) <= 1:
        # Check if there's another way to login (e.g., password in future)
        # For now, we allow disconnecting the last identity
        pass

    # Try to remove from OAuthIdentity table
    success = await oauth_service.remove_identity(user_id, provider)
    if success:
        disconnected = True

    # For GitHub, clear the token but KEEP github_username for re-connection
    # github_username is used to identify the user when they reconnect later
    if provider == "github":
        from api.models.user import User
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and user.github_token_encrypted:
            user.github_token_encrypted = None
            # IMPORTANT: Keep github_username and github_avatar_url
            # These are needed to find the existing user when they reconnect
            # Only the token (authentication) is removed, not the identity
            disconnected = True

    if not disconnected:
        raise HTTPException(
            status_code=404,
            detail=f"OAuth connection for '{provider}' not found"
        )

    await db.commit()
    return {"success": True, "message": f"Disconnected from {provider}"}


@router.get("/identities", response_model=OAuthIdentitiesResponse)
async def get_oauth_identities(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all OAuth identities for a user.

    Args:
        user_id: User ID

    Returns:
        List of connected OAuth identities
    """
    oauth_service = OAuthService(db)
    identities = await oauth_service.get_user_identities(user_id)

    return OAuthIdentitiesResponse(
        identities=[
            OAuthIdentityResponse(
                id=ident.id,
                provider=ident.provider,
                username=ident.username,
                email=ident.email,
                avatar_url=ident.avatar_url,
                is_primary=ident.is_primary,
                created_at=ident.created_at.isoformat() if ident.created_at else "",
            )
            for ident in identities
        ]
    )


@router.put("/{provider}/set-primary")
async def set_primary_identity(
    provider: str,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Set an OAuth identity as the primary login method.

    Args:
        provider: OAuth provider name
        user_id: User ID

    Returns:
        Success message
    """
    oauth_service = OAuthService(db)

    success = await oauth_service.set_primary_identity(user_id, provider)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"OAuth connection for '{provider}' not found"
        )

    await db.commit()
    return {"success": True, "message": f"Set {provider} as primary login method"}
