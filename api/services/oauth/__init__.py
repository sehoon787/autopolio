"""
OAuth Services Module - Provides OAuth provider abstraction and services
"""

from .base import OAuthProvider, OAuthUserInfo
from .github_provider import GitHubOAuthProvider
from .factory import OAuthProviderFactory
from .oauth_service import OAuthService

__all__ = [
    "OAuthProvider",
    "OAuthUserInfo",
    "GitHubOAuthProvider",
    "OAuthProviderFactory",
    "OAuthService",
]
