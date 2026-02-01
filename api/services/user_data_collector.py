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

        # Get projects with technologies
        projects_result = await self.db.execute(
            select(Project).where(Project.user_id == user_id)
            .options(selectinload(Project.technologies).selectinload(ProjectTechnology.technology))
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

            proj = {
                "index": idx,
                "name": project.name,
                "company_name": company_name,
                "start_date": project.start_date.strftime("%Y.%m") if project.start_date else "",
                "end_date": project.end_date.strftime("%Y.%m") if project.end_date else "",
                "is_ongoing": is_ongoing,
                "description": project.description or "",
                "role": project.role or "",
                "technologies": ", ".join(tech_names) if tech_names else "",
                "team_size": project.team_size if hasattr(project, 'team_size') else "",
                "main_features": "",
                "achievements": "",
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
