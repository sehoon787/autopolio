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

    def __init__(self, db: AsyncSession, language: str = "ko"):
        self.db = db
        self.language = language

    def _format_date(self, d: Optional[date]) -> str:
        """Format date as YYYY.MM"""
        if not d:
            return "?"
        return d.strftime("%Y.%m")

    def _format_date_range(
        self, start: Optional[date], end: Optional[date], is_current: bool = False
    ) -> str:
        """Format date range"""
        from .report_strings import get_strings
        s = get_strings(self.language)
        start_str = self._format_date(start)
        if is_current or end is None:
            end_str = s["ongoing"]
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
            # Get repo analyses (all repos)
            analysis_result = await self.db.execute(
                select(RepoAnalysis)
                .where(RepoAnalysis.project_id == project.id)
                .options(selectinload(RepoAnalysis.project_repository))
            )
            analyses = list(analysis_result.scalars().all())
            analysis = next(
                (a for a in analyses if a.project_repository and a.project_repository.is_primary),
                analyses[0] if analyses else None
            )

            # Get user edits for primary analysis
            edits = None
            if analysis:
                edits_result = await self.db.execute(
                    select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
                )
                edits = edits_result.scalar_one_or_none()

            # Build per-repo analysis list for multi-repo projects
            has_multi_repo = len(analyses) > 1
            all_analyses = []
            if has_multi_repo:
                for a in analyses:
                    label = ""
                    is_primary = False
                    if a.project_repository:
                        raw = a.project_repository.label or (a.git_url.split("/")[-1] if a.git_url else "")
                        label = raw.removesuffix(".git")
                        is_primary = bool(a.project_repository.is_primary)
                    elif a.git_url:
                        label = a.git_url.split("/")[-1].removesuffix(".git")

                    a_edits = None
                    a_edits_result = await self.db.execute(
                        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == a.id)
                    )
                    a_edits = a_edits_result.scalar_one_or_none()

                    all_analyses.append({
                        "analysis": a,
                        "edits": a_edits,
                        "label": label,
                        "is_primary": is_primary,
                    })

            company = companies.get(project.company_id)

            result.append({
                "project": project,
                "analysis": analysis,
                "edits": edits,
                "company": company,
                "has_multi_repo": has_multi_repo,
                "all_analyses": all_analyses,
            })

        return result, user

    def _categorize_projects_by_tech(
        self, projects_data: List[Dict[str, Any]]
    ) -> Dict[str, List[str]]:
        """Categorize projects by their technology stack"""
        from .report_strings import get_strings
        s = get_strings(self.language)
        categories = {
            s["category_backend"]: [],
            s["category_frontend"]: [],
            s["category_mobile"]: [],
            s["category_ai_ml"]: [],
            s["category_iot"]: [],
            s["category_other"]: [],
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
                categories[s["category_backend"]].append(project.name)
                categorized = True
            if techs & frontend_techs:
                categories[s["category_frontend"]].append(project.name)
                categorized = True
            if techs & mobile_techs:
                categories[s["category_mobile"]].append(project.name)
                categorized = True
            if techs & ai_techs:
                categories[s["category_ai_ml"]].append(project.name)
                categorized = True
            if techs & iot_techs:
                categories[s["category_iot"]].append(project.name)
                categorized = True
            if not categorized:
                categories[s["category_other"]].append(project.name)

        return categories
