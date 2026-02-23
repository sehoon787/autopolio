"""
OAuth Provider Base Class - Abstract interface for OAuth providers
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class OAuthUserInfo:
    """User information returned from OAuth provider"""

    provider_user_id: str
    username: str
    email: Optional[str]
    avatar_url: Optional[str]
    access_token: str
    refresh_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    raw_data: Optional[dict] = None  # Full provider response for debugging


class OAuthProvider(ABC):
    """Abstract base class for OAuth providers"""

    provider_name: str  # e.g., "github", "google", "apple"

    @abstractmethod
    def get_authorization_url(self, state: str, redirect_uri: str) -> str:
        """
        Generate OAuth authorization URL

        Args:
            state: State parameter for CSRF protection (should include user_id if linking)
            redirect_uri: URL to redirect to after authorization

        Returns:
            Full authorization URL to redirect user to
        """
        pass

    @abstractmethod
    async def exchange_code(self, code: str, redirect_uri: str) -> str:
        """
        Exchange authorization code for access token

        Args:
            code: Authorization code from callback
            redirect_uri: Same redirect URI used in authorization

        Returns:
            Access token

        Raises:
            ValueError: If exchange fails
        """
        pass

    @abstractmethod
    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        """
        Get user information from provider using access token

        Args:
            access_token: OAuth access token

        Returns:
            OAuthUserInfo with user details

        Raises:
            ValueError: If fetching user info fails
        """
        pass

    async def refresh_access_token(
        self, refresh_token: str
    ) -> tuple[str, Optional[str], Optional[datetime]]:
        """
        Refresh access token using refresh token (optional, not all providers support this)

        Args:
            refresh_token: OAuth refresh token

        Returns:
            Tuple of (new_access_token, new_refresh_token, expires_at)

        Raises:
            NotImplementedError: If provider doesn't support refresh
            ValueError: If refresh fails
        """
        raise NotImplementedError(
            f"{self.provider_name} does not support token refresh"
        )

    async def revoke_token(self, token: str) -> bool:
        """
        Revoke an access token (optional, not all providers support this)

        Args:
            token: Token to revoke

        Returns:
            True if revocation was successful

        Raises:
            NotImplementedError: If provider doesn't support revocation
        """
        raise NotImplementedError(
            f"{self.provider_name} does not support token revocation"
        )
