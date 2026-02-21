"""
ReportProjectService - Generate project-level report formats.

Handles individual project reports:
- Detailed technical analysis (DETAILED_COMPLETION_REPORT style)
- Final work/achievement summary (FINAL_PROJECT_REPORT style)
- Performance summary for a single project
"""

from typing import List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.project import Project, ProjectTechnology
from api.models.company import Company
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from .report_base import ReportBaseService
from .report_strings import get_strings


class ReportProjectService(ReportBaseService):
    """Service for generating project-level report formats"""

    def __init__(self, db: AsyncSession, language: str = "ko"):
        super().__init__(db, language=language)

    async def _get_project_with_analysis(self, project_id: int) -> Dict[str, Any]:
        """Get project data with repo analysis and user edits applied.

        For multi-repo projects, aggregates all repo analyses into a unified view.
        """
        from types import SimpleNamespace
        from api.services.analysis.analysis_aggregator import aggregate_analyses
        from api.models.project_repository import ProjectRepository
        from sqlalchemy.orm import selectinload as sinload

        # Get project with technologies and achievements
        project_result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.achievements)
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Get ALL repo analyses with their project_repository
        analysis_result = await self.db.execute(
            select(RepoAnalysis)
            .where(RepoAnalysis.project_id == project_id)
            .options(sinload(RepoAnalysis.project_repository))
        )
        analyses = list(analysis_result.scalars().all())

        # Determine primary analysis and aggregate if multi-repo
        analysis = None
        if analyses:
            primary = next(
                (a for a in analyses if a.project_repository and a.project_repository.is_primary),
                analyses[0]
            )
            if len(analyses) > 1:
                # Multi-repo: aggregate into a SimpleNamespace for attribute access
                agg = aggregate_analyses(analyses)
                analysis = SimpleNamespace(**agg)
            else:
                analysis = primary

        # Get user edits from primary analysis
        edits = None
        if analyses:
            primary_id = next(
                (a.id for a in analyses if a.project_repository and a.project_repository.is_primary),
                analyses[0].id
            )
            edits_result = await self.db.execute(
                select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == primary_id)
            )
            edits = edits_result.scalar_one_or_none()

        # Get company if exists
        company = None
        if project.company_id:
            company_result = await self.db.execute(
                select(Company).where(Company.id == project.company_id)
            )
            company = company_result.scalar_one_or_none()

        return {
            "project": project,
            "analysis": analysis,
            "edits": edits,
            "company": company
        }

    def _get_effective_key_tasks(self, analysis: Any, edits: Any) -> List:
        """Get effective key_tasks (edited or original)"""
        if edits and edits.key_tasks_modified and edits.key_tasks is not None:
            return edits.key_tasks
        return analysis.key_tasks if analysis else []

    def _get_effective_implementation_details(self, analysis: Any, edits: Any) -> List:
        """Get effective implementation_details (edited or original)"""
        if edits and edits.implementation_details_modified and edits.implementation_details is not None:
            return edits.implementation_details
        return analysis.implementation_details if analysis else []

    def _get_effective_detailed_achievements(self, analysis: Any, edits: Any) -> Dict:
        """Get effective detailed_achievements (edited or original)"""
        if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None:
            return edits.detailed_achievements
        return analysis.detailed_achievements if analysis else {}

    async def generate_detailed_report(self, project_id: int) -> Dict[str, Any]:
        """
        Generate DETAILED_COMPLETION_REPORT style - detailed technical analysis

        Returns structured data for:
        - Project overview (repository, commits, period, code changes)
        - Technology stack (with versions)
        - Key implemented features (based on commit message analysis)
        - Development timeline (based on commit history)
        - Key achievements (categorized)
        """
        data = await self._get_project_with_analysis(project_id)
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        company = data["company"]

        # Repository info
        repo_info = {
            "name": project.name,
            "git_url": project.git_url or "",
            "total_commits": analysis.total_commits if analysis else 0,
            "user_commits": analysis.user_commits if analysis else 0,
            "contribution_percent": round((analysis.user_commits / analysis.total_commits * 100), 1) if analysis and analysis.total_commits > 0 else 0,
            "lines_added": analysis.lines_added if analysis else 0,
            "lines_deleted": analysis.lines_deleted if analysis else 0,
            "net_lines": (analysis.lines_added or 0) - (analysis.lines_deleted or 0) if analysis else 0,
            "files_changed": analysis.files_changed if analysis else 0,
            "analyzed_at": analysis.analyzed_at.strftime("%Y-%m-%d %H:%M") if analysis and analysis.analyzed_at else None,
        }

        # Commit analysis
        commit_analysis = {
            "total_commits": analysis.total_commits if analysis else 0,
            "user_commits": analysis.user_commits if analysis else 0,
            "contribution_percent": repo_info["contribution_percent"],
            "categories": analysis.commit_categories if analysis else {},
            "messages_summary": analysis.commit_messages_summary if analysis else "",
        }

        # Code analysis
        code_analysis = {
            "lines_added": analysis.lines_added if analysis else 0,
            "lines_deleted": analysis.lines_deleted if analysis else 0,
            "net_change": repo_info["net_lines"],
            "files_changed": analysis.files_changed if analysis else 0,
        }

        # Languages
        languages = []
        if analysis and analysis.languages:
            for lang, percent in sorted(analysis.languages.items(), key=lambda x: x[1], reverse=True):
                languages.append({"name": lang, "percent": round(percent, 1)})

        # Technologies
        technologies = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []
        detected_technologies = analysis.detected_technologies if analysis else []

        # Architecture patterns
        architecture_patterns = analysis.architecture_patterns if analysis else []

        # Key tasks (use effective - edited or original)
        key_tasks = self._get_effective_key_tasks(analysis, edits)

        # Achievements by category
        s = get_strings(self.language)
        achievements_by_category: Dict[str, List[Dict]] = {}
        if project.achievements:
            for ach in project.achievements:
                category = ach.category or s["category_other"]
                if category not in achievements_by_category:
                    achievements_by_category[category] = []
                achievements_by_category[category].append({
                    "metric_name": ach.metric_name,
                    "metric_value": ach.metric_value,
                    "description": ach.description,
                    "before_value": getattr(ach, 'before_value', None),
                    "after_value": getattr(ach, 'after_value', None),
                })

        # LLM-generated detailed content (v1.2) - use effective content
        implementation_details = self._get_effective_implementation_details(analysis, edits)
        development_timeline = analysis.development_timeline if analysis else []
        tech_stack_versions = analysis.tech_stack_versions if analysis else {}
        detailed_achievements = self._get_effective_detailed_achievements(analysis, edits)

        return {
            "report_type": "detailed",
            "project": {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "role": project.role,
                "team_size": project.team_size,
                "start_date": self._format_date(project.start_date),
                "end_date": self._format_date(project.end_date) if project.end_date else s["ongoing"],
                "date_range": self._format_date_range(project.start_date, project.end_date),
            },
            "company": {
                "name": company.name if company else s["freelancer"],
                "position": company.position if company else None,
            } if company else None,
            "repository": repo_info,
            "commit_analysis": commit_analysis,
            "code_analysis": code_analysis,
            "languages": languages,
            "technologies": technologies,
            "detected_technologies": detected_technologies,
            "architecture_patterns": architecture_patterns,
            "key_tasks": key_tasks,
            "achievements_by_category": achievements_by_category,
            # LLM-generated detailed content (v1.2) - using effective content
            "implementation_details": implementation_details,
            "development_timeline": development_timeline,
            "tech_stack_versions": tech_stack_versions,
            "detailed_achievements": detailed_achievements,
        }

    async def generate_final_report(self, project_id: int, language: str = None) -> Dict[str, Any]:
        """
        Generate FINAL_PROJECT_REPORT style - work/achievement summary

        Returns structured data for:
        - Project overview (period, company, role, tech stack)
        - Key implementations (bullet points)
        - Achievements (Before/After comparison format)
        """
        s = get_strings(language or self.language)
        data = await self._get_project_with_analysis(project_id)
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        company = data["company"]

        # Overview
        overview = {
            "name": project.name,
            "date_range": self._format_date_range(project.start_date, project.end_date),
            "company": company.name if company else s["freelancer"],
            "role": project.role or s["developer"],
            "team_size": project.team_size,
            "description": project.description,
        }

        # Technologies
        technologies = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []

        # Key implementations (use effective - edited or original)
        effective_key_tasks = self._get_effective_key_tasks(analysis, edits)
        key_implementations = []
        if effective_key_tasks:
            key_implementations = effective_key_tasks
        elif analysis and analysis.commit_categories:
            # Generate from commit categories
            categories = analysis.commit_categories
            if categories.get("feature", 0) > 0:
                key_implementations.append(s["new_features"].format(count=categories['feature']))
            if categories.get("fix", 0) > 0:
                key_implementations.append(s["bug_fixes"].format(count=categories['fix']))
            if categories.get("refactor", 0) > 0:
                key_implementations.append(s["refactoring"].format(count=categories['refactor']))

        # Achievements with Before/After format
        achievements = []
        if project.achievements:
            for ach in project.achievements:
                achievement_data = {
                    "metric_name": ach.metric_name,
                    "metric_value": ach.metric_value,
                    "description": ach.description,
                }
                # Check if has before/after values
                if hasattr(ach, 'before_value') and ach.before_value:
                    achievement_data["before_value"] = ach.before_value
                if hasattr(ach, 'after_value') and ach.after_value:
                    achievement_data["after_value"] = ach.after_value
                achievements.append(achievement_data)

        # Code contribution summary
        code_contribution = None
        if analysis:
            net_lines = (analysis.lines_added or 0) - (analysis.lines_deleted or 0)
            code_contribution = {
                "lines_added": analysis.lines_added or 0,
                "lines_deleted": analysis.lines_deleted or 0,
                "net_lines": net_lines,
                "files_changed": analysis.files_changed or 0,
                "commits": analysis.user_commits or 0,
                "contribution_percent": round((analysis.user_commits / analysis.total_commits * 100), 1) if analysis.total_commits > 0 else 0,
            }

        # AI summary if available
        ai_summary = {
            "summary": project.ai_summary,
            "key_features": project.ai_key_features,
        } if project.ai_summary else None

        return {
            "report_type": "final",
            "overview": overview,
            "technologies": technologies,
            "key_implementations": key_implementations,
            "achievements": achievements,
            "code_contribution": code_contribution,
            "ai_summary": ai_summary,
        }

    async def generate_performance_summary_for_project(self, project_id: int) -> Dict[str, Any]:
        """
        Generate PROJECT_PERFORMANCE_SUMMARY style for a single project

        Returns structured data for:
        - Project basic info
        - Key tasks
        - Achievements (quantitative)
        - Commit/code statistics
        """
        data = await self._get_project_with_analysis(project_id)
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        company = data["company"]

        # Basic info
        basic_info = {
            "name": project.name,
            "date_range": self._format_date_range(project.start_date, project.end_date),
            "role": project.role or get_strings(self.language)["developer"],
            "team_size": project.team_size,
            "git_url": project.git_url,
        }

        # Technologies
        technologies = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []

        # Key tasks (use effective - edited or original)
        key_tasks = self._get_effective_key_tasks(analysis, edits)

        # Achievements
        achievements = []
        if project.achievements:
            for ach in project.achievements:
                achievements.append({
                    "metric_name": ach.metric_name,
                    "metric_value": ach.metric_value,
                    "description": ach.description,
                    "category": ach.category,
                })

        # Statistics
        commit_stats = None
        code_stats = None
        if analysis:
            commit_stats = {
                "total_commits": analysis.total_commits or 0,
                "user_commits": analysis.user_commits or 0,
                "contribution_percent": round((analysis.user_commits / analysis.total_commits * 100), 1) if analysis.total_commits > 0 else 0,
                "categories": analysis.commit_categories or {},
            }
            code_stats = {
                "lines_added": analysis.lines_added or 0,
                "lines_deleted": analysis.lines_deleted or 0,
                "files_changed": analysis.files_changed or 0,
            }

        return {
            "report_type": "performance_summary",
            "basic_info": basic_info,
            "company": company.name if company else get_strings(self.language)["freelancer"],
            "technologies": technologies,
            "key_tasks": key_tasks,
            "achievements": achievements,
            "commit_stats": commit_stats,
            "code_stats": code_stats,
        }
