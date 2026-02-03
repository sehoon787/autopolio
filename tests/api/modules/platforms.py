"""
Platforms API module for testing.

Handles platform-specific templates (saramin, remember, jumpit, etc.)
"""

from typing import Optional
import httpx
from .base import BaseAPIModule


class PlatformsAPI(BaseAPIModule):
    """API module for platform template endpoints."""

    def list(self) -> httpx.Response:
        """
        List all platform templates.

        Returns:
            Response with list of platform templates
        """
        return self._get("/platforms")

    def get(self, platform_id: int) -> httpx.Response:
        """
        Get platform template by ID.

        Args:
            platform_id: Platform template ID

        Returns:
            Response with platform template data
        """
        return self._get(f"/platforms/{platform_id}")

    def init_system_templates(self) -> httpx.Response:
        """
        Initialize system platform templates.

        Returns:
            Response confirming initialization
        """
        return self._post("/platforms/init-system")

    def render(
        self,
        platform_id: int,
        user_data: dict
    ) -> httpx.Response:
        """
        Render platform template with user data.

        Args:
            platform_id: Platform template ID
            user_data: User data to render

        Returns:
            Response with rendered HTML
        """
        return self._post(f"/platforms/{platform_id}/render", json=user_data)

    def render_from_db(
        self,
        platform_id: int,
        user_id: int,
        use_sample: bool = False
    ) -> httpx.Response:
        """
        Render platform template with data from database.

        Args:
            platform_id: Platform template ID
            user_id: User ID to get data from
            use_sample: Whether to use sample data instead

        Returns:
            Response with rendered HTML
        """
        return self._post(f"/platforms/{platform_id}/render-from-db", json={
            "user_id": user_id,
            "use_sample": use_sample
        })

    def preview(
        self,
        platform_id: int,
        user_id: Optional[int] = None,
        use_sample: bool = True
    ) -> httpx.Response:
        """
        Get preview HTML for platform template.

        Args:
            platform_id: Platform template ID
            user_id: Optional user ID for real data
            use_sample: Whether to use sample data

        Returns:
            Response with preview HTML
        """
        data = {"use_sample": use_sample}
        if user_id:
            data["user_id"] = user_id

        return self._post(f"/platforms/{platform_id}/preview", json=data)

    def export_html(
        self,
        platform_id: int,
        user_id: Optional[int] = None,
        use_sample: bool = False
    ) -> httpx.Response:
        """
        Export platform template as HTML file.

        Args:
            platform_id: Platform template ID
            user_id: User ID for data
            use_sample: Whether to use sample data

        Returns:
            Response with HTML file
        """
        params = {"use_sample": use_sample}
        if user_id:
            params["user_id"] = user_id

        return self._get(f"/platforms/{platform_id}/export/html", params=params)

    def export_markdown(
        self,
        platform_id: int,
        user_id: Optional[int] = None,
        use_sample: bool = False
    ) -> httpx.Response:
        """
        Export platform template as Markdown file.

        Args:
            platform_id: Platform template ID
            user_id: User ID for data
            use_sample: Whether to use sample data

        Returns:
            Response with Markdown file
        """
        params = {"use_sample": use_sample}
        if user_id:
            params["user_id"] = user_id

        return self._get(f"/platforms/{platform_id}/export/md", params=params)

    def export_docx(
        self,
        platform_id: int,
        user_id: Optional[int] = None,
        use_sample: bool = False
    ) -> httpx.Response:
        """
        Export platform template as Word document.

        Args:
            platform_id: Platform template ID
            user_id: User ID for data
            use_sample: Whether to use sample data

        Returns:
            Response with DOCX file
        """
        params = {"use_sample": use_sample}
        if user_id:
            params["user_id"] = user_id

        return self._get(f"/platforms/{platform_id}/export/docx", params=params)
