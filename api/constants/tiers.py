"""Tier-based feature limits for the pricing system."""

from api.constants.enums import UserTier

TIER_LIMITS = {
    UserTier.FREE: {
        "max_projects": 3,
        "max_repos_per_project": 1,
        "max_llm_calls_per_month": 10,
        "allowed_export_formats": ["md"],
    },
    UserTier.PRO: {
        "max_projects": 20,
        "max_repos_per_project": 5,
        "max_llm_calls_per_month": 200,
        "allowed_export_formats": ["md", "docx", "html"],
    },
    UserTier.ENTERPRISE: {
        "max_projects": None,  # unlimited
        "max_repos_per_project": None,
        "max_llm_calls_per_month": None,
        "allowed_export_formats": ["md", "docx", "html", "pdf"],
    },
}
