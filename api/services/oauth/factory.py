"""
OAuth Provider Factory - Creates and manages OAuth provider instances
"""

import os
from typing import Dict, List, Type, Optional

from api.services.oauth.base import OAuthProvider
from api.services.oauth.github_provider import GitHubOAuthProvider


class OAuthProviderFactory:
    """Factory for creating OAuth provider instances"""

    # Registry of available providers
    _providers: Dict[str, Type[OAuthProvider]] = {
        "github": GitHubOAuthProvider,
        # Future providers:
        # "google": GoogleOAuthProvider,
        # "apple": AppleOAuthProvider,
        # "naver": NaverOAuthProvider,
        # "kakao": KakaoOAuthProvider,
    }

    # Environment variable mappings for each provider
    _env_mappings: Dict[str, Dict[str, str]] = {
        "github": {
            "client_id": "GITHUB_CLIENT_ID",
            "client_secret": "GITHUB_CLIENT_SECRET",
        },
        # Future providers:
        # "google": {
        #     "client_id": "GOOGLE_CLIENT_ID",
        #     "client_secret": "GOOGLE_CLIENT_SECRET",
        # },
        # "apple": {
        #     "client_id": "APPLE_CLIENT_ID",
        #     "team_id": "APPLE_TEAM_ID",
        #     "key_id": "APPLE_KEY_ID",
        #     "private_key": "APPLE_PRIVATE_KEY",
        # },
        # "naver": {
        #     "client_id": "NAVER_CLIENT_ID",
        #     "client_secret": "NAVER_CLIENT_SECRET",
        # },
        # "kakao": {
        #     "client_id": "KAKAO_CLIENT_ID",
        #     "client_secret": "KAKAO_CLIENT_SECRET",
        # },
    }

    @classmethod
    def get_provider(cls, provider_name: str) -> OAuthProvider:
        """
        Get an OAuth provider instance

        Args:
            provider_name: Name of the provider (e.g., "github")

        Returns:
            Configured OAuthProvider instance

        Raises:
            ValueError: If provider is not supported or not configured
        """
        if provider_name not in cls._providers:
            raise ValueError(f"Unsupported OAuth provider: {provider_name}")

        # Get environment variable mappings
        env_mappings = cls._env_mappings.get(provider_name, {})

        # Load credentials from environment
        credentials = {}
        for key, env_var in env_mappings.items():
            value = os.getenv(env_var)
            if not value:
                raise ValueError(f"OAuth provider {provider_name} not configured: {env_var} not set")
            credentials[key] = value

        # Create provider instance
        provider_class = cls._providers[provider_name]
        return provider_class(**credentials)

    @classmethod
    def is_provider_configured(cls, provider_name: str) -> bool:
        """
        Check if a provider is properly configured

        Args:
            provider_name: Name of the provider

        Returns:
            True if all required environment variables are set
        """
        if provider_name not in cls._providers:
            return False

        env_mappings = cls._env_mappings.get(provider_name, {})
        for env_var in env_mappings.values():
            if not os.getenv(env_var):
                return False

        return True

    @classmethod
    def get_available_providers(cls) -> List[str]:
        """
        Get list of providers that are properly configured

        Returns:
            List of provider names that have all credentials configured
        """
        return [name for name in cls._providers.keys() if cls.is_provider_configured(name)]

    @classmethod
    def get_all_providers(cls) -> List[str]:
        """
        Get list of all supported providers (whether configured or not)

        Returns:
            List of all supported provider names
        """
        return list(cls._providers.keys())

    @classmethod
    def get_provider_info(cls) -> List[Dict]:
        """
        Get information about all providers including their configuration status

        Returns:
            List of dicts with provider info
        """
        providers = []
        for name in cls._providers.keys():
            providers.append({
                "name": name,
                "configured": cls.is_provider_configured(name),
                "display_name": name.title(),
            })
        return providers
