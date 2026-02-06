"""
Platform Template CRUD Operations

Handles Create, Read, Update, Delete operations for platform templates.
"""

from typing import List, Optional
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.platform_template import PlatformTemplate
from api.schemas.platform import (
    PlatformTemplateCreate,
    PlatformTemplateUpdate,
)


class PlatformTemplateCRUD:
    """CRUD operations for platform templates"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all(self, user_id: Optional[int] = None) -> List[PlatformTemplate]:
        """Get all platform templates (system + user's)"""
        query = select(PlatformTemplate).where(
            (PlatformTemplate.is_system == 1) |
            (PlatformTemplate.user_id == user_id) if user_id else
            (PlatformTemplate.is_system == 1)
        ).order_by(PlatformTemplate.is_system.desc(), PlatformTemplate.created_at)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_id(self, template_id: int) -> Optional[PlatformTemplate]:
        """Get a platform template by ID"""
        result = await self.db.execute(
            select(PlatformTemplate).where(PlatformTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def get_by_platform_key(self, platform_key: str) -> Optional[PlatformTemplate]:
        """Get a system platform template by platform key"""
        result = await self.db.execute(
            select(PlatformTemplate).where(
                PlatformTemplate.platform_key == platform_key,
                PlatformTemplate.is_system == 1
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        data: PlatformTemplateCreate,
        user_id: Optional[int] = None
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
        self,
        template_id: int,
        data: PlatformTemplateUpdate
    ) -> Optional[PlatformTemplate]:
        """Update a platform template"""
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
        """Delete a platform template"""
        template = await self.get_by_id(template_id)
        if not template:
            return False

        # Don't allow deleting system templates
        if template.is_system:
            return False

        await self.db.delete(template)
        return True
