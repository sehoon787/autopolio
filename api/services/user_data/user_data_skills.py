"""
User Data Skills - Skill categorization and grouping functions
"""

from typing import Dict, Any, List

from api.services.core.domain_constants import DOMAIN_CATEGORIES


def categorize_skills(all_technologies: set) -> Dict[str, List[str]]:
    """Categorize skills by type"""
    skills_categorized = {
        "languages": [],
        "frameworks": [],
        "databases": [],
        "tools": [],
    }

    language_keywords = [
        "python",
        "javascript",
        "typescript",
        "java",
        "kotlin",
        "go",
        "rust",
        "c++",
        "c#",
        "php",
        "ruby",
        "swift",
        "dart",
    ]
    framework_keywords = [
        "react",
        "vue",
        "angular",
        "next",
        "express",
        "fastapi",
        "django",
        "flask",
        "spring",
        "flutter",
    ]
    db_keywords = [
        "postgresql",
        "mysql",
        "mongodb",
        "redis",
        "sqlite",
        "oracle",
        "mssql",
        "elasticsearch",
    ]

    for tech in all_technologies:
        tech_lower = tech.lower()
        if any(kw in tech_lower for kw in language_keywords):
            skills_categorized["languages"].append(tech)
        elif any(kw in tech_lower for kw in framework_keywords):
            skills_categorized["frameworks"].append(tech)
        elif any(kw in tech_lower for kw in db_keywords):
            skills_categorized["databases"].append(tech)
        else:
            skills_categorized["tools"].append(tech)

    return skills_categorized


def group_projects_by_company(
    projects: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    """Group projects by company name"""
    company_projects = {}
    for proj in projects:
        company = proj.get("company_name") or proj.get("company") or ""
        if company not in company_projects:
            company_projects[company] = []
        company_projects[company].append(proj)
    return company_projects


def categorize_skills_by_domain_detailed(
    projects: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Categorize skills by domain with detailed format for HTML rendering

    Returns list of domain dicts for Mustache iteration:
    [
        {
            "domain_name": "Backend",
            "domain_index": 1,
            "technologies": ["FastAPI", "Django", "PostgreSQL"],
            "technologies_str": "FastAPI, Django, PostgreSQL",
            "implementations": ["RESTful API 서버 개발", ...],
            "databases": ["PostgreSQL", "MySQL"],
            "databases_str": "PostgreSQL, MySQL",
            "has_implementations": True,
            "has_databases": True
        },
        ...
    ]
    """
    domain_data = {}

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
        key_tasks = proj.get("key_tasks_list", [])
        if not key_tasks:
            key_tasks_str = proj.get("key_tasks", "")
            if key_tasks_str:
                key_tasks = [
                    t.strip().lstrip("•").strip()
                    for t in key_tasks_str.split("\n")
                    if t.strip()
                ]

        # Find primary domain
        project_primary_domain = None
        domain_tech_count = {}

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

        # Add key_tasks to implementations
        for task in key_tasks:
            task_lower = task.lower()
            task_assigned = False

            for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                if any(kw in task_lower for kw in domain_info["keywords"]):
                    domain_name = domain_info["name_ko"]
                    if domain_name not in domain_data:
                        domain_data[domain_name] = {
                            "_tech_set": set(),
                            "_impl_set": set(),
                            "_db_set": set(),
                        }
                    domain_data[domain_name]["_impl_set"].add(task)
                    task_assigned = True
                    break

            if not task_assigned and project_primary_domain:
                if project_primary_domain not in domain_data:
                    domain_data[project_primary_domain] = {
                        "_tech_set": set(),
                        "_impl_set": set(),
                        "_db_set": set(),
                    }
                domain_data[project_primary_domain]["_impl_set"].add(task)

    # Sort by priority and convert to list format for Mustache
    priority_order = [
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

    result = []
    domain_idx = 1

    for domain_name in priority_order:
        if domain_name in domain_data:
            dd = domain_data[domain_name]
            techs = sorted(dd["_tech_set"])
            impls = list(dd["_impl_set"])[:10]
            dbs = sorted(dd["_db_set"])

            # Only include domains that have content
            if techs or impls:
                result.append(
                    {
                        "domain_name": domain_name,
                        "domain_index": domain_idx,
                        "technologies": techs,
                        "technologies_str": ", ".join(techs) if techs else "",
                        "has_technologies": len(techs) > 0,
                        "implementations": [{"text": impl} for impl in impls],
                        "has_implementations": len(impls) > 0,
                        "databases": dbs,
                        "databases_str": ", ".join(dbs) if dbs else "",
                        "has_databases": len(dbs) > 0,
                    }
                )
                domain_idx += 1

    # Add any remaining domains not in priority order
    for domain_name in domain_data:
        if domain_name not in priority_order:
            dd = domain_data[domain_name]
            techs = sorted(dd["_tech_set"])
            impls = list(dd["_impl_set"])[:10]
            dbs = sorted(dd["_db_set"])

            if techs or impls:
                result.append(
                    {
                        "domain_name": domain_name,
                        "domain_index": domain_idx,
                        "technologies": techs,
                        "technologies_str": ", ".join(techs) if techs else "",
                        "has_technologies": len(techs) > 0,
                        "implementations": [{"text": impl} for impl in impls],
                        "has_implementations": len(impls) > 0,
                        "databases": dbs,
                        "databases_str": ", ".join(dbs) if dbs else "",
                        "has_databases": len(dbs) > 0,
                    }
                )
                domain_idx += 1

    return result


def project_matches_domain(project: Dict[str, Any], domain_name: str) -> bool:
    """Check if a project's technologies match a domain"""
    tech = project.get("technologies", "")
    if isinstance(tech, str):
        techs = [t.strip().lower() for t in tech.split(",") if t.strip()]
    elif isinstance(tech, list):
        techs = [t.lower() for t in tech]
    else:
        techs = []

    # Find matching keywords for this domain
    for domain_key, domain_info in DOMAIN_CATEGORIES.items():
        if domain_info.get("name_ko") == domain_name:
            return any(
                any(kw in tech for kw in domain_info["keywords"]) for tech in techs
            )
    return False
