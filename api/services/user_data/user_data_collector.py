"""
User Data Collector - Collect user data from database for template rendering
"""

from typing import Dict, Any, List, Optional
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.user import User
from api.models.company import Company
from api.models.project import Project, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits

from .user_data_credentials import collect_credentials
from .user_data_skills import (
    categorize_skills,
    group_projects_by_company,
    categorize_skills_by_domain_detailed,
    project_matches_domain,
)
from .user_data_projects import build_projects
from api.services.core.domain_constants import DOMAIN_CATEGORIES


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

        project_list, all_technologies = build_projects(projects, companies)
        data["projects"] = project_list
        data["skills"] = list(all_technologies)
        data["skills_categorized"] = categorize_skills(all_technologies)

        # Build experiences with domain-categorized skills
        company_projects = group_projects_by_company(project_list)
        data["experiences"] = self._build_experiences(companies, company_projects)

        # Build capabilities (역량) from personal projects (projects without company)
        personal_projects = [p for p in project_list if not p.get("company_name")]
        data["capabilities"] = self._build_capabilities(personal_projects)
        data["has_capabilities"] = len(data["capabilities"]) > 0
        data["has_experiences"] = len(data["experiences"]) > 0

        # Collect credentials (certifications, awards, education, publications)
        credentials = await collect_credentials(self.db, user_id)
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
        skills_by_domain = categorize_skills_by_domain_detailed(personal_projects)

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
                            if project_matches_domain(p, domain_item.get("domain_name", ""))],
            }
            capabilities.append(cap)

        return capabilities

    def _build_experiences(
        self,
        companies: List[Company],
        company_projects: Optional[Dict[str, List[Dict[str, Any]]]] = None
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
            skills_by_domain = categorize_skills_by_domain_detailed(company_projs)

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
