"""
Report Base Service - Shared functionality for report generation services.

This module provides common methods used by ExportService and ReportService.
"""

import re
from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.user import User
from api.models.company import Company
from api.models.project import Project, ProjectTechnology
from api.models.achievement import ProjectAchievement
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits


class ReportBaseService:
    """Base service with common report generation utilities."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _format_date(self, d: Optional[date]) -> str:
        """Format date as YYYY.MM"""
        if not d:
            return "?"
        return d.strftime("%Y.%m")

    def _format_date_range(
        self, start: Optional[date], end: Optional[date], is_current: bool = False
    ) -> str:
        """Format date range"""
        start_str = self._format_date(start)
        if is_current or end is None:
            end_str = "진행중"
        else:
            end_str = self._format_date(end)
        return f"{start_str} ~ {end_str}"

    def _make_anchor(self, name: str) -> str:
        """Make GitHub-style anchor from project name"""
        anchor = name.lower()
        anchor = re.sub(r'[^\w\s가-힣-]', '', anchor)
        anchor = re.sub(r'\s+', '-', anchor)
        return anchor

    def _get_effective_key_tasks(self, analysis: Any, edits: Any) -> List[str]:
        """Get effective key_tasks (edited or original)"""
        if edits and edits.key_tasks_modified and edits.key_tasks is not None:
            return edits.key_tasks
        return analysis.key_tasks if analysis and analysis.key_tasks else []

    def _get_effective_implementation_details(self, analysis: Any, edits: Any) -> List[str]:
        """Get effective implementation_details (edited or original)"""
        if edits and edits.implementation_details_modified and edits.implementation_details is not None:
            return edits.implementation_details
        return analysis.implementation_details if analysis and analysis.implementation_details else []

    def _get_effective_detailed_achievements(self, analysis: Any, edits: Any) -> Dict:
        """Get effective detailed_achievements (edited or original)"""
        if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None:
            return edits.detailed_achievements
        return analysis.detailed_achievements if analysis and analysis.detailed_achievements else {}

    async def _get_user_data(self, user_id: int) -> Dict[str, Any]:
        """Get all user data for report generation"""
        # Get user
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Get companies
        companies_result = await self.db.execute(
            select(Company)
            .where(Company.user_id == user_id)
            .order_by(Company.start_date.desc())
        )
        companies = companies_result.scalars().all()

        # Get projects with technologies and achievements
        projects_result = await self.db.execute(
            select(Project)
            .where(Project.user_id == user_id)
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.achievements)
            )
            .order_by(Project.start_date.desc())
        )
        projects = projects_result.scalars().all()

        return {
            "user": user,
            "companies": companies,
            "projects": projects
        }

    async def _get_analyzed_projects(self, user_id: int) -> tuple[List[Dict[str, Any]], Any]:
        """Get all analyzed projects with their data"""
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
        )
        companies = {c.id: c for c in companies_result.scalars().all()}

        # Get analyzed projects
        projects_result = await self.db.execute(
            select(Project)
            .where(Project.user_id == user_id, Project.is_analyzed == True)
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.achievements)
            )
            .order_by(Project.start_date.desc())
        )
        projects = projects_result.scalars().all()

        result = []
        for project in projects:
            # Get repo analysis
            analysis_result = await self.db.execute(
                select(RepoAnalysis).where(RepoAnalysis.project_id == project.id)
            )
            analysis = analysis_result.scalar_one_or_none()

            # Get user edits if analysis exists
            edits = None
            if analysis:
                edits_result = await self.db.execute(
                    select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
                )
                edits = edits_result.scalar_one_or_none()

            company = companies.get(project.company_id)

            result.append({
                "project": project,
                "analysis": analysis,
                "edits": edits,
                "company": company,
            })

        return result, user

    def _categorize_projects_by_tech(
        self, projects_data: List[Dict[str, Any]]
    ) -> Dict[str, List[str]]:
        """Categorize projects by their technology stack"""
        categories = {
            "Backend 시스템": [],
            "Frontend": [],
            "Mobile": [],
            "AI/ML": [],
            "IoT/하드웨어": [],
            "기타": [],
        }

        backend_techs = {"FastAPI", "Django", "Flask", "Spring", "Spring Boot", "Express", "NestJS", "Node.js"}
        frontend_techs = {"React", "Vue", "Angular", "Next.js", "Nuxt.js", "Svelte"}
        mobile_techs = {"Flutter", "React Native", "Swift", "Kotlin", "Android", "iOS"}
        ai_techs = {"TensorFlow", "PyTorch", "scikit-learn", "LSTM", "Machine Learning", "Deep Learning", "OpenCV"}
        iot_techs = {"Arduino", "Raspberry Pi", "MQTT", "BLE", "Sensor", "IoT", "Embedded"}

        for data in projects_data:
            project = data["project"]
            techs = set()
            if project.technologies:
                techs = {pt.technology.name for pt in project.technologies if pt.technology}

            categorized = False
            if techs & backend_techs:
                categories["Backend 시스템"].append(project.name)
                categorized = True
            if techs & frontend_techs:
                categories["Frontend"].append(project.name)
                categorized = True
            if techs & mobile_techs:
                categories["Mobile"].append(project.name)
                categorized = True
            if techs & ai_techs:
                categories["AI/ML"].append(project.name)
                categorized = True
            if techs & iot_techs:
                categories["IoT/하드웨어"].append(project.name)
                categorized = True
            if not categorized:
                categories["기타"].append(project.name)

        return categories
