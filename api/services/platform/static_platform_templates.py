"""
Static Platform Template Provider

Loads system platform templates from YAML config + HTML files at runtime.
No database required - templates are always available from static files.
"""

import yaml
import logging
from typing import List, Optional, Dict
from datetime import datetime
from pathlib import Path

from api.models.platform_template import PlatformTemplate

logger = logging.getLogger(__name__)

# Stable IDs for system platform templates (won't conflict with DB autoincrement)
_SYSTEM_PLATFORM_IDS: Dict[str, int] = {
    "saramin": 9001,
    "remember": 9002,
    "jumpit": 9003,
    "wanted": 9004,
}

# In-memory cache
_cached_templates: Optional[List[PlatformTemplate]] = None
_cached_by_id: Optional[Dict[int, PlatformTemplate]] = None
_cached_by_key: Optional[Dict[str, PlatformTemplate]] = None


def _load_from_files(templates_dir: Path, config_dir: Path) -> List[PlatformTemplate]:
    """Load platform templates from YAML config and HTML files."""
    config_path = config_dir / "platform_field_mappings.yaml"
    if not config_path.exists():
        logger.warning(f"Platform config not found: {config_path}")
        return []

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    platforms = config.get("platforms", {})
    templates = []

    for platform_key, platform_config in platforms.items():
        template_file = platform_config.get("template_file")
        html_content = None

        if template_file:
            template_path = templates_dir / template_file
            if template_path.exists():
                with open(template_path, "r", encoding="utf-8") as f:
                    html_content = f.read()
            else:
                logger.warning(f"HTML template file not found: {template_path}")

        stable_id = _SYSTEM_PLATFORM_IDS.get(platform_key, 9000 + len(templates))
        now = datetime.utcnow()

        # Create a detached ORM object (not bound to any DB session)
        template = PlatformTemplate(
            id=stable_id,
            user_id=None,
            name=platform_config.get("name", platform_key),
            platform_key=platform_key,
            description=platform_config.get("description", ""),
            html_content=html_content,
            platform_color=platform_config.get("color"),
            features=platform_config.get("features", []),
            is_system=1,
            scrape_status="success" if html_content else "pending",
            created_at=now,
            updated_at=now,
        )
        templates.append(template)

    logger.info(f"Loaded {len(templates)} static platform templates from files")
    return templates


def _ensure_loaded(templates_dir: Path, config_dir: Path) -> None:
    """Ensure templates are loaded into cache."""
    global _cached_templates, _cached_by_id, _cached_by_key

    if _cached_templates is not None:
        return

    templates = _load_from_files(templates_dir, config_dir)
    _cached_templates = templates
    _cached_by_id = {t.id: t for t in templates}
    _cached_by_key = {t.platform_key: t for t in templates}


def get_static_platform_templates(
    templates_dir: Path, config_dir: Path
) -> List[PlatformTemplate]:
    """Get all system platform templates from static files."""
    _ensure_loaded(templates_dir, config_dir)
    return list(_cached_templates or [])


def get_static_platform_template_by_id(
    template_id: int, templates_dir: Path, config_dir: Path
) -> Optional[PlatformTemplate]:
    """Get a system platform template by its stable ID."""
    _ensure_loaded(templates_dir, config_dir)
    return (_cached_by_id or {}).get(template_id)


def get_static_platform_template_by_key(
    platform_key: str, templates_dir: Path, config_dir: Path
) -> Optional[PlatformTemplate]:
    """Get a system platform template by platform key."""
    _ensure_loaded(templates_dir, config_dir)
    return (_cached_by_key or {}).get(platform_key)


def is_static_platform_id(template_id: int) -> bool:
    """Check if a template ID belongs to a static system template."""
    return template_id in _SYSTEM_PLATFORM_IDS.values()


def invalidate_cache() -> None:
    """Clear the in-memory cache (e.g. after HTML file updates)."""
    global _cached_templates, _cached_by_id, _cached_by_key
    _cached_templates = None
    _cached_by_id = None
    _cached_by_key = None
