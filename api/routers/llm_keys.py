"""
LLM Keys Router - Electron-only endpoint for decrypted API key retrieval.

This router is conditionally registered only when AUTOPOLIO_RUNTIME=electron.
It exposes stored (decrypted) API keys so the Electron app can pass them
to CLI tools and LLM services.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.database import get_db
from api.models.user import User
from api.schemas.llm import StoredAPIKeysResponse
from api.services.core import EncryptionService

logger = logging.getLogger(__name__)

router = APIRouter()
encryption_service = EncryptionService()


@router.get("/keys", response_model=StoredAPIKeysResponse)
async def get_stored_keys(
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get stored (decrypted) API keys for a user. Only available in Electron runtime."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    openai_key = None
    anthropic_key = None
    gemini_key = None

    if user.openai_api_key_encrypted:
        try:
            openai_key = encryption_service.decrypt(user.openai_api_key_encrypted)
        except Exception as e:
            logger.warning("Failed to decrypt OpenAI key for user %d: %s", user_id, e)

    if user.anthropic_api_key_encrypted:
        try:
            anthropic_key = encryption_service.decrypt(user.anthropic_api_key_encrypted)
        except Exception as e:
            logger.warning(
                "Failed to decrypt Anthropic key for user %d: %s", user_id, e
            )

    if user.gemini_api_key_encrypted:
        try:
            gemini_key = encryption_service.decrypt(user.gemini_api_key_encrypted)
        except Exception as e:
            logger.warning("Failed to decrypt Gemini key for user %d: %s", user_id, e)

    return StoredAPIKeysResponse(
        openai_api_key=openai_key,
        anthropic_api_key=anthropic_key,
        gemini_api_key=gemini_key,
    )
