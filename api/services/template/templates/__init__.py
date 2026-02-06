"""
Templates module - Contains template content strings for the application.
"""
from .career_templates import (
    CAREER_DESCRIPTION_TEMPLATE,
    CAREER_DESCRIPTION_NO_PERSONAL_TEMPLATE,
)
from .resume_template import RESUME_TEMPLATE
from .notion_template import NOTION_PORTFOLIO_TEMPLATE

__all__ = [
    "CAREER_DESCRIPTION_TEMPLATE",
    "CAREER_DESCRIPTION_NO_PERSONAL_TEMPLATE",
    "RESUME_TEMPLATE",
    "NOTION_PORTFOLIO_TEMPLATE",
]
