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
from api.models.repo_analysis_edits import RepoAnalysisEdits
from api.models.achievement import ProjectAchievement
from api.models.credentials import Certification, Award, Education, Publication, VolunteerActivity


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
        """Collect all user data for template rendering

        Args:
            user_id: User ID to collect data for
        """
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

        # Get projects with technologies, repo_analysis (including user_edits), and achievements
        projects_result = await self.db.execute(
            select(Project).where(Project.user_id == user_id)
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.repo_analysis).selectinload(RepoAnalysis.user_edits),
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

        # Collect credentials (certifications, awards, education, publications)
        credentials = await self._collect_credentials(user_id)
        data["certifications"] = credentials["certifications"]
        data["awards"] = credentials["awards"]
        data["education"] = credentials["educations"]
        data["educations"] = credentials["educations"]  # Alias
        data["publications"] = credentials["publications"]
        data["volunteer_activities"] = credentials["volunteer_activities"]
        data["activities"] = credentials["volunteer_activities"]  # Alias

        # Boolean flags for Mustache conditionals
        data["has_certifications"] = len(data["certifications"]) > 0
        data["has_awards"] = len(data["awards"]) > 0
        data["has_education"] = len(data["education"]) > 0
        data["has_educations"] = len(data["educations"]) > 0  # Alias for template compatibility
        data["has_publications"] = len(data["publications"]) > 0
        data["has_volunteer_activities"] = len(data["volunteer_activities"]) > 0
        data["has_activities"] = len(data["volunteer_activities"]) > 0

        # Extract highest education for dashboard display (saramin template)
        if data["educations"]:
            highest_edu = data["educations"][0]  # First one is the most recent (sorted by start_date desc)
            data["school"] = highest_edu.get("school_name", "")
            data["degree"] = highest_edu.get("degree", "")
            data["highest_education"] = highest_edu.get("school_name", "")
            data["education_status"] = highest_edu.get("degree", "")
            # Also provide major for completeness
            data["major"] = highest_edu.get("major", "")
        else:
            data["school"] = ""
            data["degree"] = ""
            data["highest_education"] = ""
            data["education_status"] = ""
            data["major"] = ""

        data["introduction"] = ""

        return data

    def _build_base_data(self, user: User, companies: List[Company]) -> Dict[str, Any]:
        """Build base user data with effective values (user input > OAuth default)"""
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

        # Calculate effective values (user value if set, otherwise fallback)
        # Rule: None = use fallback, "" = intentionally empty, value = use value
        effective_name = self._get_effective_value(user.display_name, user.name)
        effective_email = self._get_effective_value(user.profile_email, user.email)
        effective_phone = user.phone if user.phone is not None else ""
        effective_address = user.address if user.address is not None else ""
        effective_birthdate = user.birthdate.isoformat() if user.birthdate else ""

        # Calculate age from birthdate
        age = None
        birth_year = None
        birthdate_formatted = ""
        birthdate_short = ""
        if user.birthdate:
            today = datetime.now().date()
            birth_year = user.birthdate.year
            age = today.year - birth_year
            # Adjust if birthday hasn't occurred yet this year
            if (today.month, today.day) < (user.birthdate.month, user.birthdate.day):
                age -= 1
            # Full birthdate formats
            birthdate_formatted = user.birthdate.strftime("%Y년 %m월 %d일")  # 1990년 05월 15일
            birthdate_short = user.birthdate.strftime("%Y.%m.%d")  # 1990.05.15

        # Build description field for saramin template (e.g., "1990.05.15 (35세)")
        description = ""
        if birthdate_short and age:
            description = f"{birthdate_short} ({age}세)"

        return {
            "name": effective_name,
            "email": effective_email,
            "phone": effective_phone,
            "address": effective_address,
            "birthdate": effective_birthdate,
            "birthdate_formatted": birthdate_formatted,  # 1990년 05월 15일
            "birthdate_short": birthdate_short,  # 1990.05.15
            "birth_year": birth_year,
            "age": age,
            "description": description,  # For saramin template compatibility (1990.05.15 (35세))
            "github_url": f"https://github.com/{user.github_username}" if user.github_username else None,
            "photo_url": user.github_avatar_url,
            "profile_image": user.github_avatar_url,
            "generated_date": datetime.now().strftime("%Y-%m-%d"),
            "career_status": "경력" if companies else "신입",
            "current_company": current_company,
            "total_experience_years": round(total_years),
            "total_experience": f"{round(total_years)}년" if total_years >= 1 else f"{int(total_years * 12)}개월",
            "is_working": current_company is not None,
            "highest_education": "",
            "education_status": "",
            "desired_salary": "회사내규에 따름",
            "current_salary": "",
            "portfolio_url": f"https://github.com/{user.github_username}" if user.github_username else None,
        }

    def _get_effective_value(self, user_value: str, fallback_value: str) -> str:
        """Get effective value: user value if not None, otherwise fallback"""
        if user_value is not None:
            return user_value
        return fallback_value or ""

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
        """Build projects list and collect all technologies

        Args:
            projects: List of projects
            companies: List of companies
        """
        project_list = []
        all_technologies = set()

        # Code contribution keywords to filter out (not a real achievement)
        code_stat_keywords = ["코드 기여", "Code Contribution", "code contribution"]

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

            # Extract data from RepoAnalysis if available (with user edits support)
            key_tasks = []
            implementation_details = []
            detailed_achievements = []

            if project.repo_analysis:
                ra = project.repo_analysis
                edits = ra.user_edits  # May be None if no edits exist

                # Get effective key_tasks (edited or original)
                effective_key_tasks = None
                if edits and edits.key_tasks_modified and edits.key_tasks is not None:
                    effective_key_tasks = edits.key_tasks
                elif ra.key_tasks:
                    effective_key_tasks = ra.key_tasks

                if effective_key_tasks:
                    key_tasks = effective_key_tasks if isinstance(effective_key_tasks, list) else []

                # Get effective implementation_details (edited or original)
                effective_impl_details = None
                if edits and edits.implementation_details_modified and edits.implementation_details is not None:
                    effective_impl_details = edits.implementation_details
                elif ra.implementation_details:
                    effective_impl_details = ra.implementation_details

                if effective_impl_details:
                    impl_details = effective_impl_details if isinstance(effective_impl_details, list) else []
                    for detail in impl_details:
                        if isinstance(detail, dict):
                            title = detail.get("title", "")
                            items = detail.get("items", [])
                            if title or items:
                                implementation_details.append({
                                    "title": title,
                                    "items": items if isinstance(items, list) else []
                                })

                # Get effective detailed_achievements (edited or original)
                effective_detailed_achievements = None
                if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None:
                    effective_detailed_achievements = edits.detailed_achievements
                elif ra.detailed_achievements:
                    effective_detailed_achievements = ra.detailed_achievements

                if effective_detailed_achievements:
                    achievements_data = effective_detailed_achievements if isinstance(effective_detailed_achievements, dict) else {}
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
            # Filter out code contribution achievements (lines added/deleted is not a real achievement)
            project_achievements = []
            if project.achievements:
                for ach in project.achievements:
                    # Skip code contribution achievements
                    if any(kw in (ach.metric_name or "") for kw in code_stat_keywords):
                        continue
                    project_achievements.append({
                        "metric_name": ach.metric_name,
                        "metric_value": ach.metric_value,
                        "description": ach.description or "",
                        "before_value": ach.before_value or "",
                        "after_value": ach.after_value or "",
                        "category": ach.category or "",
                        "has_before_after": bool(ach.before_value or ach.after_value),
                        "has_description": bool(ach.description),
                    })

            # === 3 LEVELS OF ACHIEVEMENT FORMAT ===
            #
            # 1. 기본 (Basic): From ProjectAchievement model - "기능 개발: 16개 기능"
            # 2. 요약 (Summary): From RepoAnalysis.detailed_achievements - titles with category
            # 3. 상세 (Detailed): From RepoAnalysis.detailed_achievements - full title + description
            #
            # Default (achievements): Uses 요약 (Summary) format

            # 1. BASIC format: Simple metric_name: metric_value from ProjectAchievement
            achievements_basic = ""
            achievements_basic_list = project_achievements
            if project_achievements:
                achievements_basic = "\n".join([
                    f"• {ach['metric_name']}: {ach['metric_value']}"
                    for ach in project_achievements
                ])

            # 2. SUMMARY format: Titles from detailed_achievements (grouped by category)
            achievements_summary = ""
            achievements_summary_list = []
            if detailed_achievements:
                # Group by category
                from collections import OrderedDict
                categories = OrderedDict()
                for ach in detailed_achievements:
                    cat = ach.get("category", "기타")
                    if cat not in categories:
                        categories[cat] = []
                    categories[cat].append(ach)

                summary_lines = []
                for category, items in categories.items():
                    summary_lines.append(f"**[{category}]**")
                    for item in items:
                        summary_lines.append(f"• {item['title']}")
                        achievements_summary_list.append({
                            "category": category,
                            "title": item['title'],
                            "has_description": bool(item.get('description')),
                        })
                    summary_lines.append("")  # Empty line between categories
                achievements_summary = "\n".join(summary_lines).strip()
            elif project_achievements:
                # Fallback to basic if no detailed achievements
                achievements_summary = achievements_basic
                achievements_summary_list = project_achievements

            # 3. DETAILED format: Full title + description from detailed_achievements
            achievements_detailed = ""
            achievements_detailed_list = []
            if detailed_achievements:
                # Group by category
                from collections import OrderedDict
                categories = OrderedDict()
                for ach in detailed_achievements:
                    cat = ach.get("category", "기타")
                    if cat not in categories:
                        categories[cat] = []
                    categories[cat].append(ach)

                detailed_lines = []
                for category, items in categories.items():
                    detailed_lines.append(f"**[{category}]**")
                    for item in items:
                        detailed_lines.append(f"**{item['title']}**")
                        if item.get('description'):
                            detailed_lines.append(f"  {item['description']}")
                        detailed_lines.append("")
                        achievements_detailed_list.append({
                            "category": category,
                            "title": item['title'],
                            "description": item.get('description', ''),
                            "has_description": bool(item.get('description')),
                        })
                achievements_detailed = "\n".join(detailed_lines).strip()
            elif project_achievements:
                # Fallback to basic with descriptions if no detailed achievements
                # Convert to detailed_list format for template compatibility
                detailed_lines = []
                for ach in project_achievements:
                    line = f"**{ach['metric_name']}**: {ach['metric_value']}"
                    desc_parts = []
                    if ach['description']:
                        desc_parts.append(ach['description'])
                    if ach['before_value'] or ach['after_value']:
                        before = ach['before_value'] or '-'
                        after = ach['after_value'] or '-'
                        desc_parts.append(f"▶ {before} → {after}")
                    detailed_lines.append(line + ("\n  " + " ".join(desc_parts) if desc_parts else ""))

                    # Convert to detailed_list format
                    achievements_detailed_list.append({
                        "category": ach['metric_name'],  # Use metric_name as category
                        "title": ach['metric_value'],    # Use metric_value as title
                        "description": ach.get('description', ''),
                        "has_description": bool(ach.get('description')),
                    })
                achievements_detailed = "\n\n".join(detailed_lines)

            # DEFAULT: Use Summary format (요약)
            achievements_str = achievements_summary or achievements_basic

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
                # === Achievement fields - 3 LEVELS ===
                # Default: Summary format (from detailed_achievements)
                "achievements": achievements_str,
                # 1. Basic: metric_name: metric_value (from ProjectAchievement)
                "achievements_basic": achievements_basic,
                "achievements_basic_list": achievements_basic_list,
                # 2. Summary: Titles grouped by category (from detailed_achievements) - DEFAULT
                "achievements_summary": achievements_summary,
                "achievements_summary_list": achievements_summary_list,
                # 3. Detailed: Full title + description (from detailed_achievements)
                "achievements_detailed": achievements_detailed,
                "achievements_detailed_list": achievements_detailed_list,
                # Legacy compatibility
                "achievements_list": achievements_summary_list or achievements_basic_list,  # For template iteration
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

    async def _collect_credentials(self, user_id: int) -> Dict[str, List[Dict[str, Any]]]:
        """Collect all credentials (certifications, awards, education, publications) for a user"""

        # Get certifications
        cert_result = await self.db.execute(
            select(Certification).where(Certification.user_id == user_id)
            .order_by(Certification.display_order, Certification.issue_date.desc())
        )
        certifications = []
        for cert in cert_result.scalars().all():
            certifications.append({
                "name": cert.name,
                "issuer": cert.issuer or "",
                "issue_date": cert.issue_date.strftime("%Y.%m") if cert.issue_date else "",
                "expiry_date": cert.expiry_date.strftime("%Y.%m") if cert.expiry_date else "",
                "credential_id": cert.credential_id or "",
                "credential_url": cert.credential_url or "",
                "description": cert.description or "",
            })

        # Get awards
        award_result = await self.db.execute(
            select(Award).where(Award.user_id == user_id)
            .order_by(Award.display_order, Award.award_date.desc())
        )
        awards = []
        for award in award_result.scalars().all():
            awards.append({
                "name": award.name,
                "issuer": award.issuer or "",
                "award_date": award.award_date.strftime("%Y.%m") if award.award_date else "",
                "description": award.description or "",
                "award_url": award.award_url or "",
            })

        # Get educations
        edu_result = await self.db.execute(
            select(Education).where(Education.user_id == user_id)
            .order_by(Education.display_order, Education.start_date.desc())
        )
        educations = []
        for edu in edu_result.scalars().all():
            # Format period
            start = edu.start_date.strftime("%Y.%m") if edu.start_date else ""
            if edu.is_current:
                period = f"{start} - 재학중" if start else "재학중"
            else:
                end = edu.end_date.strftime("%Y.%m") if edu.end_date else ""
                period = f"{start} - {end}" if start or end else ""

            educations.append({
                "school_name": edu.school_name,
                "major": edu.major or "",
                "degree": edu.degree or "",
                "start_date": start,
                "end_date": edu.end_date.strftime("%Y.%m") if edu.end_date else "",
                "period": period,
                "is_current": edu.is_current == 1,
                "gpa": edu.gpa or "",
                "description": edu.description or "",
            })

        # Get publications
        pub_result = await self.db.execute(
            select(Publication).where(Publication.user_id == user_id)
            .order_by(Publication.display_order, Publication.publication_date.desc())
        )
        publications = []
        for pub in pub_result.scalars().all():
            # Handle publication_date which can be date object or string
            pub_date = ""
            if pub.publication_date:
                if hasattr(pub.publication_date, 'strftime'):
                    pub_date = pub.publication_date.strftime("%Y.%m")
                else:
                    # Already a string
                    pub_date = str(pub.publication_date)
            publications.append({
                "title": pub.title,
                "authors": pub.authors or "",
                "publication_type": pub.publication_type or "",
                "publisher": pub.publisher or "",
                "publication_date": pub_date,
                "doi": pub.doi or "",
                "url": pub.url or "",
                "description": pub.description or "",
            })

        # Get volunteer activities
        activity_result = await self.db.execute(
            select(VolunteerActivity).where(VolunteerActivity.user_id == user_id)
            .order_by(VolunteerActivity.display_order, VolunteerActivity.start_date.desc())
        )
        volunteer_activities = []
        for activity in activity_result.scalars().all():
            # Format period
            start = activity.start_date.strftime("%Y.%m") if activity.start_date else ""
            if activity.is_current:
                period = f"{start} - 진행중" if start else "진행중"
            else:
                end = activity.end_date.strftime("%Y.%m") if activity.end_date else ""
                period = f"{start} - {end}" if start or end else ""

            volunteer_activities.append({
                "name": activity.name,
                "organization": activity.organization or "",
                "activity_type": activity.activity_type or "",
                "is_volunteer": activity.activity_type == "volunteer",
                "is_external": activity.activity_type == "external",
                "start_date": start,
                "end_date": activity.end_date.strftime("%Y.%m") if activity.end_date else "",
                "period": period,
                "is_current": activity.is_current == 1,
                "hours": activity.hours or 0,
                "role": activity.role or "",
                "description": activity.description or "",
                "certificate_url": activity.certificate_url or "",
            })

        return {
            "certifications": certifications,
            "awards": awards,
            "educations": educations,
            "publications": publications,
            "volunteer_activities": volunteer_activities,
        }
