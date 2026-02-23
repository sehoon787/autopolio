"""GitHub routers package.

Exports the main GitHub router which aggregates all sub-routers.
"""

from .github import router

__all__ = ["router"]
