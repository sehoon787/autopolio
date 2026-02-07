"""GitHub OAuth endpoints.

Handles OAuth flow, connection status, and token management.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from urllib.parse import quote
import httpx

from api.database import get_db
from api.config import get_settings
from api.models.user import User
from api.services.github import GitHubService
from api.services.core import EncryptionService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
settings = get_settings()
encryption = EncryptionService()


@router.get("/connect")
async def github_connect(
    redirect_url: Optional[str] = None,
    frontend_origin: Optional[str] = None,
    is_electron: bool = False,
    user_id: Optional[int] = None
):
    """Initiate GitHub OAuth flow."""
    import json
    import base64

    logger.info("[GitHub Connect] Called with redirect_url=%s, frontend_origin=%s, is_electron=%s, user_id=%s", redirect_url, frontend_origin, is_electron, user_id)
    logger.debug("[GitHub Connect] settings.github_client_id=%s", settings.github_client_id)

    if not settings.github_client_id:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth not configured. Set GITHUB_CLIENT_ID in environment."
        )

    # Build authorization URL
    # Scopes:
    # - repo: Full control of private repositories (includes public repos)
    # - user:email: Access user email addresses
    # - read:org: Read organization membership, team membership
    scope = "repo,user:email,read:org"

    # Encode origin, redirect_path, electron flag, and user_id in state
    state_data = {
        "path": redirect_url or "/",
        "origin": frontend_origin,  # Can be None, will use settings.frontend_url as fallback
        "is_electron": is_electron,  # Flag to use custom protocol for callback
        "user_id": user_id  # Existing user to link GitHub to (instead of creating new)
    }
    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    # URL encode the redirect_uri to prevent parsing issues
    encoded_redirect_uri = quote(settings.github_redirect_uri, safe='')

    auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={encoded_redirect_uri}"
        f"&scope={scope}"
        f"&state={state}"
    )

    return {"auth_url": auth_url}


@router.get("/callback")
async def github_callback(
    code: str,
    state: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Handle GitHub OAuth callback.

    Uses OAuthService to properly manage user identities and prevent duplicate user creation.
    The OAuthService looks up users by GitHub's unique provider_user_id (not just username),
    which ensures the same GitHub account always maps to the same user.
    """
    import json
    import base64
    from api.services.oauth import OAuthService
    from api.services.oauth.base import OAuthUserInfo

    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    # Exchange code for access token
    async with httpx.AsyncClient(timeout=30.0) as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"}
        )

    if token_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange code for token")

    token_data = token_response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="No access token received")

    # Get user info from GitHub
    github_service = GitHubService(access_token)
    github_user = await github_service.get_user_info()

    # Parse state to get user_id, origin, redirect path, and electron flag
    redirect_path = "/"
    frontend_origin = settings.frontend_url  # Default fallback
    is_electron = False
    existing_user_id = None  # User ID to link GitHub to (if provided)

    if state:
        try:
            # Try to decode as JSON (new format)
            state_data = json.loads(base64.urlsafe_b64decode(state).decode())
            redirect_path = state_data.get("path", "/")
            if state_data.get("origin"):
                frontend_origin = state_data["origin"]
            is_electron = state_data.get("is_electron", False)
            existing_user_id = state_data.get("user_id")  # Existing user to link GitHub to
        except Exception:
            # Fallback: old format (plain redirect path)
            redirect_path = state

    # Use OAuthService to find or create user (prevents duplicate user creation)
    # This uses provider_user_id (GitHub's unique user ID) for reliable lookup
    oauth_service = OAuthService(db)

    oauth_user_info = OAuthUserInfo(
        provider_user_id=str(github_user["id"]),  # GitHub's unique user ID (numeric)
        username=github_user["login"],
        email=github_user.get("email"),
        avatar_url=github_user.get("avatar_url"),
        access_token=access_token,
        raw_data=github_user
    )

    identity, is_new_user = await oauth_service.create_or_update_identity(
        provider="github",
        user_info=oauth_user_info,
        user_id=existing_user_id  # Link to existing user if provided
    )

    # Get the user from the identity
    user = identity.user
    if not user:
        # Fallback: load user if relationship wasn't loaded
        result = await db.execute(select(User).where(User.id == identity.user_id))
        user = result.scalar_one_or_none()

    if is_new_user:
        logger.info("[GitHub Callback] Created new user id=%s for GitHub username=%s (provider_user_id=%s)",
                    user.id, github_user["login"], github_user["id"])
    elif existing_user_id:
        logger.info("[GitHub Callback] Linked GitHub to existing user id=%s, username=%s (provider_user_id=%s)",
                    existing_user_id, github_user["login"], github_user["id"])
    else:
        logger.info("[GitHub Callback] Updated existing user id=%s, username=%s (provider_user_id=%s)",
                    user.id, github_user["login"], github_user["id"])

    await db.commit()

    # Build redirect URL
    if is_electron:
        # Electron: use custom protocol so browser opens Electron app
        # Format: autopolio://oauth-callback?user_id=...&github_connected=...&path=...
        from urllib.parse import quote as url_quote
        frontend_url = f"autopolio://oauth-callback?user_id={user.id}&github_connected=true&path={url_quote(redirect_path)}"
    else:
        # Web: redirect to frontend origin
        frontend_url = f"{frontend_origin}{redirect_path}?user_id={user.id}&github_connected=true"

    return RedirectResponse(url=frontend_url)


@router.get("/status")
async def get_github_status(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Check if GitHub is connected for a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_connected = bool(user.github_token_encrypted)

    # If connected, verify the token is still valid
    if is_connected:
        try:
            token = encryption.decrypt(user.github_token_encrypted)
            github_service = GitHubService(token)
            user_info = await github_service.get_user_info()
            return {
                "connected": True,
                "github_username": user_info.get("login"),
                "avatar_url": user_info.get("avatar_url"),
                "valid": True
            }
        except Exception:
            # Token is invalid or expired
            return {
                "connected": True,
                "github_username": user.github_username,
                "avatar_url": user.github_avatar_url,
                "valid": False,
                "message": "GitHub token has expired or is invalid. Please reconnect."
            }

    return {
        "connected": False,
        "github_username": None,
        "avatar_url": None,
        "valid": False
    }


@router.delete("/disconnect")
async def disconnect_github(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Disconnect GitHub account from user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.github_token_encrypted = None
    await db.commit()

    return {"message": "GitHub disconnected successfully"}


@router.post("/save-token")
async def save_github_token(
    user_id: int = Query(..., description="User ID"),
    token: str = Query(..., description="GitHub access token from gh CLI"),
    db: AsyncSession = Depends(get_db)
):
    """Save GitHub token from desktop app (via gh CLI).
    
    This endpoint is used by the Electron desktop app to save tokens
    obtained through the GitHub CLI device code flow.
    
    IMPORTANT: Handles UNIQUE constraint on github_username by:
    1. First verifying the token and getting GitHub user info
    2. Checking if another user already has this github_username
    3. If yes, updating that existing user instead (prevents duplicates)
    4. Returns the actual user ID that was updated
    """
    # Step 1: Verify the token first to get GitHub user info
    try:
        github_service = GitHubService(token)
        github_user = await github_service.get_user_info()
        github_username = github_user.get("login")
        github_avatar_url = github_user.get("avatar_url")
    except Exception as e:
        logger.error("Failed to verify GitHub token: %s", e)
        raise HTTPException(status_code=400, detail=f"Invalid GitHub token: {str(e)}")

    # Step 2: Check if another user already has this github_username
    existing_user_result = await db.execute(
        select(User).where(User.github_username == github_username)
    )
    existing_user = existing_user_result.scalar_one_or_none()

    # Step 3: Determine which user to update
    if existing_user and existing_user.id != user_id:
        # Another user already has this GitHub account linked
        # Update the existing user's token instead of creating a duplicate
        logger.info(
            "GitHub username '%s' already linked to user %s, updating that user instead of %s",
            github_username, existing_user.id, user_id
        )
        target_user = existing_user
        merged_from_user_id = user_id  # Track the original request
    else:
        # No conflict, update the requested user
        result = await db.execute(select(User).where(User.id == user_id))
        target_user = result.scalar_one_or_none()
        merged_from_user_id = None

        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

    # Step 4: Encrypt and save the token
    try:
        encrypted_token = encryption.encrypt(token)
    except Exception as e:
        logger.error("Failed to encrypt token for user %s: %s", target_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to encrypt token")

    # Step 5: Update user with GitHub info
    target_user.github_token_encrypted = encrypted_token
    target_user.github_username = github_username
    target_user.github_avatar_url = github_avatar_url

    try:
        await db.commit()
        await db.refresh(target_user)

        response = {
            "success": True,
            "message": "GitHub token saved successfully",
            "user_id": target_user.id,  # Return the actual user ID that was updated
            "github_username": target_user.github_username,
            "github_avatar_url": target_user.github_avatar_url
        }
        
        # If we merged to a different user, include that info
        if merged_from_user_id is not None:
            response["merged_from_user_id"] = merged_from_user_id
            response["message"] = f"GitHub account already linked to user {target_user.id}, token updated there"
            logger.info("Token saved for existing user %s (requested by user %s)", 
                       target_user.id, merged_from_user_id)
        
        return response
    except Exception as commit_error:
        await db.rollback()
        error_type = type(commit_error).__name__
        error_msg = str(commit_error)
        logger.error("Failed to commit token for user %s: [%s] %s", target_user.id, error_type, error_msg)
        
        # Provide more specific error messages
        if "UNIQUE constraint" in error_msg:
            raise HTTPException(status_code=409, detail=f"GitHub username already linked to another user: {error_msg}")
        elif "database is locked" in error_msg.lower():
            raise HTTPException(status_code=503, detail="Database is busy, please retry")
        else:
            raise HTTPException(status_code=500, detail=f"Database error: [{error_type}] {error_msg}")
