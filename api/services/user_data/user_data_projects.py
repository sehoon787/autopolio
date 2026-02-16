"""
User Data Projects - Build project data for template rendering
"""

from typing import Dict, Any, List, Tuple
from collections import OrderedDict

from api.models.project import Project
from api.models.company import Company


def build_projects(
    projects: List[Project],
    companies: List[Company]
) -> Tuple[List[Dict[str, Any]], set]:
    """Build projects list and collect all technologies

    Args:
        projects: List of projects
        companies: List of companies

    Returns:
        Tuple of (project_list, all_technologies set)
    """
    project_list = []
    all_technologies = set()

    # Code contribution keywords to filter out (not a real achievement)
    code_stat_keywords = ["코드 기여", "Code Contribution", "code contribution"]

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

        # Extract data from RepoAnalysis if available (with user edits support)
        # For multi-repo projects, use the primary repo's analysis (via backward-compat property)
        key_tasks = []
        implementation_details = []
        detailed_achievements = []

        ra = project.repo_analysis  # backward-compat property: returns primary or first
        if ra:
            edits = ra.user_edits  # May be None if no edits exist

            # Get effective key_tasks (edited or original)
            effective_key_tasks = None
            if edits and edits.key_tasks_modified and edits.key_tasks is not None:
                effective_key_tasks = edits.key_tasks
            elif ra.key_tasks:
                effective_key_tasks = ra.key_tasks

            if effective_key_tasks:
                key_tasks = effective_key_tasks if isinstance(effective_key_tasks, list) else []

            # Get effective implementation_details (edited or original)
            effective_impl_details = None
            if edits and edits.implementation_details_modified and edits.implementation_details is not None:
                effective_impl_details = edits.implementation_details
            elif ra.implementation_details:
                effective_impl_details = ra.implementation_details

            if effective_impl_details:
                impl_details = effective_impl_details if isinstance(effective_impl_details, list) else []
                for detail in impl_details:
                    if isinstance(detail, dict):
                        title = detail.get("title", "")
                        items = detail.get("items", [])
                        if title or items:
                            implementation_details.append({
                                "title": title,
                                "items": items if isinstance(items, list) else []
                            })

            # Get effective detailed_achievements (edited or original)
            effective_detailed_achievements = None
            if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None:
                effective_detailed_achievements = edits.detailed_achievements
            elif ra.detailed_achievements:
                effective_detailed_achievements = ra.detailed_achievements

            if effective_detailed_achievements:
                achievements_data = effective_detailed_achievements if isinstance(effective_detailed_achievements, dict) else {}
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
        # Filter out code contribution achievements (lines added/deleted is not a real achievement)
        project_achievements = []
        if project.achievements:
            for ach in project.achievements:
                # Skip code contribution achievements
                if any(kw in (ach.metric_name or "") for kw in code_stat_keywords):
                    continue
                project_achievements.append({
                    "metric_name": ach.metric_name,
                    "metric_value": ach.metric_value,
                    "description": ach.description or "",
                    "before_value": ach.before_value or "",
                    "after_value": ach.after_value or "",
                    "category": ach.category or "",
                    "has_before_after": bool(ach.before_value or ach.after_value),
                    "has_description": bool(ach.description),
                })

        # Build achievement formats
        achievements_basic, achievements_basic_list = _build_achievements_basic(project_achievements)
        achievements_summary, achievements_summary_list, achievements_grouped = _build_achievements_summary(
            detailed_achievements, project_achievements, achievements_basic
        )
        achievements_detailed, achievements_detailed_list = _build_achievements_detailed(
            detailed_achievements, project_achievements
        )

        # DEFAULT: Use Summary format (요약)
        achievements_str = achievements_summary or achievements_basic

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
            # === Achievement fields - 3 LEVELS ===
            # Default: Summary format (from detailed_achievements)
            "achievements": achievements_str,
            # 1. Basic: metric_name: metric_value (from ProjectAchievement)
            "achievements_basic": achievements_basic,
            "achievements_basic_list": achievements_basic_list,
            # 2. Summary: Titles grouped by category (from detailed_achievements) - DEFAULT
            "achievements_summary": achievements_summary,
            "achievements_summary_list": achievements_summary_list,
            # 3. Detailed: Full title + description (from detailed_achievements)
            "achievements_detailed": achievements_detailed,
            "achievements_detailed_list": achievements_detailed_list,
            # 4. Grouped: category -> items[] for platform templates
            "achievements_grouped": achievements_grouped,
            # Legacy compatibility
            "achievements_list": achievements_summary_list or achievements_basic_list,  # For template iteration
            "has_achievements": bool(achievements_str),  # Boolean flag for Mustache
            "key_tasks": key_tasks_str,
            "key_tasks_list": key_tasks,  # For template iteration
            "has_key_tasks": len(key_tasks) > 0,  # Boolean flag for Mustache
            "implementation_details": implementation_details,  # For detailed rendering
            "git_url": project.git_url or "",
            # Multi-repo support: basic repo list
            "repositories": [
                {
                    "git_url": repo.git_url,
                    "label": repo.label or "",
                    "is_primary": bool(repo.is_primary),
                }
                for repo in (project.repositories or [])
            ],
            "has_multiple_repos": len(project.repositories or []) > 1,
            "repo_count": len(project.repositories or []),
        }

        # Per-repo analysis data (for multi-repo projects)
        repo_analyses_list = _build_per_repo_analyses(project, code_stat_keywords)
        proj["repo_analyses_list"] = repo_analyses_list
        proj["has_repo_analyses"] = len(repo_analyses_list) > 1

        project_list.append(proj)

    return project_list, all_technologies


def _build_achievements_basic(
    project_achievements: List[Dict[str, Any]]
) -> Tuple[str, List[Dict[str, Any]]]:
    """Build BASIC format: Simple metric_name: metric_value from ProjectAchievement"""
    achievements_basic_list = project_achievements
    achievements_basic = ""
    if project_achievements:
        achievements_basic = "\n".join([
            f"• {ach['metric_name']}: {ach['metric_value']}"
            for ach in project_achievements
        ])
    return achievements_basic, achievements_basic_list


def _build_achievements_summary(
    detailed_achievements: List[Dict[str, Any]],
    project_achievements: List[Dict[str, Any]],
    achievements_basic: str
) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Build SUMMARY format: Titles from detailed_achievements (grouped by category)

    Returns:
        Tuple of (summary_string, flat_list, grouped_list)
    """
    achievements_summary = ""
    achievements_summary_list = []
    achievements_grouped = []

    if detailed_achievements:
        # Group by category
        categories = OrderedDict()
        for ach in detailed_achievements:
            cat = ach.get("category", "기타")
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(ach)

        summary_lines = []
        for category, items in categories.items():
            summary_lines.append(f"**[{category}]**")
            grouped_items = []
            for item in items:
                summary_lines.append(f"• {item['title']}")
                achievements_summary_list.append({
                    "category": category,
                    "title": item['title'],
                    "has_description": bool(item.get('description')),
                })
                grouped_items.append({"title": item['title']})
            summary_lines.append("")  # Empty line between categories
            achievements_grouped.append({
                "category": category,
                "items": grouped_items,
            })
        achievements_summary = "\n".join(summary_lines).strip()
    elif project_achievements:
        # Fallback to basic if no detailed achievements
        achievements_summary = achievements_basic
        achievements_summary_list = project_achievements
        # Build grouped from project_achievements (group by category field)
        cat_map = OrderedDict()
        for ach in project_achievements:
            cat = ach.get("category", "") or ach.get("metric_name", "기타")
            if cat not in cat_map:
                cat_map[cat] = []
            cat_map[cat].append({"title": ach.get("metric_value", ach.get("title", ""))})
        for cat, items in cat_map.items():
            achievements_grouped.append({"category": cat, "items": items})

    return achievements_summary, achievements_summary_list, achievements_grouped


def _build_per_repo_analyses(project, code_stat_keywords: List[str]) -> List[Dict[str, Any]]:
    """Build per-repo analysis data for multi-repo projects.

    Each item contains key_tasks, achievements, and ai_summary from the repo's analysis.
    """
    if not project.repo_analyses or len(project.repo_analyses) <= 1:
        return []

    result = []
    for ra in project.repo_analyses:
        repo = ra.project_repository
        label = ""
        is_primary = False
        if repo:
            label = repo.label or ra.git_url.split("/")[-1] if ra.git_url else ""
            is_primary = bool(repo.is_primary)
        elif ra.git_url:
            label = ra.git_url.split("/")[-1]

        edits = ra.user_edits

        # Get effective key_tasks
        effective_key_tasks = None
        if edits and edits.key_tasks_modified and edits.key_tasks is not None:
            effective_key_tasks = edits.key_tasks
        elif ra.key_tasks:
            effective_key_tasks = ra.key_tasks

        per_key_tasks = effective_key_tasks if isinstance(effective_key_tasks, list) else []

        # Get effective detailed_achievements
        effective_achievements = None
        if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None:
            effective_achievements = edits.detailed_achievements
        elif ra.detailed_achievements:
            effective_achievements = ra.detailed_achievements

        # Build grouped achievements for this repo
        per_achievements_grouped = []
        if effective_achievements and isinstance(effective_achievements, dict):
            for category, items in effective_achievements.items():
                if isinstance(items, list):
                    grouped_items = []
                    for item in items:
                        if isinstance(item, dict):
                            grouped_items.append({"title": item.get("title", "")})
                        else:
                            grouped_items.append({"title": str(item)})
                    if grouped_items:
                        per_achievements_grouped.append({
                            "category": category,
                            "items": grouped_items,
                        })

        result.append({
            "git_url": ra.git_url or "",
            "label": label,
            "is_primary": is_primary,
            "key_tasks_list": per_key_tasks,
            "has_key_tasks": len(per_key_tasks) > 0,
            "achievements_grouped": per_achievements_grouped,
            "has_achievements": len(per_achievements_grouped) > 0,
            "ai_summary": ra.ai_summary or "",
            "has_ai_summary": bool(ra.ai_summary),
        })

    return result


def _build_achievements_detailed(
    detailed_achievements: List[Dict[str, Any]],
    project_achievements: List[Dict[str, Any]]
) -> Tuple[str, List[Dict[str, Any]]]:
    """Build DETAILED format: Full title + description from detailed_achievements"""
    achievements_detailed = ""
    achievements_detailed_list = []

    if detailed_achievements:
        # Group by category
        categories = OrderedDict()
        for ach in detailed_achievements:
            cat = ach.get("category", "기타")
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(ach)

        detailed_lines = []
        for category, items in categories.items():
            detailed_lines.append(f"**[{category}]**")
            for item in items:
                detailed_lines.append(f"**{item['title']}**")
                if item.get('description'):
                    detailed_lines.append(f"  {item['description']}")
                detailed_lines.append("")
                achievements_detailed_list.append({
                    "category": category,
                    "title": item['title'],
                    "description": item.get('description', ''),
                    "has_description": bool(item.get('description')),
                })
        achievements_detailed = "\n".join(detailed_lines).strip()
    elif project_achievements:
        # Fallback to basic with descriptions if no detailed achievements
        # Convert to detailed_list format for template compatibility
        detailed_lines = []
        for ach in project_achievements:
            line = f"**{ach['metric_name']}**: {ach['metric_value']}"
            desc_parts = []
            if ach['description']:
                desc_parts.append(ach['description'])
            if ach['before_value'] or ach['after_value']:
                before = ach['before_value'] or '-'
                after = ach['after_value'] or '-'
                desc_parts.append(f"▶ {before} → {after}")
            detailed_lines.append(line + ("\n  " + " ".join(desc_parts) if desc_parts else ""))

            # Convert to detailed_list format
            achievements_detailed_list.append({
                "category": ach['metric_name'],  # Use metric_name as category
                "title": ach['metric_value'],    # Use metric_value as title
                "description": ach.get('description', ''),
                "has_description": bool(ach.get('description')),
            })
        achievements_detailed = "\n\n".join(detailed_lines)

    return achievements_detailed, achievements_detailed_list
