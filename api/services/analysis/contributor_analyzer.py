"""
Contributor Analysis Module - Handles contributor-specific analysis functions.

Extracted from github_service.py in v1.12 refactoring.

This module contains:
- Conventional Commit parsing
- Work area detection
- File extension analysis
- Technology detection from files
"""

import re
import logging
from typing import Dict, List, Any
from collections import Counter

from api.services.github.github_constants import (
    WORK_AREA_PATTERNS,
    COMMIT_TYPES,
    EXT_TECH_MAP,
    PATH_TECH_MAP,
)

logger = logging.getLogger(__name__)


def parse_conventional_commit(message: str) -> Dict[str, Any]:
    """Parse Conventional Commit message format.

    Examples:
        "feat(auth): add login API" -> {"type": "feat", "scope": "auth", "description": "add login API"}
        "fix: resolve memory leak" -> {"type": "fix", "scope": None, "description": "resolve memory leak"}
        "Update readme" -> {"type": "other", "scope": None, "description": "Update readme"}

    Args:
        message: Git commit message

    Returns:
        Dict with type, type_label, scope, description, is_breaking
    """
    # Conventional commit pattern: type(scope)!?: description
    # The ! indicates breaking change
    pattern = r'^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$'
    match = re.match(pattern, message.split('\n')[0].strip())

    if match:
        commit_type = match.group(1).lower()
        scope = match.group(2)
        is_breaking = match.group(3) is not None
        description = match.group(4)

        # Normalize commit type
        if commit_type not in COMMIT_TYPES:
            # Try to match common variations
            type_mappings = {
                "feature": "feat",
                "bugfix": "fix",
                "hotfix": "fix",
                "ref": "refactor",
                "doc": "docs",
                "tests": "test",
                "testing": "test",
                "performance": "perf",
                "styles": "style",
                "config": "chore",
                "deps": "chore",
                "wip": "chore",
            }
            commit_type = type_mappings.get(commit_type, commit_type)

        return {
            "type": commit_type if commit_type in COMMIT_TYPES else "other",
            "type_label": COMMIT_TYPES.get(commit_type, "Other"),
            "scope": scope,
            "description": description,
            "is_breaking": is_breaking,
        }

    # Try to infer type from message content
    msg_lower = message.lower()
    inferred_type = "other"

    if any(w in msg_lower for w in ["add", "implement", "create", "new"]):
        inferred_type = "feat"
    elif any(w in msg_lower for w in ["fix", "bug", "resolve", "patch"]):
        inferred_type = "fix"
    elif any(w in msg_lower for w in ["refactor", "clean", "improve", "restructure"]):
        inferred_type = "refactor"
    elif any(w in msg_lower for w in ["doc", "readme", "comment"]):
        inferred_type = "docs"
    elif any(w in msg_lower for w in ["test", "spec"]):
        inferred_type = "test"

    return {
        "type": inferred_type,
        "type_label": COMMIT_TYPES.get(inferred_type, "Other"),
        "scope": None,
        "description": message.split('\n')[0].strip(),
        "is_breaking": False,
    }


def detect_work_areas(file_paths: List[str]) -> List[str]:
    """Detect work areas from a list of file paths.

    Args:
        file_paths: List of file paths (e.g., ["src/components/Button.tsx", "api/routes/users.py"])

    Returns:
        List of detected work areas (e.g., ["frontend", "backend"])
    """
    detected_areas = set()

    for file_path in file_paths:
        path_lower = file_path.lower()

        for area, patterns in WORK_AREA_PATTERNS.items():
            for pattern in patterns:
                # Check if pattern matches (handle glob-like patterns)
                if pattern.startswith("*."):
                    # Extension pattern
                    if path_lower.endswith(pattern[1:]):
                        detected_areas.add(area)
                        break
                elif pattern.endswith("/"):
                    # Directory pattern
                    if pattern[:-1] in path_lower or path_lower.startswith(pattern[:-1]):
                        detected_areas.add(area)
                        break
                else:
                    # Exact match or contains
                    if pattern in path_lower:
                        detected_areas.add(area)
                        break

    return list(detected_areas)


def extract_file_extensions(file_paths: List[str]) -> Dict[str, int]:
    """Extract and count file extensions from file paths.

    Args:
        file_paths: List of file paths

    Returns:
        Dict mapping extensions to counts (e.g., {".py": 45, ".ts": 30})
    """
    extensions: Counter = Counter()

    for path in file_paths:
        # Extract extension
        if '.' in path.split('/')[-1]:
            ext = '.' + path.split('.')[-1].lower()
            # Filter out non-code extensions
            if ext not in ['.lock', '.sum', '.map', '.svg', '.png', '.jpg', '.gif']:
                extensions[ext] += 1

    return dict(extensions.most_common(20))


def detect_technologies_from_files(file_paths: List[str]) -> List[str]:
    """Detect technologies based on file paths and extensions.

    Args:
        file_paths: List of file paths

    Returns:
        List of detected technologies
    """
    technologies = set()

    for path in file_paths:
        path_lower = path.lower()

        # Check extensions (using constants from github_constants.py)
        if '.' in path.split('/')[-1]:
            ext = '.' + path.split('.')[-1].lower()
            if ext in EXT_TECH_MAP:
                technologies.add(EXT_TECH_MAP[ext])

        # Check path patterns (using constants from github_constants.py)
        for pattern, tech in PATH_TECH_MAP.items():
            if pattern in path_lower:
                technologies.add(tech)

    return list(technologies)
