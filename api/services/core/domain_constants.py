"""
Domain Constants - Shared categorization keywords for technology domain classification

Used by:
- template_exporter.py: For categorizing skills by domain in exports
- user_data_collector.py: For categorizing technologies in user data collection
"""

from typing import Dict, Any, List

# Domain categorization keywords for technology classification
DOMAIN_CATEGORIES: Dict[str, Dict[str, Any]] = {
    "Backend": {
        "keywords": [
            "python",
            "fastapi",
            "django",
            "flask",
            "spring",
            "java",
            "kotlin",
            "express",
            "nodejs",
            "restful",
            "api",
            "jwt",
            "oauth",
        ],
        "name_ko": "Backend",
    },
    "AI/ML": {
        "keywords": [
            "tensorflow",
            "pytorch",
            "scikit",
            "langchain",
            "llm",
            "gpt",
            "openai",
            "ml",
            "ai",
            "machine learning",
            "deep learning",
            "rag",
            "nlp",
        ],
        "name_ko": "AI/ML",
    },
    "Frontend": {
        "keywords": [
            "react",
            "vue",
            "angular",
            "next",
            "typescript",
            "javascript",
            "html",
            "css",
            "tailwind",
            "shadcn",
        ],
        "name_ko": "Frontend",
    },
    "Mobile": {
        "keywords": [
            "flutter",
            "dart",
            "swift",
            "kotlin",
            "react native",
            "android",
            "ios",
            "mobile",
        ],
        "name_ko": "Mobile/Cross-Platform",
    },
    "Data": {
        "keywords": [
            "pandas",
            "numpy",
            "matplotlib",
            "data analysis",
            "데이터 분석",
            "excel",
            "visualization",
        ],
        "name_ko": "데이터 분석",
    },
    "Database": {
        "keywords": [
            "postgresql",
            "mysql",
            "sqlite",
            "mongodb",
            "redis",
            "elasticsearch",
            "sql",
            "database",
            "db",
        ],
        "name_ko": "Database",
    },
    "DevOps": {
        "keywords": [
            "docker",
            "kubernetes",
            "aws",
            "gcp",
            "azure",
            "ci/cd",
            "github action",
            "nginx",
            "linux",
        ],
        "name_ko": "DevOps/인프라",
    },
    "IoT": {
        "keywords": [
            "iot",
            "embedded",
            "ble",
            "bluetooth",
            "sensor",
            "raspberry",
            "arduino",
            "임베디드",
        ],
        "name_ko": "IoT/임베디드",
    },
}

# Priority order for domain display
DOMAIN_PRIORITY_ORDER: List[str] = [
    "Backend",
    "AI/ML",
    "Frontend",
    "Mobile/Cross-Platform",
    "데이터 분석",
    "Database",
    "DevOps/인프라",
    "IoT/임베디드",
    "기타",
]


def get_domain_for_technology(tech_name: str) -> str:
    """Get domain category for a technology name

    Args:
        tech_name: Technology name to categorize

    Returns:
        Domain name (Korean) or "기타" if not matched
    """
    tech_lower = tech_name.lower()

    for domain_key, domain_info in DOMAIN_CATEGORIES.items():
        if any(kw in tech_lower for kw in domain_info["keywords"]):
            return domain_info["name_ko"]

    return "기타"


def sort_domains_by_priority(domains: Dict[str, Any]) -> Dict[str, Any]:
    """Sort domain dictionary by priority order

    Args:
        domains: Dictionary with domain names as keys

    Returns:
        OrderedDict sorted by DOMAIN_PRIORITY_ORDER
    """
    sorted_data = {}

    # First add domains in priority order
    for domain in DOMAIN_PRIORITY_ORDER:
        if domain in domains:
            sorted_data[domain] = domains[domain]

    # Then add any remaining domains not in priority list
    for domain in domains:
        if domain not in sorted_data:
            sorted_data[domain] = domains[domain]

    return sorted_data
