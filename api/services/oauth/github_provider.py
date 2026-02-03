"""
GitHub OAuth Provider - Implements OAuth for GitHub
"""

import httpx
from urllib.parse import urlencode
from typing import Optional

from api.services.oauth.base import OAuthProvider, OAuthUserInfo


class GitHubOAuthProvider(OAuthProvider):
    """GitHub OAuth provider implementation"""

    provider_name = "github"

    AUTHORIZATION_URL = "https://github.com/login/oauth/authorize"
    TOKEN_URL = "https://github.com/login/oauth/access_token"
    USER_API_URL = "https://api.github.com/user"
    USER_EMAILS_URL = "https://api.github.com/user/emails"

    # Scopes we request
    SCOPES = ["repo", "read:user", "user:email"]

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret

    def get_authorization_url(self, state: str, redirect_uri: str) -> str:
        """Generate GitHub OAuth authorization URL"""
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(self.SCOPES),
            "state": state,
        }
        return f"{self.AUTHORIZATION_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> str:
        """Exchange authorization code for access token"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers={"Accept": "application/json"},
            )

            if response.status_code != 200:
                raise ValueError(f"Failed to exchange code: {response.text}")

            data = response.json()
            if "error" in data:
                raise ValueError(f"OAuth error: {data.get('error_description', data['error'])}")

            access_token = data.get("access_token")
            if not access_token:
                raise ValueError("No access token in response")

            return access_token

    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        """Get user information from GitHub API"""
        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            }

            # Get basic user info
            user_response = await client.get(self.USER_API_URL, headers=headers)
            if user_response.status_code != 200:
                raise ValueError(f"Failed to get user info: {user_response.text}")

            user_data = user_response.json()

            # Get primary email (might be private)
            email = user_data.get("email")
            if not email:
                emails_response = await client.get(self.USER_EMAILS_URL, headers=headers)
                if emails_response.status_code == 200:
                    emails = emails_response.json()
                    # Find primary verified email
                    for email_info in emails:
                        if email_info.get("primary") and email_info.get("verified"):
                            email = email_info.get("email")
                            break
                    # Fallback to first verified email
                    if not email:
                        for email_info in emails:
                            if email_info.get("verified"):
                                email = email_info.get("email")
                                break

            return OAuthUserInfo(
                provider_user_id=str(user_data["id"]),
                username=user_data.get("login", ""),
                email=email,
                avatar_url=user_data.get("avatar_url"),
                access_token=access_token,
                raw_data=user_data,
            )

    async def revoke_token(self, token: str) -> bool:
        """
        Revoke GitHub OAuth token

        Note: This requires the app to have the delete_repo scope or
        be a GitHub App. For OAuth Apps, tokens can be revoked through
        the user's GitHub settings.
        """
        # GitHub OAuth Apps don't have a simple token revocation endpoint
        # The user needs to revoke access through their GitHub settings
        # For GitHub Apps, we would use: DELETE /applications/{client_id}/token
        return True
