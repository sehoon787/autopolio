"""
System Templates - Default template definitions for the application.

This module imports template content from the templates subpackage
and assembles the system template definitions.
"""
from typing import List, Dict, Any

from .templates import (
    CAREER_DESCRIPTION_TEMPLATE,
    CAREER_DESCRIPTION_NO_PERSONAL_TEMPLATE,
    RESUME_TEMPLATE,
    NOTION_PORTFOLIO_TEMPLATE,
)


# ============================================================================
# System Template Definitions
# ============================================================================

def get_system_templates() -> List[Dict[str, Any]]:
    """Return list of system template definitions.

    Returns:
        List of template definition dictionaries ready for database insertion.
    """
    return [
        {
            "name": "경력기술서",
            "description": "인적사항, 학력, 경력, 프로젝트를 포함한 상세 경력기술서",
            "platform": "career_description",
            "output_format": "docx",
            "sections": [
                "personal_info",
                "education",
                "experience",
                "projects",
                "skills",
                "certifications",
                "awards",
            ],
            "max_projects": 20,
            "template_content": CAREER_DESCRIPTION_TEMPLATE,
        },
        {
            "name": "경력기술서 (인적사항X)",
            "description": "인적사항을 제외한 경력기술서 (회사 제출용)",
            "platform": "career_description_no_personal",
            "output_format": "docx",
            "sections": [
                "education",
                "experience",
                "projects",
                "skills",
                "certifications",
                "awards",
            ],
            "max_projects": 20,
            "template_content": CAREER_DESCRIPTION_NO_PERSONAL_TEMPLATE,
        },
        {
            "name": "이력서",
            "description": "인적사항, 연봉정보, 학력, 경력, 프로젝트, 자기소개를 포함한 종합 이력서",
            "platform": "resume",
            "output_format": "docx",
            "sections": [
                "personal_info",
                "salary_info",
                "education",
                "experience",
                "projects",
                "skills",
                "certifications",
                "awards",
                "self_introduction",
            ],
            "max_projects": 20,
            "template_content": RESUME_TEMPLATE,
        },
        {
            "name": "노션 포트폴리오",
            "description": "노션용 상세 포트폴리오 템플릿",
            "platform": "notion",
            "output_format": "md",
            "sections": [
                "summary",
                "experience",
                "projects",
                "achievements",
                "skills",
                "links",
            ],
            "template_content": NOTION_PORTFOLIO_TEMPLATE,
        },
    ]


# Convenience export - re-export template constants for backward compatibility
__all__ = [
    "get_system_templates",
    "CAREER_DESCRIPTION_TEMPLATE",
    "CAREER_DESCRIPTION_NO_PERSONAL_TEMPLATE",
    "RESUME_TEMPLATE",
    "NOTION_PORTFOLIO_TEMPLATE",
]
