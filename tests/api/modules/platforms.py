"""
Platforms API module for testing.

Handles platform-specific templates (saramin, remember, jumpit, etc.)
"""

from typing import Optional
import httpx
from .base import BaseAPIModule

# Minimal sample data for RenderDataRequest (required field: name)
_SAMPLE_RENDER_DATA = {
    "name": "Test User",
    "email": "test@example.com",
    "phone": "010-1234-5678",
    "projects": [
        {
            "name": "Sample Project",
            "description": "A sample project for testing",
            "role": "Developer",
            "technologies": ["Python", "React"]
        }
    ]
}


def _get_template_list(api: "PlatformsAPI"):
    """Helper: get template list from the API response.

    API returns {"templates": [...], "total": N}, not a plain list.
    Returns the list of templates or empty list on failure.
    """
    response = api.list()
    if response.status_code != 200:
        return []
    data = response.json()
    if isinstance(data, list):
        return data
    return data.get("templates", [])


class PlatformsAPI(BaseAPIModule):
    """API module for platform template endpoints."""

    def list(self, user_id: Optional[int] = None) -> httpx.Response:
        """
        List all platform templates.
        API returns: {"templates": [...], "total": N}
        """
        params = {}
        if user_id is not None:
            params["user_id"] = user_id
        return self._get("/platforms", params=params)

    def get(self, platform_id: int) -> httpx.Response:
        """Get platform template by ID."""
        return self._get(f"/platforms/{platform_id}")

    def init_system_templates(self) -> httpx.Response:
        """Initialize system platform templates (no-op, returns static templates)."""
        return self._post("/platforms/init-system")

    def render(
        self,
        platform_id: int,
        user_data: dict
    ) -> httpx.Response:
        """
        Render platform template with user data.
        Body must conform to RenderDataRequest schema (requires 'name' field).
        """
        return self._post(f"/platforms/{platform_id}/render", json=user_data)

    def render_from_db(
        self,
        platform_id: int,
        user_id: int
    ) -> httpx.Response:
        """
        Render platform template with data from database.
        This is a GET endpoint with user_id as query param.
        """
        return self._get(
            f"/platforms/{platform_id}/render-from-db",
            params={"user_id": user_id}
        )

    def preview(
        self,
        platform_id: int,
        use_sample: bool = True,
        render_data: Optional[dict] = None
    ) -> httpx.Response:
        """
        Get preview HTML for platform template.
        Body: PreviewRequest with 'use_sample_data' and optional 'data' fields.
        """
        body = {"use_sample_data": use_sample}
        if render_data is not None:
            body["data"] = render_data
        return self._post(f"/platforms/{platform_id}/preview", json=body)

    def export_from_db_html(
        self,
        platform_id: int,
        user_id: int
    ) -> httpx.Response:
        """Export platform template as HTML using DB data."""
        return self._post(
            f"/platforms/{platform_id}/export-from-db/html",
            params={"user_id": user_id}
        )

    def export_from_db_markdown(
        self,
        platform_id: int,
        user_id: int
    ) -> httpx.Response:
        """Export platform template as Markdown using DB data."""
        return self._post(
            f"/platforms/{platform_id}/export-from-db/md",
            params={"user_id": user_id}
        )

    def export_from_db_docx(
        self,
        platform_id: int,
        user_id: int
    ) -> httpx.Response:
        """Export platform template as Word doc using DB data."""
        return self._post(
            f"/platforms/{platform_id}/export-from-db/docx",
            params={"user_id": user_id}
        )

    def export_html(
        self,
        platform_id: int,
        render_data: Optional[dict] = None
    ) -> httpx.Response:
        """Export platform template as HTML with provided data."""
        data = render_data or _SAMPLE_RENDER_DATA
        return self._post(
            f"/platforms/{platform_id}/export/html",
            json={"data": data, "format": "html"}
        )

    def export_markdown(
        self,
        platform_id: int,
        render_data: Optional[dict] = None
    ) -> httpx.Response:
        """Export platform template as Markdown with provided data."""
        data = render_data or _SAMPLE_RENDER_DATA
        return self._post(
            f"/platforms/{platform_id}/export/md",
            json={"data": data, "format": "md"}
        )

    def export_docx(
        self,
        platform_id: int,
        render_data: Optional[dict] = None
    ) -> httpx.Response:
        """Export platform template as Word document with provided data."""
        data = render_data or _SAMPLE_RENDER_DATA
        return self._post(
            f"/platforms/{platform_id}/export/docx",
            json={"data": data, "format": "docx"}
        )
