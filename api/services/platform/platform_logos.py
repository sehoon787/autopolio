"""
Platform Logos - Load logos from JSON file for centralized management
These logos are used in HTML template rendering and frontend icons
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

# Get the logos file path
_LOGOS_FILE = (
    Path(__file__).parent.parent.parent
    / "data"
    / "platform_templates"
    / "logos"
    / "logos.json"
)

# Cache the logos with file mtime for auto-invalidation
_LOGOS_CACHE: Optional[Tuple[float, Dict[str, Any]]] = None


# Load logos from JSON file
def _load_logos() -> Dict[str, Any]:
    """Load logos from the centralized JSON file"""
    if _LOGOS_FILE.exists():
        with open(_LOGOS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def get_logos() -> Dict[str, Any]:
    """Get all logos (cached with auto-invalidation on file change)"""
    global _LOGOS_CACHE

    if not _LOGOS_FILE.exists():
        return {}

    current_mtime = _LOGOS_FILE.stat().st_mtime

    # Check if cache is valid (file hasn't changed)
    if _LOGOS_CACHE is not None:
        cached_mtime, cached_data = _LOGOS_CACHE
        if cached_mtime == current_mtime:
            return cached_data

    # Reload from file
    data = _load_logos()
    _LOGOS_CACHE = (current_mtime, data)
    return data


def get_platform_logo(platform_key: str) -> str:
    """Get the base64 logo for a platform"""
    logos = get_logos()
    platform = logos.get(platform_key, {})
    return platform.get("base64", "")


def get_platform_color(platform_key: str) -> str:
    """Get the background color for a platform icon"""
    logos = get_logos()
    platform = logos.get(platform_key, {})
    return platform.get("color", "#666666")


def get_platform_logo_svg(platform_key: str, size: int = 32, padding: int = 8) -> str:
    """Generate an SVG with the platform logo embedded

    Args:
        platform_key: The platform identifier
        size: The output SVG size
        padding: Padding around the logo image (default 8px for 48px viewBox)
    """
    logo = get_platform_logo(platform_key)
    color = get_platform_color(platform_key)

    if not logo:
        return ""

    # Calculate image dimensions based on padding
    img_size = 48 - (padding * 2)

    return f'''<svg width="{size}" height="{size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <rect width="48" height="48" rx="8" fill="{color}"/>
        <image xlink:href="{logo}" x="{padding}" y="{padding}" width="{img_size}" height="{img_size}" preserveAspectRatio="xMidYMid meet"/>
    </svg>'''
