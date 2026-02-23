"""
Platform Template CRUD Operations

Handles Create, Read, Update, Delete operations for platform templates.
System templates are loaded from static files (no DB).
User templates are stored in DB.
"""

from typing import List, Optional
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.platform_template import PlatformTemplate
from api.schemas.platform import (
    PlatformTemplateCreate,
    PlatformTemplateUpdate,
)
from .static_platform_templates import (
    get_static_platform_templates,
    get_static_platform_template_by_id,
    get_static_platform_template_by_key,
    is_static_platform_id,
)


class PlatformTemplateCRUD:
    """CRUD operations for platform templates"""

    def __init__(
        self, db: AsyncSession, templates_dir: Path = None, config_dir: Path = None
    ):
        self.db = db
        # Dirs needed for static template loading
        self._templates_dir = templates_dir
        self._config_dir = config_dir

    def _get_dirs(self):
        """Get template/config dirs, falling back to settings if not provided."""
        if self._templates_dir and self._config_dir:
            return self._templates_dir, self._config_dir
        from api.config import get_settings

        settings = get_settings()
        return Path(settings.platform_templates_dir), Path(settings.config_dir)

    async def get_all(self, user_id: Optional[int] = None) -> List[PlatformTemplate]:
        """Get all platform templates (static system + DB user templates)"""
        templates_dir, config_dir = self._get_dirs()

        # Static system templates (always available)
        system_templates = get_static_platform_templates(templates_dir, config_dir)

        # User templates from DB
        if user_id:
            query = (
                select(PlatformTemplate)
                .where(
                    PlatformTemplate.user_id == user_id,
                    PlatformTemplate.is_system == 0,
                )
                .order_by(PlatformTemplate.created_at)
            )
            result = await self.db.execute(query)
            user_templates = list(result.scalars().all())
        else:
            user_templates = []

        return system_templates + user_templates

    async def get_by_id(self, template_id: int) -> Optional[PlatformTemplate]:
        """Get a platform template by ID (checks static first, then DB)"""
        templates_dir, config_dir = self._get_dirs()

        # Check static system templates first
        if is_static_platform_id(template_id):
            return get_static_platform_template_by_id(
                template_id, templates_dir, config_dir
            )

        # Fall back to DB
        result = await self.db.execute(
            select(PlatformTemplate).where(PlatformTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def get_by_platform_key(
        self, platform_key: str
    ) -> Optional[PlatformTemplate]:
        """Get a system platform template by platform key"""
        templates_dir, config_dir = self._get_dirs()

        # Check static first
        static = get_static_platform_template_by_key(
            platform_key, templates_dir, config_dir
        )
        if static:
            return static

        # Fall back to DB (legacy)
        result = await self.db.execute(
            select(PlatformTemplate).where(
                PlatformTemplate.platform_key == platform_key,
                PlatformTemplate.is_system == 1,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self, data: PlatformTemplateCreate, user_id: Optional[int] = None
    ) -> PlatformTemplate:
        """Create a new platform template"""
        template = PlatformTemplate(
            user_id=user_id,
            name=data.name,
            platform_key=data.platform_key,
            description=data.description,
            page_url=data.page_url,
            html_content=data.html_content,
            css_content=data.css_content,
            field_mappings=data.field_mappings,
            selectors=data.selectors,
            platform_color=data.platform_color,
            features=data.features,
            is_system=0,  # User-created templates are not system templates
        )
        self.db.add(template)
        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def update(
        self, template_id: int, data: PlatformTemplateUpdate
    ) -> Optional[PlatformTemplate]:
        """Update a platform template (only user templates)"""
        if is_static_platform_id(template_id):
            return None  # Can't update static system templates

        template = await self.get_by_id(template_id)
        if not template:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(template, field, value)

        template.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def delete(self, template_id: int) -> bool:
        """Delete a platform template (only user templates)"""
        if is_static_platform_id(template_id):
            return False  # Can't delete static system templates

        template = await self.get_by_id(template_id)
        if not template:
            return False

        if template.is_system:
            return False

        await self.db.delete(template)
        return True
