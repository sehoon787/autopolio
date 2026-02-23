"""
Templates API module for testing.
"""

from typing import Optional, List
import httpx
from .base import BaseAPIModule


class TemplatesAPI(BaseAPIModule):
    """API module for template management endpoints."""

    def list(self, user_id: Optional[int] = None) -> httpx.Response:
        """
        List all templates.

        Args:
            user_id: Optional user ID to filter by

        Returns:
            Response with list of templates
        """
        params = {}
        if user_id:
            params["user_id"] = user_id
        return self._get("/templates", params=params)

    def create(
        self,
        user_id: int,
        name: str,
        platform: str = "custom",
        template_content: str = "",
        field_mappings: Optional[dict] = None,
        is_default: bool = False,
        **kwargs
    ) -> httpx.Response:
        """
        Create a new template.

        Args:
            user_id: User ID
            name: Template name
            platform: Platform type (saramin, wanted, remember, custom, etc.)
            template_content: Template content (Mustache syntax)
            field_mappings: Field mapping configuration
            is_default: Whether this is a default template
            **kwargs: Additional fields

        Returns:
            Response with created template
        """
        data = {
            "name": name,
            "platform": platform,
            "template_content": template_content,
            "is_default": is_default,
            **kwargs
        }
        if field_mappings:
            data["field_mappings"] = field_mappings

        return self._post("/templates", json=data, params={"user_id": user_id})

    def get(self, template_id: int) -> httpx.Response:
        """
        Get template by ID.

        Args:
            template_id: Template ID

        Returns:
            Response with template data
        """
        return self._get(f"/templates/{template_id}")

    def update(self, template_id: int, **kwargs) -> httpx.Response:
        """
        Update template data.

        Args:
            template_id: Template ID
            **kwargs: Fields to update

        Returns:
            Response with updated template
        """
        return self._put(f"/templates/{template_id}", json=kwargs)

    def delete(self, template_id: int) -> httpx.Response:
        """
        Delete a template.

        Args:
            template_id: Template ID

        Returns:
            Response confirming deletion
        """
        return self._delete(f"/templates/{template_id}")

    def clone(self, template_id: int, new_name: str, user_id: int = None) -> httpx.Response:
        """
        Clone a template with a new name.

        Args:
            template_id: Template ID to clone
            new_name: Name for the new template
            user_id: User ID (required by API)

        Returns:
            Response with cloned template
        """
        params = {"new_name": new_name}
        if user_id is not None:
            params["user_id"] = user_id
        return self._post(f"/templates/{template_id}/clone", params=params)

    def preview(
        self,
        template_content: str,
        user_id: int,
        project_ids: Optional[List[int]] = None
    ) -> httpx.Response:
        """
        Preview template with user data.

        Args:
            template_content: Template content to preview
            user_id: User ID for data
            project_ids: Optional list of project IDs to include

        Returns:
            Response with rendered preview
        """
        data = {
            "template_content": template_content,
            "user_id": user_id,
        }
        if project_ids:
            data["project_ids"] = project_ids

        return self._post("/templates/preview", json=data)

    def get_fields(self) -> httpx.Response:
        """
        Get list of available template fields.

        Returns:
            Response with available fields
        """
        return self._get("/templates/fields")

    def upload(
        self,
        user_id: int,
        file_content: bytes,
        filename: str,
        name: Optional[str] = None
    ) -> httpx.Response:
        """
        Upload a custom template file.

        Args:
            user_id: User ID
            file_content: File content bytes
            filename: Original filename
            name: Optional template name

        Returns:
            Response with created template
        """
        files = {"file": (filename, file_content)}
        data = {"user_id": user_id}
        if name:
            data["name"] = name

        return self._post("/templates/upload", files=files, data=data)
