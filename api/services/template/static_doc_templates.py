"""
Static Document Template Provider

Loads system document templates from Python code definitions at runtime.
No database required - templates are always available from code.
"""

import logging
from typing import List, Optional, Dict
from datetime import datetime

from api.models.template import Template
from .system_templates import get_system_templates

logger = logging.getLogger(__name__)

# Stable IDs for system document templates (won't conflict with DB autoincrement)
_SYSTEM_DOC_IDS: Dict[str, int] = {
    "career_description": 9101,
    "career_description_no_personal": 9102,
    "resume": 9103,
    "notion": 9104,
}

# In-memory cache
_cached_templates: Optional[List[Template]] = None
_cached_by_id: Optional[Dict[int, Template]] = None
_cached_by_platform: Optional[Dict[str, Template]] = None


def _load_from_code() -> List[Template]:
    """Load document templates from Python code definitions."""
    definitions = get_system_templates()
    templates = []
    now = datetime.utcnow()

    for tmpl_data in definitions:
        platform = tmpl_data.get("platform", "")
        stable_id = _SYSTEM_DOC_IDS.get(platform, 9100 + len(templates))

        # Create a detached ORM object (not bound to any DB session)
        template = Template(
            id=stable_id,
            user_id=None,
            is_system=1,
            name=tmpl_data.get("name", ""),
            description=tmpl_data.get("description", ""),
            platform=platform,
            output_format=tmpl_data.get("output_format", "docx"),
            sections=tmpl_data.get("sections"),
            max_projects=tmpl_data.get("max_projects"),
            template_content=tmpl_data.get("template_content", ""),
            created_at=now,
            updated_at=now,
        )
        templates.append(template)

    logger.info(f"Loaded {len(templates)} static document templates from code")
    return templates


def _ensure_loaded() -> None:
    """Ensure templates are loaded into cache."""
    global _cached_templates, _cached_by_id, _cached_by_platform

    if _cached_templates is not None:
        return

    templates = _load_from_code()
    _cached_templates = templates
    _cached_by_id = {t.id: t for t in templates}
    _cached_by_platform = {t.platform: t for t in templates}


def get_static_doc_templates() -> List[Template]:
    """Get all system document templates from code definitions."""
    _ensure_loaded()
    return list(_cached_templates or [])


def get_static_doc_template_by_id(template_id: int) -> Optional[Template]:
    """Get a system document template by its stable ID."""
    _ensure_loaded()
    return (_cached_by_id or {}).get(template_id)


def get_static_doc_template_by_platform(platform: str) -> Optional[Template]:
    """Get a system document template by platform key."""
    _ensure_loaded()
    return (_cached_by_platform or {}).get(platform)


def is_static_doc_id(template_id: int) -> bool:
    """Check if a template ID belongs to a static system template."""
    return template_id in _SYSTEM_DOC_IDS.values()


def invalidate_cache() -> None:
    """Clear the in-memory cache."""
    global _cached_templates, _cached_by_id, _cached_by_platform
    _cached_templates = None
    _cached_by_id = None
    _cached_by_platform = None
