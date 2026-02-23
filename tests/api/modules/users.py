"""
Users API module for testing.
"""

from typing import Optional
import httpx
from .base import BaseAPIModule


class UsersAPI(BaseAPIModule):
    """API module for user management endpoints."""

    def create(self, name: str, email: str, **kwargs) -> httpx.Response:
        """
        Create a new user.

        Args:
            name: User's name
            email: User's email address
            **kwargs: Additional user fields

        Returns:
            Response with created user data
        """
        return self._post("/users", json={"name": name, "email": email, **kwargs})

    def get(self, user_id: int) -> httpx.Response:
        """
        Get user by ID.

        Args:
            user_id: User ID

        Returns:
            Response with user data
        """
        return self._get(f"/users/{user_id}")

    def update(self, user_id: int, **kwargs) -> httpx.Response:
        """
        Update user data.

        Args:
            user_id: User ID
            **kwargs: Fields to update

        Returns:
            Response with updated user data
        """
        return self._put(f"/users/{user_id}", json=kwargs)

    def delete(self, user_id: int) -> httpx.Response:
        """
        Delete a user.

        Args:
            user_id: User ID

        Returns:
            Response confirming deletion
        """
        return self._delete(f"/users/{user_id}")

    def get_or_create(self, email: str, name: Optional[str] = None) -> httpx.Response:
        """
        Get existing user by email or create new one.

        Args:
            email: User's email
            name: User's name (for creation)

        Returns:
            Response with user data
        """
        return self._post(
            "/users/get-or-create",
            json={"email": email, "name": name or email.split("@")[0]},
        )
