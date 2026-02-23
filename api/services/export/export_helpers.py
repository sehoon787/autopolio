"""
Export Helpers - Achievement extraction, key tasks, and skill categorization

Provides utilities for extracting and formatting data for resume exports.
"""

from typing import Dict, Any, List

from api.services.core.domain_constants import (
    DOMAIN_CATEGORIES,
    sort_domains_by_priority,
)


def get_key_tasks_list(proj: dict) -> List[str]:
    """Extract key tasks as a list of strings

    Args:
        proj: Project dictionary

    Returns:
        List of key task strings
    """
    key_tasks = proj.get("key_tasks_list", [])
    if not key_tasks:
        key_tasks_str = proj.get("key_tasks", "")
        if key_tasks_str:
            key_tasks = [
                t.strip().lstrip("").strip()
                for t in key_tasks_str.split("\n")
                if t.strip()
            ]
    return key_tasks


def get_achievements_list(proj: dict, use_detailed: bool = False) -> List[str]:
    """Extract achievements as a list of strings

    Args:
        proj: Project dictionary
        use_detailed: If True, use achievements_detailed_list (with descriptions)
                     If False (default), use achievements_summary_list (title only)

    Priority order (DEFAULT = Summary):
    1. achievements_summary_list (from RepoAnalysis.detailed_achievements) - title only, no description
    2. achievements_basic_list (from ProjectAchievement) - metric_name: metric_value

    Returns formatted strings like:
    - Summary: "[새로운 기능 추가] UI 개선"
    - Detailed: "[새로운 기능 추가] UI 개선 - 접이식 문서 메뉴 추가, 사용자 경험 개선"
    """
    # If detailed is requested, use achievements_detailed_list first
    if use_detailed:
        detailed_list = proj.get("achievements_detailed_list", [])
        if detailed_list and isinstance(detailed_list, list):
            result = []
            for ach in detailed_list:
                if isinstance(ach, dict):
                    category = ach.get("category", "")
                    title = ach.get("title", "")
                    description = ach.get("description", "")

                    if title:
                        if category:
                            line = f"[{category}] {title}"
                        else:
                            line = title
                        # Add description if available
                        if description:
                            line += f" - {description}"
                        result.append(line)
            if result:
                return result

    # Priority 1: Use achievements_summary_list (from detailed_achievements) - DEFAULT
    # Format: [{category, title}] - NO description
    summary_list = proj.get("achievements_summary_list", [])
    if summary_list and isinstance(summary_list, list):
        result = []
        for ach in summary_list:
            if isinstance(ach, dict):
                category = ach.get("category", "")
                title = ach.get("title", "")

                if title:
                    if category:
                        line = f"[{category}] {title}"
                    else:
                        line = title
                    result.append(line)
        if result:
            return result

    # Priority 2: Use achievements_basic_list (from ProjectAchievement)
    basic_list = proj.get("achievements_basic_list", [])
    if basic_list and isinstance(basic_list, list):
        result = []
        for ach in basic_list:
            if isinstance(ach, dict):
                metric = ach.get("metric_name", "")
                value = ach.get("metric_value", "")
                if metric and value:
                    result.append(f"{metric}: {value}")
                elif metric:
                    result.append(metric)
        if result:
            return result

    # Fallback: Use achievements string
    achievements = proj.get("achievements")
    if isinstance(achievements, str):
        return [
            a.strip().lstrip("").lstrip("-").strip()
            for a in achievements.split("\n")
            if a.strip()
        ]
    return []


def group_projects_by_company(
    projects: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    """Group projects by company name

    Args:
        projects: List of project dictionaries

    Returns:
        Dictionary mapping company names to lists of projects
    """
    company_projects: Dict[str, List[Dict[str, Any]]] = {}
    for proj in projects:
        company = proj.get("company_name") or proj.get("company") or ""
        if company not in company_projects:
            company_projects[company] = []
        company_projects[company].append(proj)
    return company_projects


def categorize_skills_by_domain_detailed(
    projects: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Categorize skills by domain with detailed format (based on user's example)

    Returns dict with:
    - technologies: List of technology lines (can be multiple items per line)
    - implementations: List of implementation details
    - databases: List of database-related items

    Example output for Backend domain:
    {
        "technologies": [
            "FastAPI, Spring Boot, RESTful API, JWT 인증",
            "ORM (SQLAlchemy, JPA/Hibernate)",
            "Linux (Rocky Linux, Ubuntu), Nginx, Docker"
        ],
        "implementations": [
            "RESTful API 서버 개발 (10개 이상 프로젝트)",
            "데이터 수집 파이프라인 구축",
            ...
        ],
        "databases": [
            "MySQL, PostgreSQL, SQLite, Elasticsearch",
            "DB 설계, ERD 작성, 테이블 정의서 작성"
        ]
    }
    """
    domain_data: Dict[str, Dict[str, Any]] = {}

    for proj in projects:
        # Get technologies
        tech = proj.get("technologies")
        if isinstance(tech, str):
            techs = [t.strip() for t in tech.split(",") if t.strip()]
        elif isinstance(tech, list):
            techs = tech
        else:
            techs = []

        # Get key tasks and implementation details
        key_tasks = get_key_tasks_list(proj)
        implementation_details = proj.get("implementation_details", [])

        # Find primary domain
        project_primary_domain = None
        domain_tech_count: Dict[str, int] = {}

        # Categorize technologies
        for tech_name in techs:
            tech_lower = tech_name.lower()
            matched_domain = None

            for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                if any(kw in tech_lower for kw in domain_info["keywords"]):
                    matched_domain = domain_info["name_ko"]
                    break

            if not matched_domain:
                matched_domain = "기타"

            if matched_domain not in domain_data:
                domain_data[matched_domain] = {
                    "technologies": [],
                    "implementations": [],
                    "databases": [],
                    "_tech_set": set(),
                    "_impl_set": set(),
                    "_db_set": set(),
                }

            domain_data[matched_domain]["_tech_set"].add(tech_name)
            domain_tech_count[matched_domain] = (
                domain_tech_count.get(matched_domain, 0) + 1
            )

            # Check if it's a database tech
            if any(
                kw in tech_lower
                for kw in DOMAIN_CATEGORIES.get("Database", {}).get("keywords", [])
            ):
                domain_data[matched_domain]["_db_set"].add(tech_name)

        # Find primary domain
        if domain_tech_count:
            project_primary_domain = max(domain_tech_count.items(), key=lambda x: x[1])[
                0
            ]

        # Process implementation_details from LLM analysis
        for detail in implementation_details:
            if isinstance(detail, dict):
                title = detail.get("title", "")
                items = detail.get("items", [])
                title_lower = title.lower()

                matched_domain = None
                for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                    if any(kw in title_lower for kw in domain_info["keywords"]):
                        matched_domain = domain_info["name_ko"]
                        break

                if not matched_domain:
                    matched_domain = project_primary_domain or "기타"

                if matched_domain not in domain_data:
                    domain_data[matched_domain] = {
                        "technologies": [],
                        "implementations": [],
                        "databases": [],
                        "_tech_set": set(),
                        "_impl_set": set(),
                        "_db_set": set(),
                    }

                for item in items:
                    if isinstance(item, str):
                        stripped = item.strip()
                        if stripped:
                            domain_data[matched_domain]["_impl_set"].add(stripped)

        # Add key_tasks to implementations
        for task in key_tasks:
            task_lower = task.lower()
            task_assigned = False

            for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                if any(kw in task_lower for kw in domain_info["keywords"]):
                    domain_name = domain_info["name_ko"]
                    if domain_name not in domain_data:
                        domain_data[domain_name] = {
                            "technologies": [],
                            "implementations": [],
                            "databases": [],
                            "_tech_set": set(),
                            "_impl_set": set(),
                            "_db_set": set(),
                        }
                    domain_data[domain_name]["_impl_set"].add(task)
                    task_assigned = True
                    break

            if not task_assigned and project_primary_domain:
                domain_data[project_primary_domain]["_impl_set"].add(task)

    # Convert sets to lists and format technologies
    for domain_name in domain_data:
        techs = sorted(domain_data[domain_name]["_tech_set"])
        # Group technologies into comma-separated lines (max 4-5 per line)
        if techs:
            domain_data[domain_name]["technologies"] = [", ".join(techs)]

        domain_data[domain_name]["implementations"] = list(
            domain_data[domain_name]["_impl_set"]
        )[:10]

        dbs = sorted(domain_data[domain_name]["_db_set"])
        if dbs:
            domain_data[domain_name]["databases"] = [", ".join(dbs)]

        # Clean up internal sets
        del domain_data[domain_name]["_tech_set"]
        del domain_data[domain_name]["_impl_set"]
        del domain_data[domain_name]["_db_set"]

    # Sort by priority using shared function
    return sort_domains_by_priority(domain_data)
