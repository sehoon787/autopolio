"""
User Data Collector - Collect user data from database for template rendering
"""

from typing import Dict, Any, List
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.user import User
from api.models.company import Company
from api.models.project import Project, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.achievement import ProjectAchievement


# Domain categorization keywords
DOMAIN_CATEGORIES = {
    "Backend": {
        "keywords": ["python", "fastapi", "django", "flask", "spring", "java", "kotlin", "express", "nodejs", "restful", "api", "jwt", "oauth"],
        "name_ko": "Backend",
    },
    "AI/ML": {
        "keywords": ["tensorflow", "pytorch", "scikit", "langchain", "llm", "gpt", "openai", "ml", "ai", "machine learning", "deep learning", "rag", "nlp"],
        "name_ko": "AI/ML",
    },
    "Frontend": {
        "keywords": ["react", "vue", "angular", "next", "typescript", "javascript", "html", "css", "tailwind", "shadcn"],
        "name_ko": "Frontend",
    },
    "Mobile": {
        "keywords": ["flutter", "dart", "swift", "kotlin", "react native", "android", "ios", "mobile"],
        "name_ko": "Mobile/Cross-Platform",
    },
    "Data": {
        "keywords": ["pandas", "numpy", "matplotlib", "data analysis", "데이터 분석", "excel", "visualization"],
        "name_ko": "데이터 분석",
    },
    "Database": {
        "keywords": ["postgresql", "mysql", "sqlite", "mongodb", "redis", "elasticsearch", "sql", "database", "db"],
        "name_ko": "Database",
    },
    "DevOps": {
        "keywords": ["docker", "kubernetes", "aws", "gcp", "azure", "ci/cd", "github action", "nginx", "linux"],
        "name_ko": "DevOps/인프라",
    },
    "IoT": {
        "keywords": ["iot", "embedded", "ble", "bluetooth", "sensor", "raspberry", "arduino", "임베디드"],
        "name_ko": "IoT/임베디드",
    },
}


class UserDataCollector:
    """Collects user data from database for template rendering"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def collect(self, user_id: int) -> Dict[str, Any]:
        """Collect all user data for template rendering"""
        # Get user
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Get companies
        companies_result = await self.db.execute(
            select(Company).where(Company.user_id == user_id)
            .order_by(Company.start_date.desc())
        )
        companies = list(companies_result.scalars().all())

        # Get projects with technologies, repo_analysis, and achievements
        projects_result = await self.db.execute(
            select(Project).where(Project.user_id == user_id)
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.repo_analysis),
                selectinload(Project.achievements),
            )
            .order_by(Project.start_date.desc())
        )
        projects = list(projects_result.scalars().all())

        # Build render data
        data = self._build_base_data(user, companies)

        project_list, all_technologies = self._build_projects(projects, companies)
        data["projects"] = project_list
        data["skills"] = list(all_technologies)
        data["skills_categorized"] = self._categorize_skills(all_technologies)

        # Build experiences with domain-categorized skills
        company_projects = self._group_projects_by_company(project_list)
        data["experiences"] = self._build_experiences(companies, company_projects)

        # Build capabilities (역량) from personal projects (projects without company)
        personal_projects = [p for p in project_list if not p.get("company_name")]
        data["capabilities"] = self._build_capabilities(personal_projects)
        data["has_capabilities"] = len(data["capabilities"]) > 0
        data["has_experiences"] = len(data["experiences"]) > 0

        # Empty arrays for fields not in current schema
        data["education"] = []
        data["certifications"] = []
        data["introduction"] = ""

        return data

    def _build_base_data(self, user: User, companies: List[Company]) -> Dict[str, Any]:
        """Build base user data"""
        # Calculate total experience years
        total_years = 0
        current_company = None
        for company in companies:
            if company.start_date:
                end = company.end_date or datetime.now().date()
                years = (end - company.start_date).days / 365
                total_years += years
                if not company.end_date:
                    current_company = company.name

        return {
            "name": user.name,
            "email": user.email,
            "phone": "",
            "address": "",
            "github_url": f"https://github.com/{user.github_username}" if user.github_username else None,
            "photo_url": user.github_avatar_url,
            "profile_image": user.github_avatar_url,
            "generated_date": datetime.now().strftime("%Y-%m-%d"),
            "career_status": "경력" if companies else "신입",
            "current_company": current_company,
            "total_experience_years": round(total_years),
            "highest_education": "",
            "education_status": "",
            "desired_salary": "회사내규에 따름",
            "current_salary": "",
            "portfolio_url": f"https://github.com/{user.github_username}" if user.github_username else None,
        }

    def _build_capabilities(
        self,
        personal_projects: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Build capabilities (역량) from personal projects (projects without company)

        Returns list of capability items with domain-categorized skills.
        Used when user has personal/side projects but no company-based experience.
        """
        if not personal_projects:
            return []

        # Categorize skills by domain for personal projects
        skills_by_domain = self._categorize_skills_by_domain_detailed(personal_projects)

        capabilities = []
        for domain_item in skills_by_domain:
            cap = {
                "domain_name": domain_item.get("domain_name", ""),
                "domain_index": domain_item.get("domain_index", 0),
                "technologies": domain_item.get("technologies", []),
                "technologies_str": domain_item.get("technologies_str", ""),
                "has_technologies": domain_item.get("has_technologies", False),
                "implementations": domain_item.get("implementations", []),
                "has_implementations": domain_item.get("has_implementations", False),
                "databases": domain_item.get("databases", []),
                "databases_str": domain_item.get("databases_str", ""),
                "has_databases": domain_item.get("has_databases", False),
                # Include project names for reference
                "projects": [p.get("name", "") for p in personal_projects
                            if self._project_matches_domain(p, domain_item.get("domain_name", ""))],
            }
            capabilities.append(cap)

        return capabilities

    def _project_matches_domain(self, project: Dict[str, Any], domain_name: str) -> bool:
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
                    any(kw in tech for kw in domain_info["keywords"])
                    for tech in techs
                )
        return False

    def _build_experiences(
        self,
        companies: List[Company],
        company_projects: Dict[str, List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """Build experiences from companies with domain-categorized skills"""
        experiences = []
        company_projects = company_projects or {}

        for company in companies:
            is_current = company.end_date is None
            start = company.start_date
            end = company.end_date or datetime.now().date()

            # Calculate duration
            duration = ""
            if start:
                months = (end.year - start.year) * 12 + (end.month - start.month)
                years = months // 12
                rem_months = months % 12
                if years > 0 and rem_months > 0:
                    duration = f"{years}년 {rem_months}개월"
                elif years > 0:
                    duration = f"{years}년"
                else:
                    duration = f"{rem_months}개월"

            # Get projects for this company
            company_projs = company_projects.get(company.name, [])

            # Categorize skills by domain for this company's projects
            skills_by_domain = self._categorize_skills_by_domain_detailed(company_projs)

            exp = {
                "company_name": company.name,
                "position": company.position or "",
                "department": "",
                "job_type": "",
                "start_date": company.start_date.strftime("%Y.%m") if company.start_date else "",
                "end_date": company.end_date.strftime("%Y.%m") if company.end_date else "",
                "is_current": is_current,
                "duration": duration,
                "description": company.description or "",
                "salary": "",
                "location": "",
                # Domain-categorized skills for HTML template
                "skills_by_domain": skills_by_domain,
                "has_domain_skills": len(skills_by_domain) > 0,
            }
            experiences.append(exp)
        return experiences

    def _build_projects(
        self,
        projects: List[Project],
        companies: List[Company]
    ) -> tuple[List[Dict[str, Any]], set]:
        """Build projects list and collect all technologies"""
        project_list = []
        all_technologies = set()

        for idx, project in enumerate(projects, 1):
            # Get technologies for this project
            tech_names = []
            if project.technologies:
                for pt in project.technologies:
                    if pt.technology:
                        tech_names.append(pt.technology.name)
                        all_technologies.add(pt.technology.name)

            # Find company name
            company_name = None
            if project.company_id:
                for company in companies:
                    if company.id == project.company_id:
                        company_name = company.name
                        break

            is_ongoing = project.end_date is None

            # Extract data from RepoAnalysis if available
            key_tasks = []
            implementation_details = []
            detailed_achievements = []

            if project.repo_analysis:
                ra = project.repo_analysis
                # Key tasks (list of strings)
                if ra.key_tasks:
                    key_tasks = ra.key_tasks if isinstance(ra.key_tasks, list) else []

                # Implementation details (list of dicts with title and items)
                if ra.implementation_details:
                    impl_details = ra.implementation_details if isinstance(ra.implementation_details, list) else []
                    for detail in impl_details:
                        if isinstance(detail, dict):
                            title = detail.get("title", "")
                            items = detail.get("items", [])
                            if title or items:
                                implementation_details.append({
                                    "title": title,
                                    "items": items if isinstance(items, list) else []
                                })

                # Detailed achievements from RepoAnalysis
                if ra.detailed_achievements:
                    achievements_data = ra.detailed_achievements if isinstance(ra.detailed_achievements, dict) else {}
                    for category, items in achievements_data.items():
                        if isinstance(items, list):
                            for item in items:
                                if isinstance(item, dict):
                                    detailed_achievements.append({
                                        "category": category,
                                        "title": item.get("title", ""),
                                        "description": item.get("description", "")
                                    })

            # Also get achievements from ProjectAchievement model
            project_achievements = []
            if project.achievements:
                for ach in project.achievements:
                    project_achievements.append({
                        "metric_name": ach.metric_name,
                        "metric_value": ach.metric_value,
                        "description": ach.description or ""
                    })

            # Format achievements as string for template compatibility
            achievements_str = ""
            if project_achievements:
                achievements_str = "\n".join([
                    f"• {ach['metric_name']}: {ach['metric_value']}" +
                    (f" - {ach['description']}" if ach['description'] else "")
                    for ach in project_achievements
                ])
            elif detailed_achievements:
                achievements_str = "\n".join([
                    f"• {ach['title']}" + (f": {ach['description']}" if ach['description'] else "")
                    for ach in detailed_achievements
                ])

            # Format key tasks as string
            key_tasks_str = "\n".join([f"• {task}" for task in key_tasks]) if key_tasks else ""

            proj = {
                "index": idx,
                "name": project.name,
                "company_name": company_name,
                "company": company_name,  # Alias for template compatibility
                "start_date": project.start_date.strftime("%Y.%m") if project.start_date else "",
                "end_date": project.end_date.strftime("%Y.%m") if project.end_date else "",
                "is_ongoing": is_ongoing,
                "description": project.description or "",
                "role": project.role or "",
                "technologies": ", ".join(tech_names) if tech_names else "",
                "technologies_list": tech_names,  # For template iteration
                "team_size": project.team_size if hasattr(project, 'team_size') else "",
                "main_features": "",
                "achievements": achievements_str,
                "achievements_list": project_achievements or detailed_achievements,  # For template iteration
                "has_achievements": bool(achievements_str),  # Boolean flag for Mustache
                "key_tasks": key_tasks_str,
                "key_tasks_list": key_tasks,  # For template iteration
                "has_key_tasks": len(key_tasks) > 0,  # Boolean flag for Mustache
                "implementation_details": implementation_details,  # For detailed rendering
                "git_url": project.git_url or "",
            }
            project_list.append(proj)

        return project_list, all_technologies

    def _categorize_skills(self, all_technologies: set) -> Dict[str, List[str]]:
        """Categorize skills by type"""
        skills_categorized = {
            "languages": [],
            "frameworks": [],
            "databases": [],
            "tools": [],
        }

        language_keywords = [
            "python", "javascript", "typescript", "java", "kotlin", "go",
            "rust", "c++", "c#", "php", "ruby", "swift", "dart"
        ]
        framework_keywords = [
            "react", "vue", "angular", "next", "express", "fastapi",
            "django", "flask", "spring", "flutter"
        ]
        db_keywords = [
            "postgresql", "mysql", "mongodb", "redis", "sqlite",
            "oracle", "mssql", "elasticsearch"
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

    def _group_projects_by_company(
        self,
        projects: List[Dict[str, Any]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Group projects by company name"""
        company_projects = {}
        for proj in projects:
            company = proj.get("company_name") or proj.get("company") or ""
            if company not in company_projects:
                company_projects[company] = []
            company_projects[company].append(proj)
        return company_projects

    def _categorize_skills_by_domain_detailed(
        self,
        projects: List[Dict[str, Any]]
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
                    key_tasks = [t.strip().lstrip("•").strip()
                                for t in key_tasks_str.split("\n") if t.strip()]

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
                domain_tech_count[matched_domain] = domain_tech_count.get(matched_domain, 0) + 1

                # Check if it's a database tech
                if any(kw in tech_lower for kw in DOMAIN_CATEGORIES.get("Database", {}).get("keywords", [])):
                    domain_data[matched_domain]["_db_set"].add(tech_name)

            # Find primary domain
            if domain_tech_count:
                project_primary_domain = max(domain_tech_count.items(), key=lambda x: x[1])[0]

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
        priority_order = ["Backend", "AI/ML", "Frontend", "Mobile/Cross-Platform", "데이터 분석", "Database", "DevOps/인프라", "IoT/임베디드", "기타"]

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
                    result.append({
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
                    })
                    domain_idx += 1

        # Add any remaining domains not in priority order
        for domain_name in domain_data:
            if domain_name not in priority_order:
                dd = domain_data[domain_name]
                techs = sorted(dd["_tech_set"])
                impls = list(dd["_impl_set"])[:10]
                dbs = sorted(dd["_db_set"])

                if techs or impls:
                    result.append({
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
                    })
                    domain_idx += 1

        return result
