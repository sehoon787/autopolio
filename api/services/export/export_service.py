"""
Export Service - Generate project reports in various formats.

Facade for export functionality. Delegates to specialized modules:
- export_sections.py: Project section generation
- export_docx_converter.py: Markdown to DOCX conversion
"""
import re
import os
from typing import List, Dict, Any, Optional
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.user import User
from api.models.company import Company
from api.models.project import Project, ProjectTechnology
from api.models.achievement import ProjectAchievement
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from api.services.report.report_base import ReportBaseService
from api.services.report.report_strings import get_strings
from api.services.docx.docx_styles import DocxStyler, DocxStyleConfig, DEFAULT_DOCX_STYLE
from .export_sections import ExportSectionGenerator, filter_achievements
from .export_docx_converter import convert_markdown_to_docx
from api.config import get_settings

settings = get_settings()


class ExportService(ReportBaseService):
    """Service for exporting project reports to Markdown and Word formats."""

    def __init__(self, db: AsyncSession, style_config: Optional[DocxStyleConfig] = None, language: str = "ko"):
        super().__init__(db)
        self.result_dir = settings.result_dir
        self.language = language
        self.styler = DocxStyler(style_config or DEFAULT_DOCX_STYLE)
        self._section_gen = ExportSectionGenerator(self, language=language)

    # ==========================================================================
    # Report Header Generation
    # ==========================================================================

    def _generate_report_header(self, projects_data: List[Dict], user: Any, report_title: str) -> List[str]:
        """Generate common report header."""
        s = get_strings(self.language)
        total_commits = sum(
            data["analysis"].total_commits if data["analysis"] else 0
            for data in projects_data
        )

        start_dates = [
            data["project"].start_date
            for data in projects_data
            if data["project"].start_date
        ]
        end_dates = [
            data["project"].end_date
            for data in projects_data
            if data["project"].end_date
        ]

        earliest = min(start_dates) if start_dates else None
        latest = max(end_dates) if end_dates else None

        lines = [
            f"# {report_title}",
            "",
            f"**{s['report_date']}**: {datetime.now().strftime('%Y-%m-%d')}",
            f"**{s['report_target']}**: {s['report_target_value'].format(count=len(projects_data))}",
            f"**{s['report_total_commits']}**: {total_commits:,}",
        ]

        if earliest:
            period = f"{earliest.strftime('%Y-%m-%d')} ~ "
            if latest:
                period += latest.strftime('%Y-%m-%d')
            else:
                period += s["date_ongoing"]
            lines.append(f"**{s['report_period']}**: {period}")

        if user.github_username:
            lines.append(f"**{s['report_analyst']}**: {user.github_username}")

        lines.extend(["", "---", ""])
        return lines

    # ==========================================================================
    # Report Generation (using ExportSectionGenerator)
    # ==========================================================================

    async def generate_summary_report(
        self,
        user_id: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate summary report (요약) - PROJECT_PERFORMANCE_SUMMARY.md style."""
        s = get_strings(self.language)
        projects_data, user = await self._get_analyzed_projects(user_id)

        if not projects_data:
            return f"# {s['report_summary_title']}\n\n{s['report_summary_empty']}"

        lines = self._generate_report_header(projects_data, user, s["report_summary_title"])
        lines.append(self._section_gen.generate_toc(projects_data))
        lines.append("---")
        lines.append("")
        lines.append(self._section_gen.generate_overview_table(projects_data, user))
        lines.append("---")
        lines.append("")

        for idx, data in enumerate(projects_data, 1):
            lines.append(self._section_gen.generate_project_section_summary(data, idx, include_code_stats))

        return "\n".join(lines)

    async def generate_detailed_report(
        self,
        user_id: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate detailed report (상세) - DETAILED_COMPLETION_REPORT style."""
        s = get_strings(self.language)
        projects_data, user = await self._get_analyzed_projects(user_id)

        if not projects_data:
            return f"# {s['report_detailed_title']}\n\n{s['report_detailed_empty']}"

        lines = self._generate_report_header(projects_data, user, s["report_detailed_title"])
        lines.append(self._section_gen.generate_toc(projects_data))
        lines.append("---")
        lines.append("")
        lines.append(self._section_gen.generate_overview_table(projects_data, user))
        lines.append("---")
        lines.append("")

        for idx, data in enumerate(projects_data, 1):
            lines.append(self._section_gen.generate_project_section_detailed(data, idx, include_code_stats))

        return "\n".join(lines)

    async def generate_final_report(
        self,
        user_id: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate final report (상세 요약) - FINAL_PROJECT_REPORT style."""
        s = get_strings(self.language)
        projects_data, user = await self._get_analyzed_projects(user_id)

        if not projects_data:
            return f"# {s['report_final_title']}\n\n{s['report_final_empty']}"

        lines = self._generate_report_header(projects_data, user, s["report_final_title"])
        lines.append(self._section_gen.generate_toc(projects_data))
        lines.append("---")
        lines.append("")
        lines.append(self._section_gen.generate_overview_table(projects_data, user))
        lines.append("---")
        lines.append("")

        for idx, data in enumerate(projects_data, 1):
            lines.append(self._section_gen.generate_project_section_final(data, idx, include_code_stats))

        return "\n".join(lines)

    async def generate_performance_summary_report(
        self,
        user_id: int,
        include_code_stats: bool = False
    ) -> str:
        """Alias for generate_summary_report (backward compatibility)."""
        return await self.generate_summary_report(user_id, include_code_stats)

    # ==========================================================================
    # Export to Markdown
    # ==========================================================================

    async def export_to_markdown(
        self,
        user_id: int,
        report_type: str = "summary",
        include_code_stats: bool = False
    ) -> tuple[str, str]:
        """Export report to Markdown file."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        if report_type == "detailed":
            content = await self.generate_detailed_report(user_id, include_code_stats)
            filename = f"PROJECT_DETAILED_REPORT_{timestamp}.md"
        elif report_type == "final":
            content = await self.generate_final_report(user_id, include_code_stats)
            filename = f"PROJECT_FINAL_REPORT_{timestamp}.md"
        else:
            content = await self.generate_summary_report(user_id, include_code_stats)
            filename = f"PROJECT_SUMMARY_REPORT_{timestamp}.md"

        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        return str(file_path), content

    # ==========================================================================
    # Export to DOCX
    # ==========================================================================

    async def export_to_docx(
        self,
        user_id: int,
        report_type: str = "summary",
        include_code_stats: bool = False
    ) -> str:
        """Export report to Word document with proper styling."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        if report_type == "detailed":
            content = await self.generate_detailed_report(user_id, include_code_stats)
            filename = f"PROJECT_DETAILED_REPORT_{timestamp}.docx"
        elif report_type == "final":
            content = await self.generate_final_report(user_id, include_code_stats)
            filename = f"PROJECT_FINAL_REPORT_{timestamp}.docx"
        else:
            content = await self.generate_summary_report(user_id, include_code_stats)
            filename = f"PROJECT_SUMMARY_REPORT_{timestamp}.docx"

        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename

        doc = convert_markdown_to_docx(content, self.styler)
        doc.save(file_path)
        return str(file_path)

    # ==========================================================================
    # Preview
    # ==========================================================================

    async def get_export_preview(
        self,
        user_id: int,
        report_type: str = "summary",
        include_code_stats: bool = False
    ) -> Dict[str, Any]:
        """Get preview data for export."""
        projects_data, user = await self._get_analyzed_projects(user_id)

        if report_type == "detailed":
            content = await self.generate_detailed_report(user_id, include_code_stats)
        elif report_type == "final":
            content = await self.generate_final_report(user_id, include_code_stats)
        else:
            content = await self.generate_summary_report(user_id, include_code_stats)

        total_commits = sum(
            data["analysis"].total_commits if data["analysis"] else 0
            for data in projects_data
        )

        has_key_tasks = any(
            self._get_effective_key_tasks(data["analysis"], data.get("edits"))
            for data in projects_data
        )

        has_achievements = any(
            self._get_effective_detailed_achievements(data["analysis"], data.get("edits")) or
            len(filter_achievements(data["project"].achievements)) > 0
            for data in projects_data
        )

        return {
            "project_count": len(projects_data),
            "total_commits": total_commits,
            "has_key_tasks": has_key_tasks,
            "has_achievements": has_achievements,
            "preview": content[:2000] + "..." if len(content) > 2000 else content,
            "full_content": content,
        }

    # ==========================================================================
    # Single Project Export
    # ==========================================================================

    async def _get_single_project(self, project_id: int) -> Dict[str, Any]:
        """Get a single project with its data for export."""
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

        analysis_result = await self.db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        )
        analysis = analysis_result.scalars().first()

        edits = None
        if analysis:
            edits_result = await self.db.execute(
                select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
            )
            edits = edits_result.scalar_one_or_none()

        company = None
        if project.company_id:
            company_result = await self.db.execute(
                select(Company).where(Company.id == project.company_id)
            )
            company = company_result.scalar_one_or_none()

        user_result = await self.db.execute(
            select(User).where(User.id == project.user_id)
        )
        user = user_result.scalar_one_or_none()

        return {
            "project": project,
            "analysis": analysis,
            "edits": edits,
            "company": company,
            "user": user,
        }

    async def generate_single_project_report(
        self,
        project_id: int,
        report_type: str = "summary",
        include_code_stats: bool = False
    ) -> str:
        """Generate a report for a single project."""
        s = get_strings(self.language)
        data = await self._get_single_project(project_id)
        project = data["project"]
        user = data["user"]

        lines = [
            f"# {project.name}",
            "",
            f"**{s['report_date']}**: {datetime.now().strftime('%Y-%m-%d')}",
        ]

        if user and user.github_username:
            lines.append(f"**{s['report_analyst']}**: {user.github_username}")

        lines.extend(["", "---", ""])

        if report_type == "detailed":
            section = self._section_gen.generate_project_section_detailed(data, 1, include_code_stats)
        elif report_type == "final":
            section = self._section_gen.generate_project_section_final(data, 1, include_code_stats)
        else:
            section = self._section_gen.generate_project_section_summary(data, 1, include_code_stats)

        lines.append(section.replace("## 1. ", "## "))
        return "\n".join(lines)

    async def export_single_project_to_markdown(
        self,
        project_id: int,
        report_type: str = "summary",
        include_code_stats: bool = False
    ) -> tuple[str, str]:
        """Export single project report to Markdown file."""
        data = await self._get_single_project(project_id)
        project = data["project"]

        content = await self.generate_single_project_report(project_id, report_type, include_code_stats)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_name = re.sub(r'[^\w\s-]', '', project.name).strip().replace(' ', '_')[:30]
        filename = f"{safe_name}_{report_type}_{timestamp}.md"

        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        return str(file_path), content

    async def export_single_project_to_docx(
        self,
        project_id: int,
        report_type: str = "summary",
        include_code_stats: bool = False
    ) -> str:
        """Export single project report to Word document with proper styling."""
        data = await self._get_single_project(project_id)
        project = data["project"]

        content = await self.generate_single_project_report(project_id, report_type, include_code_stats)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_name = re.sub(r'[^\w\s-]', '', project.name).strip().replace(' ', '_')[:30]
        filename = f"{safe_name}_{report_type}_{timestamp}.docx"

        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename

        doc = convert_markdown_to_docx(content, self.styler)
        doc.save(file_path)
        return str(file_path)

    async def get_single_project_preview(
        self,
        project_id: int,
        report_type: str = "summary",
        include_code_stats: bool = False
    ) -> Dict[str, Any]:
        """Get preview data for single project export."""
        data = await self._get_single_project(project_id)
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")

        content = await self.generate_single_project_report(project_id, report_type, include_code_stats)

        total_commits = analysis.total_commits if analysis else 0
        has_key_tasks = bool(self._get_effective_key_tasks(analysis, edits))
        has_achievements = bool(
            self._get_effective_detailed_achievements(analysis, edits) or
            len(filter_achievements(project.achievements)) > 0
        )

        return {
            "project_id": project_id,
            "project_name": project.name,
            "total_commits": total_commits,
            "has_key_tasks": has_key_tasks,
            "has_achievements": has_achievements,
            "preview": content[:2000] + "..." if len(content) > 2000 else content,
            "full_content": content,
        }

    # ==========================================================================
    # Backward Compatibility - Delegated section methods
    # ==========================================================================

    def _generate_toc(self, projects_data: List[Dict]) -> str:
        """Generate table of contents (backward compatibility)."""
        return self._section_gen.generate_toc(projects_data)

    def _generate_overview_table(self, projects_data: List[Dict], user: Any) -> str:
        """Generate overview statistics table (backward compatibility)."""
        return self._section_gen.generate_overview_table(projects_data, user)

    def _generate_project_section_summary(
        self,
        data: Dict,
        idx: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate summary project section (backward compatibility)."""
        return self._section_gen.generate_project_section_summary(data, idx, include_code_stats)

    def _generate_project_section_detailed(
        self,
        data: Dict,
        idx: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate detailed project section (backward compatibility)."""
        return self._section_gen.generate_project_section_detailed(data, idx, include_code_stats)

    def _generate_project_section_final(
        self,
        data: Dict,
        idx: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate final project section (backward compatibility)."""
        return self._section_gen.generate_project_section_final(data, idx, include_code_stats)
