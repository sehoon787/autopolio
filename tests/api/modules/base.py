"""
Base API module class.

Provides common HTTP methods for API testing.
"""

from typing import Any, Optional
import httpx


class BaseAPIModule:
    """
    Base class for API test modules.

    Provides common HTTP methods with consistent error handling.
    """

    def __init__(self, client: httpx.Client):
        """
        Initialize the API module.

        Args:
            client: httpx.Client instance for making requests
        """
        self.client = client

    def _get(
        self,
        path: str,
        params: Optional[dict] = None,
        **kwargs: Any
    ) -> httpx.Response:
        """
        Make a GET request.

        Args:
            path: API endpoint path
            params: Query parameters
            **kwargs: Additional arguments for httpx

        Returns:
            httpx.Response object
        """
        return self.client.get(path, params=params, **kwargs)

    def _post(
        self,
        path: str,
        json: Optional[dict] = None,
        data: Optional[dict] = None,
        files: Optional[dict] = None,
        **kwargs: Any
    ) -> httpx.Response:
        """
        Make a POST request.

        Args:
            path: API endpoint path
            json: JSON body
            data: Form data
            files: Files to upload
            **kwargs: Additional arguments for httpx

        Returns:
            httpx.Response object
        """
        return self.client.post(path, json=json, data=data, files=files, **kwargs)

    def _put(
        self,
        path: str,
        json: Optional[dict] = None,
        **kwargs: Any
    ) -> httpx.Response:
        """
        Make a PUT request.

        Args:
            path: API endpoint path
            json: JSON body
            **kwargs: Additional arguments for httpx

        Returns:
            httpx.Response object
        """
        return self.client.put(path, json=json, **kwargs)

    def _patch(
        self,
        path: str,
        json: Optional[dict] = None,
        **kwargs: Any
    ) -> httpx.Response:
        """
        Make a PATCH request.

        Args:
            path: API endpoint path
            json: JSON body
            **kwargs: Additional arguments for httpx

        Returns:
            httpx.Response object
        """
        return self.client.patch(path, json=json, **kwargs)

    def _delete(self, path: str, **kwargs: Any) -> httpx.Response:
        """
        Make a DELETE request.

        Args:
            path: API endpoint path
            **kwargs: Additional arguments for httpx

        Returns:
            httpx.Response object
        """
        return self.client.delete(path, **kwargs)
