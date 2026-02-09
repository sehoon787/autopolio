"""
Platform Template Service - Manage platform-specific resume templates
Supports Saramin, Remember, Jumpit, and custom templates

This is a facade that composes functionality from:
- platform_template_crud.py: CRUD operations
- platform_template_init.py: System template initialization
- platform_template_rendering.py: Template rendering
- platform_template_export.py: Export to various formats
"""

import yaml
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.models.platform_template import PlatformTemplate
from api.schemas.platform import (
    PlatformTemplateCreate,
    PlatformTemplateUpdate,
    RenderDataRequest,
    PlatformInfo,
)
from api.config import get_settings
from api.services.template import TemplateRenderer
from api.services.template import TemplateExporter
from api.services.user_data import UserDataCollector

# Import sub-modules
from .platform_template_crud import PlatformTemplateCRUD
from .platform_template_init import PlatformTemplateInit
from .platform_template_rendering import PlatformTemplateRendering
from .platform_template_export import PlatformTemplateExport

settings = get_settings()


class PlatformTemplateService:
    """Service for managing platform-specific resume templates

    This is a facade that delegates to specialized sub-services:
    - CRUD operations
    - System template initialization
    - Template rendering
    - Export functionality
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.templates_dir = Path(settings.data_dir) / "platform_templates"
        self.config_dir = Path(settings.config_dir)
        self.result_dir = Path(settings.result_dir)

        # Initialize helper services
        self.renderer = TemplateRenderer()
        self.exporter = TemplateExporter(self.result_dir)
        self.data_collector = UserDataCollector(db)

        # Initialize sub-services
        self._crud = PlatformTemplateCRUD(db)
        self._init = PlatformTemplateInit(
            db, self.templates_dir, self.config_dir, self._crud
        )
        self._rendering = PlatformTemplateRendering(
            db, self._crud, self.renderer, self.exporter, self.data_collector
        )
        self._export = PlatformTemplateExport(
            db, self._crud, self._rendering, self.exporter, self.data_collector
        )

    # ==================== CRUD Operations ====================

    async def get_all(self, user_id: Optional[int] = None) -> List[PlatformTemplate]:
        """Get all platform templates (system + user's)"""
        return await self._crud.get_all(user_id)

    async def get_by_id(self, template_id: int) -> Optional[PlatformTemplate]:
        """Get a platform template by ID"""
        return await self._crud.get_by_id(template_id)

    async def get_by_platform_key(
        self, platform_key: str
    ) -> Optional[PlatformTemplate]:
        """Get a system platform template by platform key"""
        return await self._crud.get_by_platform_key(platform_key)

    async def create(
        self, data: PlatformTemplateCreate, user_id: Optional[int] = None
    ) -> PlatformTemplate:
        """Create a new platform template"""
        return await self._crud.create(data, user_id)

    async def update(
        self, template_id: int, data: PlatformTemplateUpdate
    ) -> Optional[PlatformTemplate]:
        """Update a platform template"""
        return await self._crud.update(template_id, data)

    async def delete(self, template_id: int) -> bool:
        """Delete a platform template"""
        return await self._crud.delete(template_id)

    # ==================== System Template Initialization ====================

    async def init_system_templates(
        self, force_update: bool = False
    ) -> List[PlatformTemplate]:
        """Initialize system templates from YAML config and HTML files

        Args:
            force_update: If True, update existing templates with latest HTML content
        """
        return await self._init.init_system_templates(force_update)

    async def refresh_system_templates(self) -> List[PlatformTemplate]:
        """Refresh system templates - update existing ones with new HTML from files"""
        return await self._init.refresh_system_templates()

    # ==================== Rendering ====================

    async def render_with_user_data(
        self, template_id: int, data: RenderDataRequest
    ) -> str:
        """
        Render a template with user-provided data

        Args:
            template_id: Platform template ID
            data: User data to render

        Returns:
            Rendered HTML string
        """
        return await self._rendering.render_with_user_data(template_id, data)

    async def render_with_sample_data(self, template_id: int) -> str:
        """
        Render a template with sample data for preview without connected projects

        Args:
            template_id: Platform template ID

        Returns:
            Rendered HTML string with sample data
        """
        return await self._rendering.render_with_sample_data(template_id)

    async def render_from_db(self, template_id: int, user_id: int) -> str:
        """
        Render a template with data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Rendered HTML string

        Raises:
            ValueError: If template not found, user not found, or no data available
        """
        return await self._rendering.render_from_db(template_id, user_id)

    async def render_markdown_from_db(self, template_id: int, user_id: int) -> str:
        """
        Render a template as Markdown with data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Rendered Markdown string
        """
        return await self._rendering.render_markdown_from_db(template_id, user_id)

    async def render_markdown_with_sample_data(self, template_id: int) -> str:
        """
        Render a template as Markdown with sample data for preview

        Args:
            template_id: Platform template ID

        Returns:
            Rendered Markdown string with sample data
        """
        return await self._rendering.render_markdown_with_sample_data(template_id)

    # ==================== Export Methods ====================

    async def export_from_db_to_html(
        self, template_id: int, user_id: int
    ) -> Tuple[str, str]:
        """
        Export to HTML file using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Tuple of (file_path, content)
        """
        return await self._export.export_from_db_to_html(template_id, user_id)

    async def export_from_db_to_markdown(
        self, template_id: int, user_id: int
    ) -> Tuple[str, str]:
        """
        Export to Markdown file using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Tuple of (file_path, content)
        """
        return await self._export.export_from_db_to_markdown(template_id, user_id)

    async def export_from_db_to_docx(self, template_id: int, user_id: int) -> str:
        """
        Export to Word document using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            File path to generated DOCX
        """
        return await self._export.export_from_db_to_docx(template_id, user_id)

    async def export_to_html(
        self, template_id: int, data: RenderDataRequest
    ) -> Tuple[str, str]:
        """
        Export rendered template to HTML file

        Args:
            template_id: Platform template ID
            data: User data to render

        Returns:
            Tuple of (file_path, content)
        """
        return await self._export.export_to_html(template_id, data)

    async def export_to_markdown(
        self, template_id: int, data: RenderDataRequest
    ) -> Tuple[str, str]:
        """
        Export to Markdown format

        Args:
            template_id: Platform template ID
            data: User data

        Returns:
            Tuple of (file_path, content)
        """
        return await self._export.export_to_markdown(template_id, data)

    async def export_to_docx(self, template_id: int, data: RenderDataRequest) -> str:
        """
        Export to Word document

        Args:
            template_id: Platform template ID
            data: User data

        Returns:
            File path to generated DOCX
        """
        return await self._export.export_to_docx(template_id, data)

    # ==================== Platform Info ====================

    def get_supported_platforms(self) -> List[PlatformInfo]:
        """Get list of supported platforms"""
        config_path = self.config_dir / "platform_field_mappings.yaml"
        if not config_path.exists():
            return []

        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)

        platforms = config.get("platforms", {})
        result = []

        for key, info in platforms.items():
            result.append(
                PlatformInfo(
                    key=key,
                    name=info.get("name", key),
                    name_en=info.get("name_en", key),
                    description=info.get("description", ""),
                    description_en=info.get("description_en", ""),
                    color=info.get("color", "#666"),
                    features=info.get("features", []),
                    template_available=True,
                )
            )

        return result

    def get_field_mappings(self) -> Dict[str, Any]:
        """Get field mappings configuration"""
        config_path = self.config_dir / "platform_field_mappings.yaml"
        if not config_path.exists():
            return {}

        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
