"""
OAuth Services Module - Provides OAuth provider abstraction and services
"""

from api.services.oauth.base import OAuthProvider, OAuthUserInfo
from api.services.oauth.github_provider import GitHubOAuthProvider
from api.services.oauth.factory import OAuthProviderFactory

__all__ = [
    "OAuthProvider",
    "OAuthUserInfo",
    "GitHubOAuthProvider",
    "OAuthProviderFactory",
]
