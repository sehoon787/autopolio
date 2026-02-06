"""
Export Sections - Project section generation for different report styles.

Extracted from export_service.py for better modularity.
Contains methods for generating project sections in summary, detailed, and final formats.
"""
from typing import List, Dict, Any, Optional
from datetime import date

from api.models.achievement import ProjectAchievement


# Code contribution keywords to filter out (not a real achievement)
CODE_CONTRIBUTION_KEYWORDS = ["코드 기여", "Code Contribution", "code contribution"]


def filter_achievements(achievements: List[ProjectAchievement]) -> List[ProjectAchievement]:
    """Filter out code contribution achievements (lines added/deleted is not a real achievement)."""
    if not achievements:
        return []
    return [
        a for a in achievements
        if not any(kw in (a.metric_name or "") for kw in CODE_CONTRIBUTION_KEYWORDS)
    ]


class ExportSectionGenerator:
    """Generate project sections for export reports."""

    def __init__(self, base_service):
        """
        Args:
            base_service: ReportBaseService instance with helper methods
        """
        self._base = base_service

    def _format_date_range(self, start_date: Optional[date], end_date: Optional[date]) -> str:
        """Format date range as string."""
        if start_date and end_date:
            return f"{start_date.strftime('%Y.%m')} ~ {end_date.strftime('%Y.%m')}"
        elif start_date:
            return f"{start_date.strftime('%Y.%m')} ~ 현재"
        elif end_date:
            return f"~ {end_date.strftime('%Y.%m')}"
        return "기간 미정"

    def generate_toc(self, projects_data: List[Dict]) -> str:
        """Generate table of contents."""
        lines = ["## 목차", ""]
        lines.append("1. [전체 프로젝트 개요](#전체-프로젝트-개요)")

        for idx, data in enumerate(projects_data, 2):
            project = data["project"]
            anchor = self._base._make_anchor(project.name)
            lines.append(f"{idx}. [{project.name}](#{anchor})")

        lines.append("")
        return "\n".join(lines)

    def generate_overview_table(self, projects_data: List[Dict], user: Any) -> str:
        """Generate overview statistics table."""
        categories = self._base._categorize_projects_by_tech(projects_data)

        lines = [
            "## 전체 프로젝트 개요",
            "",
            "### 프로젝트 포트폴리오 통계",
            "",
            "| 분류 | 프로젝트 수 | 주요 기술 스택 |",
            "|------|------------|--------------| ",
        ]

        for cat_name, cat_projects in categories.items():
            if cat_projects:
                main_techs = []
                for data in projects_data:
                    if data["project"].name in cat_projects:
                        if data["project"].technologies:
                            main_techs.extend([
                                pt.technology.name for pt in data["project"].technologies
                                if pt.technology
                            ])
                main_techs = list(set(main_techs))[:3]
                tech_str = ", ".join(main_techs) if main_techs else "-"
                lines.append(f"| **{cat_name}** | {len(cat_projects)} | {tech_str} |")

        lines.append(f"| **총계** | **{len(projects_data)}** | **다양한 기술 스택** |")
        lines.append("")
        return "\n".join(lines)

    def generate_project_section_summary(
        self,
        data: Dict,
        idx: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate a summary project section with key tasks and achievements (요약 형식)."""
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")

        lines = [
            "---",
            "",
            f"## {idx}. {project.name}",
        ]

        # Key tasks section
        key_tasks = self._base._get_effective_key_tasks(analysis, edits)
        implementation_details = self._base._get_effective_implementation_details(analysis, edits)

        all_tasks = key_tasks if isinstance(key_tasks, list) and key_tasks else (
            implementation_details if isinstance(implementation_details, list) else []
        )

        if all_tasks:
            lines.append("### 1. 주요 수행 업무")
            for i, task in enumerate(all_tasks, 1):
                if isinstance(task, dict):
                    task_str = task.get("title", str(task))
                else:
                    task_str = str(task)
                lines.append(f"({i}) {task_str}")
            lines.append("")

        # Achievements section
        detailed_achievements = self._base._get_effective_detailed_achievements(analysis, edits)
        achievements = filter_achievements(project.achievements)

        has_achievements = (detailed_achievements and isinstance(detailed_achievements, dict)) or bool(achievements)
        if has_achievements:
            lines.append("### 2. 프로젝트 성과")
            lines.append("")

            if detailed_achievements and isinstance(detailed_achievements, dict):
                self._append_detailed_achievements(lines, detailed_achievements)
            elif achievements:
                self._append_achievements_by_category(lines, achievements)

        # Code statistics (if available and requested)
        if include_code_stats and analysis:
            lines.append("### 3. 코드 기여 통계")
            lines.append("")
            lines.append(f"- **총 커밋**: {analysis.total_commits or 0}개")
            lines.append(f"- **사용자 커밋**: {analysis.user_commits or 0}개")
            if analysis.total_commits and analysis.total_commits > 0:
                contribution = round((analysis.user_commits or 0) / analysis.total_commits * 100, 1)
                lines.append(f"- **기여율**: {contribution}%")
            lines.append(f"- **추가된 라인**: {analysis.lines_added or 0}")
            lines.append(f"- **삭제된 라인**: {analysis.lines_deleted or 0}")
            lines.append("")

        lines.append("")
        return "\n".join(lines)

    def generate_project_section_detailed(
        self,
        data: Dict,
        idx: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate a detailed project section (상세 형식) - DETAILED_COMPLETION_REPORT style."""
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")

        lines = [
            "---",
            "",
            f"## {idx}. {project.name}",
        ]

        # Project Overview
        lines.append("### 프로젝트 개요")
        if project.git_url:
            repo_name = project.git_url.split("/")[-1].replace(".git", "") if project.git_url else project.name
            lines.append(f"- **저장소**: {repo_name}")
            lines.append(f"- **GitHub**: {project.git_url}")
        if include_code_stats and analysis:
            lines.append(f"- **커밋**: {analysis.total_commits or 0}개")
        lines.append(f"- **기간**: {self._format_date_range(project.start_date, project.end_date)}")
        if include_code_stats and analysis:
            lines.append(f"- **코드 변경량**: {analysis.lines_added or 0:,} 라인 추가, {analysis.lines_deleted or 0:,} 라인 삭제")
        if project.description:
            lines.append(f"- **프로젝트 성격**: {project.description[:100]}")
        lines.append("")

        # Technology Stack
        lines.append("### 기술 스택")
        if project.technologies:
            tech_by_category = {}
            for pt in project.technologies:
                if pt.technology:
                    category = pt.technology.category or "기타"
                    if category not in tech_by_category:
                        tech_by_category[category] = []
                    tech_by_category[category].append(pt.technology.name)

            for category, techs in tech_by_category.items():
                techs_str = ", ".join(techs)
                lines.append(f"- **{category}**: {techs_str}")
        else:
            lines.append("- 기술 스택 정보 없음")
        lines.append("")

        # Implementation Details
        implementation_details = self._base._get_effective_implementation_details(analysis, edits)
        if implementation_details:
            lines.append("### 주요 구현 기능")
            lines.append("")
            if isinstance(implementation_details, list) and implementation_details:
                first_elem = implementation_details[0]
                if isinstance(first_elem, dict) and "title" in first_elem:
                    for detail in implementation_details:
                        if isinstance(detail, dict):
                            title = detail.get("title", "")
                            items = detail.get("items", [])
                            lines.append(f"#### {title}")
                            if isinstance(items, list):
                                for item in items:
                                    lines.append(f"- {item}")
                            lines.append("")
                        else:
                            lines.append(f"- {detail}")
                else:
                    for i, detail in enumerate(implementation_details, 1):
                        lines.append(f"#### {i}. {detail}")
            lines.append("")

        # Development Timeline
        if analysis and analysis.commit_messages_summary:
            lines.append("### 개발 타임라인")
            lines.append("")
            summary = analysis.commit_messages_summary
            try:
                if isinstance(summary, dict) and "timeline" in summary:
                    timeline = summary["timeline"]
                    if isinstance(timeline, dict):
                        for period, desc in timeline.items():
                            lines.append(f"**{period}**")
                            if isinstance(desc, list):
                                for item in desc:
                                    lines.append(f"- {item}")
                            else:
                                lines.append(f"- {desc}")
                            lines.append("")
                elif isinstance(summary, str):
                    lines.append(summary)
                    lines.append("")
            except Exception:
                pass

        # Achievements
        detailed_achievements = self._base._get_effective_detailed_achievements(analysis, edits)
        achievements = filter_achievements(project.achievements)

        if detailed_achievements or achievements:
            lines.append("### 주요 성과")
            lines.append("")

            if detailed_achievements and isinstance(detailed_achievements, dict):
                self._append_detailed_achievements_with_before_after(lines, detailed_achievements)
            elif achievements:
                self._append_achievements_by_category(lines, achievements)

        lines.append("")
        return "\n".join(lines)

    def generate_project_section_final(
        self,
        data: Dict,
        idx: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate a final project section (상세 요약 형식) - FINAL_PROJECT_REPORT style."""
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")

        lines = [
            "---",
            "",
            f"## {idx}. {project.name}",
        ]

        # Compact project overview
        lines.append("### 프로젝트 개요")
        if project.git_url:
            lines.append(f"- **GitHub**: {project.git_url}")
        lines.append(f"- **기간**: {self._format_date_range(project.start_date, project.end_date)}")
        if include_code_stats and analysis:
            lines.append(f"- **커밋**: {analysis.total_commits or 0}개 | **코드 변경**: +{analysis.lines_added or 0:,} / -{analysis.lines_deleted or 0:,}")
        if project.description:
            lines.append(f"- **소개**: {project.description[:150]}")
        lines.append("")

        # Technology Stack (compact)
        if project.technologies:
            tech_names = [pt.technology.name for pt in project.technologies if pt.technology][:10]
            if tech_names:
                lines.append(f"**기술 스택**: {', '.join(tech_names)}")
                lines.append("")

        # Key Implementation Features (limited)
        implementation_details = self._base._get_effective_implementation_details(analysis, edits)
        if implementation_details:
            lines.append("### 주요 구현 기능")
            if isinstance(implementation_details, list) and implementation_details:
                first_elem = implementation_details[0]
                if isinstance(first_elem, dict) and "title" in first_elem:
                    for detail in implementation_details[:3]:
                        if isinstance(detail, dict):
                            title = detail.get("title", "")
                            items = detail.get("items", [])
                            if isinstance(items, list):
                                items = items[:3]
                            else:
                                items = []
                            lines.append(f"**{title}**")
                            for item in items:
                                lines.append(f"- {item}")
                        else:
                            lines.append(f"- {detail}")
                else:
                    for i, detail in enumerate(implementation_details[:5], 1):
                        lines.append(f"- {detail}")
            lines.append("")

        # Key Tasks
        key_tasks = self._base._get_effective_key_tasks(analysis, edits)
        if key_tasks and isinstance(key_tasks, list):
            lines.append("### 주요 수행 업무")
            for i, task in enumerate(key_tasks[:8], 1):
                lines.append(f"({i}) {task}")
            lines.append("")

        # Achievements (compact)
        detailed_achievements = self._base._get_effective_detailed_achievements(analysis, edits)
        achievements = filter_achievements(project.achievements)

        if detailed_achievements or achievements:
            lines.append("### 성과")
            if detailed_achievements and isinstance(detailed_achievements, dict):
                for category, items in list(detailed_achievements.items())[:3]:
                    lines.append(f"**{category}**")
                    if isinstance(items, list):
                        for item in items[:2]:
                            if isinstance(item, dict):
                                title = item.get("title", "")
                                description = item.get("description", "")
                                lines.append(f"- {title}: {description}" if description else f"- {title}")
                            else:
                                lines.append(f"- {item}")
                    lines.append("")
            elif achievements:
                for ach in achievements[:5]:
                    if ach.metric_value:
                        lines.append(f"- **{ach.metric_name}**: {ach.metric_value}")
                    else:
                        lines.append(f"- **{ach.metric_name}**")
                lines.append("")

        lines.append("")
        return "\n".join(lines)

    def _append_detailed_achievements(self, lines: List[str], detailed_achievements: Dict) -> None:
        """Append detailed achievements (from LLM) to lines."""
        for category, items in detailed_achievements.items():
            lines.append(f"#### {category}")
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        title = item.get("title", "")
                        description = item.get("description", "")
                        before = item.get("before", "")
                        after = item.get("after", "")

                        lines.append(f"**[ {title} ]**")
                        if description:
                            lines.append(f"- {description}")
                        if before and after:
                            lines.append(f"  - 기존: {before}")
                            lines.append(f"  - 개선: {after}")
                    else:
                        lines.append(f"- {item}")
            lines.append("")

    def _append_detailed_achievements_with_before_after(
        self,
        lines: List[str],
        detailed_achievements: Dict
    ) -> None:
        """Append detailed achievements with before/after format."""
        for category, items in detailed_achievements.items():
            lines.append(f"#### {category}")
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        title = item.get("title", "")
                        description = item.get("description", "")
                        before = item.get("before", "")
                        after = item.get("after", "")

                        lines.append(f"- **{title}**")
                        if description:
                            lines.append(f"  - {description}")
                        if before and after:
                            lines.append(f"  - 기존: {before} → 개선: {after}")
                    else:
                        lines.append(f"- {item}")
            lines.append("")

    def _append_achievements_by_category(
        self,
        lines: List[str],
        achievements: List[ProjectAchievement]
    ) -> None:
        """Append achievements grouped by category."""
        by_category: Dict[str, List[ProjectAchievement]] = {}
        for ach in achievements:
            cat = ach.category or "기타 성과"
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(ach)

        for category, achs in by_category.items():
            lines.append(f"#### {category}")
            for ach in achs:
                if ach.metric_value:
                    lines.append(f"- **{ach.metric_name}**: {ach.metric_value}")
                else:
                    lines.append(f"- **{ach.metric_name}**")
                if ach.description:
                    lines.append(f"  - {ach.description}")
            lines.append("")
