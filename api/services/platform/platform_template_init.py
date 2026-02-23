"""
Platform Template Initialization

Handles system template initialization and refresh from config files.
"""

import yaml
from typing import List, Dict, Any, Tuple
from datetime import datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.models.platform_template import PlatformTemplate
from .platform_template_crud import PlatformTemplateCRUD


class PlatformTemplateInit:
    """Handles system template initialization from config files"""

    def __init__(
        self,
        db: AsyncSession,
        templates_dir: Path,
        config_dir: Path,
        crud: PlatformTemplateCRUD,
    ):
        self.db = db
        self.templates_dir = templates_dir
        self.config_dir = config_dir
        self.crud = crud

    async def _load_templates_from_config(
        self,
    ) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """Load platform config and HTML templates from files

        Returns:
            Tuple of (platforms_config, html_contents)
        """
        config_path = self.config_dir / "platform_field_mappings.yaml"
        if not config_path.exists():
            return {}, {}

        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)

        platforms = config.get("platforms", {})
        html_contents = {}

        for platform_key, platform_config in platforms.items():
            template_file = platform_config.get("template_file")
            if template_file:
                template_path = self.templates_dir / template_file
                if template_path.exists():
                    with open(template_path, "r", encoding="utf-8") as f:
                        html_contents[platform_key] = f.read()

        return platforms, html_contents

    async def init_system_templates(
        self, force_update: bool = False
    ) -> List[PlatformTemplate]:
        """Initialize system templates from YAML config and HTML files

        Args:
            force_update: If True, update existing templates with latest HTML content
        """
        created_templates = []
        updated_templates = []

        platforms, html_contents = await self._load_templates_from_config()
        if not platforms:
            return created_templates

        for platform_key, platform_config in platforms.items():
            html_content = html_contents.get(platform_key)

            # Check if template already exists
            existing = await self.crud.get_by_platform_key(platform_key)
            if existing:
                if force_update and html_content:
                    # Update existing template with latest HTML
                    existing.html_content = html_content
                    existing.updated_at = datetime.utcnow()
                    updated_templates.append(existing)
                continue

            # Create system template
            template = PlatformTemplate(
                user_id=None,  # System template
                name=platform_config.get("name", platform_key),
                platform_key=platform_key,
                description=platform_config.get("description", ""),
                html_content=html_content,
                platform_color=platform_config.get("color"),
                features=platform_config.get("features", []),
                is_system=1,
                scrape_status="success" if html_content else "pending",
            )
            self.db.add(template)
            created_templates.append(template)

        if created_templates or updated_templates:
            await self.db.flush()
            for template in created_templates + updated_templates:
                await self.db.refresh(template)

        return created_templates + updated_templates

    async def refresh_system_templates(self) -> List[PlatformTemplate]:
        """Refresh system templates - update existing ones with new HTML from files"""
        updated_templates = []

        platforms, html_contents = await self._load_templates_from_config()
        if not platforms:
            return updated_templates

        for platform_key, platform_config in platforms.items():
            html_content = html_contents.get(platform_key)

            # Check if template already exists
            existing = await self.crud.get_by_platform_key(platform_key)
            if existing:
                # Update existing template
                existing.name = platform_config.get("name", platform_key)
                existing.description = platform_config.get("description", "")
                existing.html_content = html_content
                existing.platform_color = platform_config.get("color")
                existing.features = platform_config.get("features", [])
                existing.scrape_status = "success" if html_content else "pending"
                updated_templates.append(existing)
            else:
                # Create new template
                template = PlatformTemplate(
                    user_id=None,
                    name=platform_config.get("name", platform_key),
                    platform_key=platform_key,
                    description=platform_config.get("description", ""),
                    html_content=html_content,
                    platform_color=platform_config.get("color"),
                    features=platform_config.get("features", []),
                    is_system=1,
                    scrape_status="success" if html_content else "pending",
                )
                self.db.add(template)
                updated_templates.append(template)

        if updated_templates:
            await self.db.flush()
            for template in updated_templates:
                await self.db.refresh(template)

        return updated_templates
