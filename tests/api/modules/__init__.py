"""
API test modules package.

Provides reusable API modules for testing:
- BaseAPIModule: Base class for all API modules
- UsersAPI: User management API
- CompaniesAPI: Company management API
- ProjectsAPI: Project management API
- CredentialsAPI: Credentials (certifications, education, awards) API
- GitHubAPI: GitHub integration API
- TemplatesAPI: Template management API
- PlatformsAPI: Platform template API
- DocumentsAPI: Document management API
"""

from .base import BaseAPIModule
from .users import UsersAPI
from .companies import CompaniesAPI
from .projects import ProjectsAPI
from .credentials import CredentialsAPI
from .github import GitHubAPI
from .templates import TemplatesAPI
from .platforms import PlatformsAPI
from .documents import DocumentsAPI

__all__ = [
    "BaseAPIModule",
    "UsersAPI",
    "CompaniesAPI",
    "ProjectsAPI",
    "CredentialsAPI",
    "GitHubAPI",
    "TemplatesAPI",
    "PlatformsAPI",
    "DocumentsAPI",
]
