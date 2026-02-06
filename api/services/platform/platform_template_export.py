"""
Platform Template Export

Handles exporting templates to various formats (HTML, Markdown, DOCX).
"""

from typing import Tuple
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas.platform import RenderDataRequest
from api.services.template import TemplateExporter
from api.services.user_data import UserDataCollector
from .platform_template_crud import PlatformTemplateCRUD
from .platform_template_rendering import PlatformTemplateRendering


class PlatformTemplateExport:
    """Handles template export operations"""

    def __init__(
        self,
        db: AsyncSession,
        crud: PlatformTemplateCRUD,
        rendering: PlatformTemplateRendering,
        exporter: TemplateExporter,
        data_collector: UserDataCollector
    ):
        self.db = db
        self.crud = crud
        self.rendering = rendering
        self.exporter = exporter
        self.data_collector = data_collector

    async def export_from_db_to_html(
        self,
        template_id: int,
        user_id: int
    ) -> Tuple[str, str]:
        """
        Export to HTML file using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Tuple of (file_path, content)
        """
        html_content = await self.rendering.render_from_db(template_id, user_id)
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        data = await self.data_collector.collect(user_id)
        return self.exporter.export_html(html_content, template.platform_key, data.get("name", "user"))

    async def export_from_db_to_markdown(
        self,
        template_id: int,
        user_id: int
    ) -> Tuple[str, str]:
        """
        Export to Markdown file using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Tuple of (file_path, content)
        """
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        data = await self.data_collector.collect(user_id)
        return self.exporter.export_markdown_from_dict(data, template.platform_key, template.name)

    async def export_from_db_to_docx(
        self,
        template_id: int,
        user_id: int
    ) -> str:
        """
        Export to Word document using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            File path to generated DOCX
        """
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        data = await self.data_collector.collect(user_id)
        return self.exporter.export_docx_from_dict(data, template.platform_key)

    async def export_to_html(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> Tuple[str, str]:
        """
        Export rendered template to HTML file

        Args:
            template_id: Platform template ID
            data: User data to render

        Returns:
            Tuple of (file_path, content)
        """
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        html_content = await self.rendering.render_with_user_data(template_id, data)
        return self.exporter.export_html(html_content, template.platform_key, data.name)

    async def export_to_markdown(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> Tuple[str, str]:
        """
        Export to Markdown format

        Args:
            template_id: Platform template ID
            data: User data

        Returns:
            Tuple of (file_path, content)
        """
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        return self.exporter.export_markdown(data, template.platform_key, template.name)

    async def export_to_docx(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> str:
        """
        Export to Word document

        Args:
            template_id: Platform template ID
            data: User data

        Returns:
            File path to generated DOCX
        """
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        return self.exporter.export_docx(data, template.platform_key)
