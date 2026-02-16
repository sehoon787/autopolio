"""
Export Sections - Project section generation for different report styles.

Extracted from export_service.py for better modularity.
Contains methods for generating project sections in summary, detailed, and final formats.
"""
from typing import List, Dict, Any, Optional
from datetime import date

from api.models.achievement import ProjectAchievement
from api.services.report.report_strings import get_strings


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

    def __init__(self, base_service, language: str = "ko"):
        """
        Args:
            base_service: ReportBaseService instance with helper methods
            language: Output language ("ko" or "en")
        """
        self._base = base_service
        self.language = language
        self._s = get_strings(language)

    def _format_date_range(self, start_date: Optional[date], end_date: Optional[date]) -> str:
        """Format date range as string."""
        if start_date and end_date:
            return f"{start_date.strftime('%Y.%m')} ~ {end_date.strftime('%Y.%m')}"
        elif start_date:
            return f"{start_date.strftime('%Y.%m')} ~ {self._s['date_ongoing']}"
        elif end_date:
            return f"~ {end_date.strftime('%Y.%m')}"
        return self._s["date_unspecified"]

    def generate_toc(self, projects_data: List[Dict]) -> str:
        """Generate table of contents."""
        s = self._s
        lines = [f"## {s['toc_title']}", ""]
        overview_anchor = self._base._make_anchor(s["toc_overview"])
        lines.append(f"1. [{s['toc_overview']}](#{overview_anchor})")

        for idx, data in enumerate(projects_data, 2):
            project = data["project"]
            anchor = self._base._make_anchor(project.name)
            lines.append(f"{idx}. [{project.name}](#{anchor})")

        lines.append("")
        return "\n".join(lines)

    def generate_overview_table(self, projects_data: List[Dict], user: Any) -> str:
        """Generate overview statistics table."""
        s = self._s
        categories = self._base._categorize_projects_by_tech(projects_data)

        lines = [
            f"## {s['overview_title']}",
            "",
            f"### {s['overview_stats_title']}",
            "",
            f"| {s['overview_col_category']} | {s['overview_col_count']} | {s['overview_col_tech']} |",
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

        lines.append(f"| **{s['overview_total']}** | **{len(projects_data)}** | **{s['overview_various_tech']}** |")
        lines.append("")
        return "\n".join(lines)

    def generate_project_section_summary(
        self,
        data: Dict,
        idx: int,
        include_code_stats: bool = False
    ) -> str:
        """Generate a summary project section with key tasks and achievements (요약 형식)."""
        s = self._s
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        has_multi_repo = data.get("has_multi_repo", False)
        all_analyses = data.get("all_analyses", [])

        lines = [
            "---",
            "",
            f"## {idx}. {project.name}",
        ]

        # Key tasks section
        if has_multi_repo and all_analyses:
            has_any_tasks = any(
                self._base._get_effective_key_tasks(ad["analysis"], ad["edits"])
                for ad in all_analyses
            )
            if has_any_tasks:
                lines.append(f"### 1. {s['section_key_tasks']}")
                self._append_per_repo_key_tasks(lines, all_analyses)
        else:
            key_tasks = self._base._get_effective_key_tasks(analysis, edits)
            implementation_details = self._base._get_effective_implementation_details(analysis, edits)

            all_tasks = key_tasks if isinstance(key_tasks, list) and key_tasks else (
                implementation_details if isinstance(implementation_details, list) else []
            )

            if all_tasks:
                lines.append(f"### 1. {s['section_key_tasks']}")
                for i, task in enumerate(all_tasks, 1):
                    if isinstance(task, dict):
                        task_str = task.get("title", str(task))
                    else:
                        task_str = str(task)
                    lines.append(f"({i}) {task_str}")
                lines.append("")

        # Achievements section
        if has_multi_repo and all_analyses:
            has_any_achievements = any(
                self._base._get_effective_detailed_achievements(ad["analysis"], ad["edits"])
                for ad in all_analyses
            ) or bool(filter_achievements(project.achievements))
            if has_any_achievements:
                lines.append(f"### 2. {s['section_achievements']}")
                lines.append("")
                self._append_per_repo_achievements(lines, all_analyses, project)
        else:
            detailed_achievements = self._base._get_effective_detailed_achievements(analysis, edits)
            achievements = filter_achievements(project.achievements)

            has_achievements = (detailed_achievements and isinstance(detailed_achievements, dict)) or bool(achievements)
            if has_achievements:
                lines.append(f"### 2. {s['section_achievements']}")
                lines.append("")

                if detailed_achievements and isinstance(detailed_achievements, dict):
                    self._append_detailed_achievements(lines, detailed_achievements)
                elif achievements:
                    self._append_achievements_by_category(lines, achievements)

        # Code statistics (if available and requested)
        if include_code_stats and analysis:
            lines.append(f"### 3. {s['section_code_stats']}")
            lines.append("")
            lines.append(f"- **{s['label_total_commits']}**: {analysis.total_commits or 0}")
            lines.append(f"- **{s['label_user_commits']}**: {analysis.user_commits or 0}")
            if analysis.total_commits and analysis.total_commits > 0:
                contribution = round((analysis.user_commits or 0) / analysis.total_commits * 100, 1)
                lines.append(f"- **{s['label_contribution_rate']}**: {contribution}%")
            lines.append(f"- **{s['label_added_lines']}**: {analysis.lines_added or 0}")
            lines.append(f"- **{s['label_deleted_lines']}**: {analysis.lines_deleted or 0}")
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
        s = self._s
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        has_multi_repo = data.get("has_multi_repo", False)
        all_analyses = data.get("all_analyses", [])

        lines = [
            "---",
            "",
            f"## {idx}. {project.name}",
        ]

        # Project Overview
        lines.append(f"### {s['section_project_overview']}")
        if project.git_url:
            repo_name = project.git_url.split("/")[-1].replace(".git", "") if project.git_url else project.name
            lines.append(f"- **{s['label_repository']}**: {repo_name}")
            lines.append(f"- **{s['label_github']}**: {project.git_url}")
        if include_code_stats and analysis:
            lines.append(f"- **{s['label_commits']}**: {analysis.total_commits or 0}")
        lines.append(f"- **{s['period']}**: {self._format_date_range(project.start_date, project.end_date)}")
        if include_code_stats and analysis:
            lines.append(f"- **{s['label_code_change']}**: {s['label_lines_added'].format(count=f'{analysis.lines_added or 0:,}')}, {s['label_lines_deleted'].format(count=f'{analysis.lines_deleted or 0:,}')}")
        if project.description:
            lines.append(f"- **{s['label_project_nature']}**: {project.description[:100]}")
        lines.append("")

        # Technology Stack
        lines.append(f"### {s['section_tech_stack']}")
        if project.technologies:
            tech_by_category = {}
            for pt in project.technologies:
                if pt.technology:
                    category = pt.technology.category or s.get("category_other", "Other")
                    if category not in tech_by_category:
                        tech_by_category[category] = []
                    tech_by_category[category].append(pt.technology.name)

            for category, techs in tech_by_category.items():
                techs_str = ", ".join(techs)
                lines.append(f"- **{category}**: {techs_str}")
        else:
            lines.append(f"- {s['no_tech_info']}")
        lines.append("")

        # Implementation Details (per-repo for multi-repo)
        if has_multi_repo and all_analyses:
            has_any_impl = any(
                self._base._get_effective_implementation_details(ad["analysis"], ad["edits"])
                for ad in all_analyses
            )
            if has_any_impl:
                lines.append(f"### {s['section_implementation']}")
                lines.append("")
                self._append_per_repo_implementation(lines, all_analyses)
        else:
            implementation_details = self._base._get_effective_implementation_details(analysis, edits)
            if implementation_details:
                lines.append(f"### {s['section_implementation']}")
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
            lines.append(f"### {s['section_timeline']}")
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

        # Achievements (per-repo for multi-repo)
        if has_multi_repo and all_analyses:
            has_any_achievements = any(
                self._base._get_effective_detailed_achievements(ad["analysis"], ad["edits"])
                for ad in all_analyses
            ) or bool(filter_achievements(project.achievements))
            if has_any_achievements:
                lines.append(f"### {s['section_main_achievements']}")
                lines.append("")
                self._append_per_repo_achievements(lines, all_analyses, project)
        else:
            detailed_achievements = self._base._get_effective_detailed_achievements(analysis, edits)
            achievements = filter_achievements(project.achievements)

            if detailed_achievements or achievements:
                lines.append(f"### {s['section_main_achievements']}")
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
        s = self._s
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        has_multi_repo = data.get("has_multi_repo", False)
        all_analyses = data.get("all_analyses", [])

        lines = [
            "---",
            "",
            f"## {idx}. {project.name}",
        ]

        # Compact project overview
        lines.append(f"### {s['section_project_overview']}")
        if project.git_url:
            lines.append(f"- **{s['label_github']}**: {project.git_url}")
        lines.append(f"- **{s['period']}**: {self._format_date_range(project.start_date, project.end_date)}")
        if include_code_stats and analysis:
            lines.append(f"- **{s['label_commits']}**: {analysis.total_commits or 0} | **{s['label_code_change']}**: +{analysis.lines_added or 0:,} / -{analysis.lines_deleted or 0:,}")
        if project.description:
            lines.append(f"- **{s['label_intro']}**: {project.description[:150]}")
        lines.append("")

        # Technology Stack (compact)
        if project.technologies:
            tech_names = [pt.technology.name for pt in project.technologies if pt.technology][:10]
            if tech_names:
                lines.append(f"**{s['section_tech_stack']}**: {', '.join(tech_names)}")
                lines.append("")

        # Key Implementation Features (per-repo for multi-repo)
        if has_multi_repo and all_analyses:
            has_any_impl = any(
                self._base._get_effective_implementation_details(ad["analysis"], ad["edits"])
                for ad in all_analyses
            )
            if has_any_impl:
                lines.append(f"### {s['section_implementation']}")
                self._append_per_repo_implementation(lines, all_analyses, limit=3)
        else:
            implementation_details = self._base._get_effective_implementation_details(analysis, edits)
            if implementation_details:
                lines.append(f"### {s['section_implementation']}")
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

        # Key Tasks (per-repo for multi-repo)
        if has_multi_repo and all_analyses:
            has_any_tasks = any(
                self._base._get_effective_key_tasks(ad["analysis"], ad["edits"])
                for ad in all_analyses
            )
            if has_any_tasks:
                lines.append(f"### {s['section_key_tasks']}")
                self._append_per_repo_key_tasks(lines, all_analyses, limit=8)
        else:
            key_tasks = self._base._get_effective_key_tasks(analysis, edits)
            if key_tasks and isinstance(key_tasks, list):
                lines.append(f"### {s['section_key_tasks']}")
                for i, task in enumerate(key_tasks[:8], 1):
                    lines.append(f"({i}) {task}")
                lines.append("")

        # Achievements (per-repo for multi-repo, compact)
        if has_multi_repo and all_analyses:
            has_any_achievements = any(
                self._base._get_effective_detailed_achievements(ad["analysis"], ad["edits"])
                for ad in all_analyses
            ) or bool(filter_achievements(project.achievements))
            if has_any_achievements:
                lines.append(f"### {s['section_performance']}")
                self._append_per_repo_achievements(lines, all_analyses, project, compact=True)
        else:
            detailed_achievements = self._base._get_effective_detailed_achievements(analysis, edits)
            achievements = filter_achievements(project.achievements)

            if detailed_achievements or achievements:
                lines.append(f"### {s['section_performance']}")
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
        s = self._s
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
                            lines.append(f"  - {s['label_before']}: {before}")
                            lines.append(f"  - {s['label_after']}: {after}")
                    else:
                        lines.append(f"- {item}")
            lines.append("")

    def _append_detailed_achievements_with_before_after(
        self,
        lines: List[str],
        detailed_achievements: Dict
    ) -> None:
        """Append detailed achievements with before/after format."""
        s = self._s
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
                            lines.append(f"  - {s['label_before']}: {before} → {s['label_after']}: {after}")
                    else:
                        lines.append(f"- {item}")
            lines.append("")

    def _append_achievements_by_category(
        self,
        lines: List[str],
        achievements: List[ProjectAchievement]
    ) -> None:
        """Append achievements grouped by category."""
        s = self._s
        by_category: Dict[str, List[ProjectAchievement]] = {}
        for ach in achievements:
            cat = ach.category or s["other_achievements"]
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

    # ==========================================================================
    # Per-Repo Helpers (multi-repo support)
    # ==========================================================================

    def _append_per_repo_key_tasks(
        self,
        lines: List[str],
        all_analyses: List[Dict],
        limit: int = 0
    ) -> None:
        """Append key tasks grouped by repo label for multi-repo projects."""
        for ad in all_analyses:
            label = ad.get("label", "")
            tasks = self._base._get_effective_key_tasks(ad["analysis"], ad["edits"])
            if not tasks or not isinstance(tasks, list):
                continue
            if limit:
                tasks = tasks[:limit]
            lines.append(f"#### [{label}]")
            for i, task in enumerate(tasks, 1):
                if isinstance(task, dict):
                    task_str = task.get("title", str(task))
                else:
                    task_str = str(task)
                lines.append(f"({i}) {task_str}")
            lines.append("")

    def _append_per_repo_achievements(
        self,
        lines: List[str],
        all_analyses: List[Dict],
        project: Any,
        compact: bool = False
    ) -> None:
        """Append achievements grouped by repo label for multi-repo projects."""
        for ad in all_analyses:
            label = ad.get("label", "")
            detailed = self._base._get_effective_detailed_achievements(ad["analysis"], ad["edits"])
            if not detailed or not isinstance(detailed, dict):
                continue
            lines.append(f"#### [{label}]")
            items_list = list(detailed.items())
            if compact:
                items_list = items_list[:3]
            for category, items in items_list:
                lines.append(f"**{category}**")
                if isinstance(items, list):
                    display_items = items[:2] if compact else items
                    for item in display_items:
                        if isinstance(item, dict):
                            title = item.get("title", "")
                            description = item.get("description", "")
                            if compact:
                                lines.append(f"- {title}: {description}" if description else f"- {title}")
                            else:
                                lines.append(f"- **{title}**")
                                if description:
                                    lines.append(f"  - {description}")
                        else:
                            lines.append(f"- {item}")
                lines.append("")

    def _append_per_repo_implementation(
        self,
        lines: List[str],
        all_analyses: List[Dict],
        limit: int = 0
    ) -> None:
        """Append implementation details grouped by repo label for multi-repo projects."""
        for ad in all_analyses:
            label = ad.get("label", "")
            impl = self._base._get_effective_implementation_details(ad["analysis"], ad["edits"])
            if not impl or not isinstance(impl, list):
                continue
            lines.append(f"#### [{label}]")
            display_impl = impl[:limit] if limit else impl
            if display_impl:
                first_elem = display_impl[0]
                if isinstance(first_elem, dict) and "title" in first_elem:
                    for detail in display_impl:
                        if isinstance(detail, dict):
                            title = detail.get("title", "")
                            items = detail.get("items", [])
                            if isinstance(items, list):
                                items = items[:3] if limit else items
                            else:
                                items = []
                            lines.append(f"**{title}**")
                            for item in items:
                                lines.append(f"- {item}")
                        else:
                            lines.append(f"- {detail}")
                else:
                    for detail in display_impl:
                        lines.append(f"- {detail}")
            lines.append("")
