"""
Export Sections (Detailed) - Detailed and final format project section generation.

Extracted from export_sections.py for file size management.
Contains standalone functions for generating detailed and final project sections.
These functions take the ExportSectionGenerator instance as the first argument.
"""

from typing import List, Dict

from .export_sections import filter_achievements


def generate_project_section_detailed(
    gen, data: Dict, idx: int, include_code_stats: bool = False
) -> str:
    """Generate a detailed project section (상세 형식) - DETAILED_COMPLETION_REPORT style.

    Args:
        gen: ExportSectionGenerator instance
        data: Project data dict
        idx: Project index number
        include_code_stats: Whether to include code statistics
    """
    s = gen._s
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
        repo_name = (
            project.git_url.split("/")[-1].replace(".git", "")
            if project.git_url
            else project.name
        )
        lines.append(f"- **{s['label_repository']}**: {repo_name}")
        lines.append(f"- **{s['label_github']}**: {project.git_url}")
    if include_code_stats and analysis:
        lines.append(f"- **{s['label_commits']}**: {analysis.total_commits or 0}")
    lines.append(
        f"- **{s['period']}**: {gen._format_date_range(project.start_date, project.end_date)}"
    )
    if include_code_stats and analysis:
        lines.append(
            f"- **{s['label_code_change']}**: {s['label_lines_added'].format(count=f'{analysis.lines_added or 0:,}')}, {s['label_lines_deleted'].format(count=f'{analysis.lines_deleted or 0:,}')}"
        )
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
            gen._base._get_effective_implementation_details(ad["analysis"], ad["edits"])
            for ad in all_analyses
        )
        if has_any_impl:
            lines.append(f"### {s['section_implementation']}")
            lines.append("")
            gen._append_per_repo_implementation(lines, all_analyses)
    else:
        implementation_details = gen._base._get_effective_implementation_details(
            analysis, edits
        )
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
            gen._base._get_effective_detailed_achievements(ad["analysis"], ad["edits"])
            for ad in all_analyses
        ) or bool(filter_achievements(project.achievements))
        if has_any_achievements:
            lines.append(f"### {s['section_main_achievements']}")
            lines.append("")
            gen._append_per_repo_achievements(lines, all_analyses, project)
    else:
        detailed_achievements = gen._base._get_effective_detailed_achievements(
            analysis, edits
        )
        achievements = filter_achievements(project.achievements)

        if detailed_achievements or achievements:
            lines.append(f"### {s['section_main_achievements']}")
            lines.append("")

            if detailed_achievements and isinstance(detailed_achievements, dict):
                append_detailed_achievements_with_before_after(
                    gen, lines, detailed_achievements
                )
            elif achievements:
                gen._append_achievements_by_category(lines, achievements)

    lines.append("")
    return "\n".join(lines)


def generate_project_section_final(
    gen, data: Dict, idx: int, include_code_stats: bool = False
) -> str:
    """Generate a final project section (상세 요약 형식) - FINAL_PROJECT_REPORT style.

    Args:
        gen: ExportSectionGenerator instance
        data: Project data dict
        idx: Project index number
        include_code_stats: Whether to include code statistics
    """
    s = gen._s
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
    lines.append(
        f"- **{s['period']}**: {gen._format_date_range(project.start_date, project.end_date)}"
    )
    if include_code_stats and analysis:
        lines.append(
            f"- **{s['label_commits']}**: {analysis.total_commits or 0} | **{s['label_code_change']}**: +{analysis.lines_added or 0:,} / -{analysis.lines_deleted or 0:,}"
        )
    if project.description:
        lines.append(f"- **{s['label_intro']}**: {project.description[:150]}")
    lines.append("")

    # Technology Stack (compact)
    if project.technologies:
        tech_names = [
            pt.technology.name for pt in project.technologies if pt.technology
        ][:10]
        if tech_names:
            lines.append(f"**{s['section_tech_stack']}**: {', '.join(tech_names)}")
            lines.append("")

    # Key Implementation Features (per-repo for multi-repo)
    if has_multi_repo and all_analyses:
        has_any_impl = any(
            gen._base._get_effective_implementation_details(ad["analysis"], ad["edits"])
            for ad in all_analyses
        )
        if has_any_impl:
            lines.append(f"### {s['section_implementation']}")
            gen._append_per_repo_implementation(lines, all_analyses, limit=3)
    else:
        implementation_details = gen._base._get_effective_implementation_details(
            analysis, edits
        )
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
            gen._base._get_effective_key_tasks(ad["analysis"], ad["edits"])
            for ad in all_analyses
        )
        if has_any_tasks:
            lines.append(f"### {s['section_key_tasks']}")
            gen._append_per_repo_key_tasks(lines, all_analyses, limit=8)
    else:
        key_tasks = gen._base._get_effective_key_tasks(analysis, edits)
        if key_tasks and isinstance(key_tasks, list):
            lines.append(f"### {s['section_key_tasks']}")
            for i, task in enumerate(key_tasks[:8], 1):
                lines.append(f"({i}) {task}")
            lines.append("")

    # Achievements (per-repo for multi-repo, compact)
    if has_multi_repo and all_analyses:
        has_any_achievements = any(
            gen._base._get_effective_detailed_achievements(ad["analysis"], ad["edits"])
            for ad in all_analyses
        ) or bool(filter_achievements(project.achievements))
        if has_any_achievements:
            lines.append(f"### {s['section_performance']}")
            gen._append_per_repo_achievements(
                lines, all_analyses, project, compact=True
            )
    else:
        detailed_achievements = gen._base._get_effective_detailed_achievements(
            analysis, edits
        )
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
                                lines.append(
                                    f"- {title}: {description}"
                                    if description
                                    else f"- {title}"
                                )
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


def append_detailed_achievements_with_before_after(
    gen, lines: List[str], detailed_achievements: Dict
) -> None:
    """Append detailed achievements with before/after format.

    Args:
        gen: ExportSectionGenerator instance
        lines: List of output lines to append to
        detailed_achievements: Dict of categorized achievements
    """
    s = gen._s
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
                        lines.append(
                            f"  - {s['label_before']}: {before} → {s['label_after']}: {after}"
                        )
                else:
                    lines.append(f"- {item}")
        lines.append("")
