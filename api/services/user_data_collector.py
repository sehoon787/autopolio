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
        data["experiences"] = self._build_experiences(companies)

        project_list, all_technologies = self._build_projects(projects, companies)
        data["projects"] = project_list
        data["skills"] = list(all_technologies)
        data["skills_categorized"] = self._categorize_skills(all_technologies)

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

    def _build_experiences(self, companies: List[Company]) -> List[Dict[str, Any]]:
        """Build experiences from companies"""
        experiences = []
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
                "key_tasks": key_tasks_str,
                "key_tasks_list": key_tasks,  # For template iteration
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
