"""
Profile Service - Manages user profile with OAuth default fallback
"""

import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.user import User
from api.models.oauth_identity import OAuthIdentity
from api.schemas.user import (
    OAuthDefaults,
    UserProfileUpdate,
    UserProfileResponse,
)


class ProfileService:
    """Service for managing user profile with OAuth default values"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_oauth_defaults(self, user_id: int) -> OAuthDefaults:
        """Extract default values from primary OAuth identity"""
        # Find primary OAuth identity
        result = await self.db.execute(
            select(OAuthIdentity)
            .where(OAuthIdentity.user_id == user_id)
            .where(OAuthIdentity.is_primary == True)
        )
        primary_identity = result.scalar_one_or_none()

        # If no primary, try to get any identity
        if not primary_identity:
            result = await self.db.execute(
                select(OAuthIdentity)
                .where(OAuthIdentity.user_id == user_id)
                .order_by(OAuthIdentity.created_at.asc())
                .limit(1)
            )
            primary_identity = result.scalar_one_or_none()

        # Get user for fallback values
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()

        if not user:
            return OAuthDefaults()

        # Build defaults from OAuth identity or user record
        name = None
        email = None
        avatar_url = None

        if primary_identity:
            # Try to get name from raw_data first
            if primary_identity.raw_data:
                try:
                    raw_data = json.loads(primary_identity.raw_data)
                    name = raw_data.get("name") or raw_data.get("login")
                except (json.JSONDecodeError, TypeError):
                    pass

            # Use username if name not in raw_data
            if not name:
                name = primary_identity.username

            email = primary_identity.email
            avatar_url = primary_identity.avatar_url

        # Fallback to user record
        if not name:
            name = user.name
        if not email:
            email = user.email
        if not avatar_url:
            avatar_url = user.github_avatar_url

        return OAuthDefaults(
            name=name,
            email=email,
            avatar_url=avatar_url,
        )

    async def get_profile(self, user_id: int) -> UserProfileResponse:
        """Get user profile with effective values calculated"""
        # Get user
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise ValueError(f"User {user_id} not found")

        # Get OAuth defaults
        oauth_defaults = await self.get_oauth_defaults(user_id)

        # Calculate effective values
        # Rule: user value if not None and not "", otherwise OAuth default
        effective_name = self._get_effective_value(
            user.display_name,
            oauth_defaults.name or user.name
        )
        effective_email = self._get_effective_value(
            user.profile_email,
            oauth_defaults.email
        )
        effective_avatar_url = oauth_defaults.avatar_url  # Avatar always from OAuth

        # Profile photo: use uploaded photo if available, otherwise OAuth avatar
        profile_photo_url = getattr(user, 'profile_photo_url', None)
        effective_photo_url = profile_photo_url if profile_photo_url else oauth_defaults.avatar_url

        return UserProfileResponse(
            # User values (can be None or "")
            display_name=user.display_name,
            profile_email=user.profile_email,
            phone=user.phone,
            address=user.address,
            birthdate=user.birthdate,
            profile_photo_url=profile_photo_url,
            # OAuth defaults
            oauth_defaults=oauth_defaults,
            # Effective values
            effective_name=effective_name,
            effective_email=effective_email,
            effective_avatar_url=effective_avatar_url,
            effective_photo_url=effective_photo_url,
        )

    async def update_profile(
        self,
        user_id: int,
        data: UserProfileUpdate
    ) -> UserProfileResponse:
        """Update user profile

        Field behavior:
        - Field not in request (None): keep current value
        - Field is "" (empty string): user intentionally cleared, store ""
        - Field has value: update to new value
        """
        # Get user
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise ValueError(f"User {user_id} not found")

        # Update only fields that were explicitly provided
        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            setattr(user, field, value)

        await self.db.flush()
        await self.db.refresh(user)

        # Return updated profile
        return await self.get_profile(user_id)

    def _get_effective_value(
        self,
        user_value: Optional[str],
        oauth_value: Optional[str]
    ) -> Optional[str]:
        """Get effective value: user value if set (not None), otherwise OAuth default

        Note: Empty string "" means user intentionally cleared, so we use ""
        """
        if user_value is not None:
            return user_value
        return oauth_value
