"""
OAuth Service - Business logic for managing OAuth identities
"""

import json
import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.user import User
from api.models.oauth_identity import OAuthIdentity
from api.services.core import EncryptionService
from api.services.oauth.base import OAuthUserInfo

logger = logging.getLogger(__name__)


class OAuthService:
    """Service for managing OAuth identities"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.encryption = EncryptionService()

    async def get_user_identities(self, user_id: int) -> List[OAuthIdentity]:
        """
        Get all OAuth identities for a user

        Args:
            user_id: User ID

        Returns:
            List of OAuthIdentity objects
        """
        result = await self.db.execute(
            select(OAuthIdentity)
            .where(OAuthIdentity.user_id == user_id)
            .order_by(OAuthIdentity.is_primary.desc(), OAuthIdentity.created_at)
        )
        return list(result.scalars().all())

    async def get_identity_by_provider(
        self, user_id: int, provider: str
    ) -> Optional[OAuthIdentity]:
        """
        Get a specific OAuth identity for a user by provider

        Args:
            user_id: User ID
            provider: Provider name (e.g., "github")

        Returns:
            OAuthIdentity if found, None otherwise
        """
        result = await self.db.execute(
            select(OAuthIdentity).where(
                and_(
                    OAuthIdentity.user_id == user_id, OAuthIdentity.provider == provider
                )
            )
        )
        return result.scalar_one_or_none()

    async def find_identity_by_provider_user(
        self, provider: str, provider_user_id: str
    ) -> Optional[OAuthIdentity]:
        """
        Find an OAuth identity by provider and provider user ID

        Args:
            provider: Provider name
            provider_user_id: User ID from the provider

        Returns:
            OAuthIdentity if found, None otherwise
        """
        result = await self.db.execute(
            select(OAuthIdentity)
            .options(selectinload(OAuthIdentity.user))
            .where(
                and_(
                    OAuthIdentity.provider == provider,
                    OAuthIdentity.provider_user_id == provider_user_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def create_or_update_identity(
        self, provider: str, user_info: OAuthUserInfo, user_id: Optional[int] = None
    ) -> tuple[OAuthIdentity, bool]:
        """
        Create or update an OAuth identity

        If user_id is provided, links the identity to that user.
        If not, looks for existing identity or creates a new user.

        Args:
            provider: Provider name
            user_info: User information from OAuth provider
            user_id: Optional user ID to link to

        Returns:
            Tuple of (OAuthIdentity, is_new_user)
        """
        is_new_user = False

        # Encrypt the access token
        encrypted_token = self.encryption.encrypt(user_info.access_token)
        encrypted_refresh = None
        if user_info.refresh_token:
            encrypted_refresh = self.encryption.encrypt(user_info.refresh_token)

        # Check if this provider identity already exists
        existing_identity = await self.find_identity_by_provider_user(
            provider, user_info.provider_user_id
        )

        if existing_identity:
            # Update existing identity
            existing_identity.username = user_info.username
            existing_identity.email = user_info.email
            existing_identity.avatar_url = user_info.avatar_url
            existing_identity.access_token_encrypted = encrypted_token
            existing_identity.refresh_token_encrypted = encrypted_refresh
            existing_identity.token_expires_at = user_info.token_expires_at
            existing_identity.raw_data = (
                json.dumps(user_info.raw_data) if user_info.raw_data else None
            )
            existing_identity.updated_at = datetime.utcnow()

            # If user_id was provided and different, we need to handle account linking
            if user_id and existing_identity.user_id != user_id:
                # This means the OAuth account was previously linked to a different user
                # For security, we don't automatically switch - the user must disconnect first
                logger.warning(
                    "[Security] OAuth account (provider=%s, provider_user_id=%s) already linked to user_id=%s, "
                    "attempted to link to user_id=%s",
                    provider,
                    user_info.provider_user_id,
                    existing_identity.user_id,
                    user_id,
                )
                # Return the existing identity - the user sees their existing account
                # They must disconnect first to link to a different user

            await self.db.flush()
            await self.db.refresh(existing_identity)

            # Also update the user's GitHub fields for backwards compatibility
            if provider == "github" and existing_identity.user:
                existing_identity.user.github_username = user_info.username
                existing_identity.user.github_avatar_url = user_info.avatar_url
                existing_identity.user.github_token_encrypted = encrypted_token

            return existing_identity, False

        # No existing identity - need to create one
        if user_id:
            # Link to existing user
            user_result = await self.db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if not user:
                raise ValueError(f"User {user_id} not found")
        else:
            # Check if we can find user by email
            user = None
            if user_info.email:
                user_result = await self.db.execute(
                    select(User).where(User.email == user_info.email)
                )
                user = user_result.scalar_one_or_none()

            # Or by github_username for backwards compatibility
            if not user and provider == "github":
                user_result = await self.db.execute(
                    select(User).where(User.github_username == user_info.username)
                )
                user = user_result.scalar_one_or_none()

            # Create new user if needed (with race condition handling)
            if not user:
                try:
                    user = User(
                        name=user_info.username or user_info.email or "User",
                        email=user_info.email,
                    )
                    self.db.add(user)
                    await self.db.flush()
                    is_new_user = True
                except IntegrityError:
                    # Race condition: another request created the user concurrently
                    logger.info(
                        "[OAuth] Race condition detected during user creation, re-fetching user"
                    )
                    await self.db.rollback()
                    # Re-fetch the user by email or username
                    if user_info.email:
                        user_result = await self.db.execute(
                            select(User).where(User.email == user_info.email)
                        )
                        user = user_result.scalar_one_or_none()
                    if not user and provider == "github":
                        user_result = await self.db.execute(
                            select(User).where(
                                User.github_username == user_info.username
                            )
                        )
                        user = user_result.scalar_one_or_none()
                    if not user:
                        raise ValueError(
                            "Could not find or create user after race condition"
                        )

        # Check if this is the user's first identity (make it primary)
        existing_identities = await self.get_user_identities(user.id)
        is_primary = len(existing_identities) == 0

        # Create the identity (with race condition handling)
        try:
            identity = OAuthIdentity(
                user_id=user.id,
                provider=provider,
                provider_user_id=user_info.provider_user_id,
                username=user_info.username,
                email=user_info.email,
                avatar_url=user_info.avatar_url,
                access_token_encrypted=encrypted_token,
                refresh_token_encrypted=encrypted_refresh,
                token_expires_at=user_info.token_expires_at,
                is_primary=is_primary,
                raw_data=json.dumps(user_info.raw_data) if user_info.raw_data else None,
            )
            self.db.add(identity)
            await self.db.flush()
            await self.db.refresh(identity)
        except IntegrityError:
            # Race condition: identity was created by another request
            logger.info(
                "[OAuth] Race condition detected during identity creation, re-fetching identity"
            )
            await self.db.rollback()
            existing_identity = await self.find_identity_by_provider_user(
                provider, user_info.provider_user_id
            )
            if existing_identity:
                # Update and return the existing identity
                existing_identity.access_token_encrypted = encrypted_token
                existing_identity.refresh_token_encrypted = encrypted_refresh
                existing_identity.updated_at = datetime.utcnow()
                await self.db.flush()
                return existing_identity, False
            raise ValueError(
                "Could not find or create OAuth identity after race condition"
            )

        # Update user's GitHub fields for backwards compatibility
        if provider == "github":
            user.github_username = user_info.username
            user.github_avatar_url = user_info.avatar_url
            user.github_token_encrypted = encrypted_token

        return identity, is_new_user

    async def remove_identity(self, user_id: int, provider: str) -> bool:
        """
        Remove an OAuth identity from a user

        Args:
            user_id: User ID
            provider: Provider name

        Returns:
            True if removed, False if not found
        """
        identity = await self.get_identity_by_provider(user_id, provider)
        if not identity:
            return False

        # If this was the primary identity, set another one as primary
        if identity.is_primary:
            other_identities = await self.get_user_identities(user_id)
            for other in other_identities:
                if other.id != identity.id:
                    other.is_primary = True
                    break

        # Clear GitHub token but KEEP username/avatar for user identification
        # When user reconnects, we need github_username to find their existing account
        if provider == "github":
            user_result = await self.db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if user:
                # Only clear the token (authentication)
                # Keep github_username and github_avatar_url for identification
                user.github_token_encrypted = None

        await self.db.delete(identity)
        return True

    async def set_primary_identity(self, user_id: int, provider: str) -> bool:
        """
        Set an OAuth identity as the primary login method

        Args:
            user_id: User ID
            provider: Provider name

        Returns:
            True if successful, False if identity not found
        """
        identity = await self.get_identity_by_provider(user_id, provider)
        if not identity:
            return False

        # Clear primary from all other identities
        identities = await self.get_user_identities(user_id)
        for ident in identities:
            ident.is_primary = ident.id == identity.id

        return True

    def get_access_token(self, identity: OAuthIdentity) -> str:
        """
        Decrypt and return the access token for an identity

        Args:
            identity: OAuthIdentity object

        Returns:
            Decrypted access token
        """
        if not identity.access_token_encrypted:
            raise ValueError("No access token stored")
        return self.encryption.decrypt(identity.access_token_encrypted)

    async def get_github_token(self, user_id: int) -> Optional[str]:
        """
        Get GitHub access token for a user (backwards compatibility helper)

        Args:
            user_id: User ID

        Returns:
            Decrypted GitHub access token or None
        """
        identity = await self.get_identity_by_provider(user_id, "github")
        if identity and identity.access_token_encrypted:
            return self.encryption.decrypt(identity.access_token_encrypted)

        # Fall back to user's github_token_encrypted for backwards compatibility
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user and user.github_token_encrypted:
            return self.encryption.decrypt(user.github_token_encrypted)

        return None
