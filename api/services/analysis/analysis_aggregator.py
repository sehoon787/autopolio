"""
Analysis Aggregator - Merges multiple RepoAnalysis records into a single project view.

Used when a project has multiple repositories (e.g., backend, frontend, infra).
"""
from typing import List, Dict, Any, Optional
from itertools import chain

from api.models.repo_analysis import RepoAnalysis


def aggregate_analyses(analyses: List[RepoAnalysis]) -> Dict[str, Any]:
    """Aggregate multiple RepoAnalysis records into a unified project summary.

    Args:
        analyses: List of RepoAnalysis ORM objects for the same project.

    Returns:
        Aggregated dict with merged stats, technologies, languages, etc.
    """
    if not analyses:
        return {}

    if len(analyses) == 1:
        a = analyses[0]
        return {
            "total_commits": a.total_commits or 0,
            "user_commits": a.user_commits or 0,
            "lines_added": a.lines_added or 0,
            "lines_deleted": a.lines_deleted or 0,
            "files_changed": a.files_changed or 0,
            "detected_technologies": a.detected_technologies or [],
            "languages": a.languages or {},
            "primary_language": a.primary_language,
            "commit_messages_summary": a.commit_messages_summary,
            "commit_categories": a.commit_categories or {},
            "key_tasks": a.key_tasks or [],
            "implementation_details": a.implementation_details or [],
            "development_timeline": a.development_timeline or [],
            "detailed_achievements": a.detailed_achievements or {},
            "ai_summary": a.ai_summary,
            "ai_key_features": a.ai_key_features or [],
            "architecture_patterns": a.architecture_patterns or [],
            "tech_stack_versions": a.tech_stack_versions or {},
            "analyzed_at": a.analyzed_at,
        }

    return {
        "total_commits": sum(a.total_commits or 0 for a in analyses),
        "user_commits": sum(a.user_commits or 0 for a in analyses),
        "lines_added": sum(a.lines_added or 0 for a in analyses),
        "lines_deleted": sum(a.lines_deleted or 0 for a in analyses),
        "files_changed": sum(a.files_changed or 0 for a in analyses),
        "detected_technologies": _merge_technologies(analyses),
        "languages": _merge_languages(analyses),
        "primary_language": _compute_primary_language(analyses),
        "commit_messages_summary": _merge_commit_summaries(analyses),
        "commit_categories": _merge_commit_categories(analyses),
        "key_tasks": _merge_key_tasks(analyses),
        "implementation_details": _merge_implementation_details(analyses),
        "development_timeline": _merge_timelines(analyses),
        "detailed_achievements": _merge_detailed_achievements(analyses),
        "ai_summary": _merge_ai_summaries(analyses),
        "ai_key_features": _merge_ai_key_features(analyses),
        "architecture_patterns": _merge_architecture_patterns(analyses),
        "tech_stack_versions": _merge_tech_stack_versions(analyses),
        "analyzed_at": _latest_analyzed_at(analyses),
    }


def _merge_technologies(analyses: List[RepoAnalysis]) -> List[str]:
    """Deduplicate technologies across all repos."""
    seen = set()
    result = []
    for a in analyses:
        for tech in (a.detected_technologies or []):
            if tech not in seen:
                seen.add(tech)
                result.append(tech)
    return result


def _merge_languages(analyses: List[RepoAnalysis]) -> Dict[str, float]:
    """Merge language percentages weighted by lines of code."""
    total_lines = sum((a.lines_added or 0) + (a.lines_deleted or 0) for a in analyses) or 1
    merged: Dict[str, float] = {}

    for a in analyses:
        weight = ((a.lines_added or 0) + (a.lines_deleted or 0)) / total_lines
        for lang, pct in (a.languages or {}).items():
            merged[lang] = merged.get(lang, 0) + pct * weight

    # Normalize to 100%
    total = sum(merged.values()) or 1
    return {k: round(v / total * 100, 1) for k, v in sorted(merged.items(), key=lambda x: -x[1])}


def _compute_primary_language(analyses: List[RepoAnalysis]) -> Optional[str]:
    """Determine primary language from merged languages."""
    merged = _merge_languages(analyses)
    if not merged:
        return None
    return max(merged, key=merged.get)


def _merge_commit_summaries(analyses: List[RepoAnalysis]) -> Optional[str]:
    """Concatenate commit summaries with repo labels."""
    parts = []
    for a in analyses:
        if a.commit_messages_summary:
            label = ""
            if a.project_repository and a.project_repository.label:
                label = f"[{a.project_repository.label}] "
            parts.append(f"{label}{a.commit_messages_summary}")
    return "\n\n".join(parts) if parts else None


def _merge_commit_categories(analyses: List[RepoAnalysis]) -> Dict[str, int]:
    """Sum commit categories across repos."""
    merged: Dict[str, int] = {}
    for a in analyses:
        for cat, count in (a.commit_categories or {}).items():
            merged[cat] = merged.get(cat, 0) + (count if isinstance(count, int) else 0)
    return merged


def _merge_key_tasks(analyses: List[RepoAnalysis]) -> List[str]:
    """Merge key tasks, deduplicating similar entries."""
    seen = set()
    result = []
    for a in analyses:
        for task in (a.key_tasks or []):
            normalized = task.strip().lower()
            if normalized not in seen:
                seen.add(normalized)
                result.append(task)
    return result


def _merge_implementation_details(analyses: List[RepoAnalysis]) -> List[Dict[str, Any]]:
    """Merge implementation details from all repos."""
    result = []
    for a in analyses:
        for detail in (a.implementation_details or []):
            if isinstance(detail, dict):
                result.append(detail)
    return result


def _merge_timelines(analyses: List[RepoAnalysis]) -> List[Dict[str, Any]]:
    """Merge development timelines."""
    result = []
    for a in analyses:
        for entry in (a.development_timeline or []):
            if isinstance(entry, dict):
                result.append(entry)
    return result


def _merge_detailed_achievements(analyses: List[RepoAnalysis]) -> Dict[str, List[Dict[str, Any]]]:
    """Merge detailed achievements by category."""
    merged: Dict[str, List[Dict[str, Any]]] = {}
    for a in analyses:
        achievements = a.detailed_achievements or {}
        if isinstance(achievements, dict):
            for category, items in achievements.items():
                if category not in merged:
                    merged[category] = []
                if isinstance(items, list):
                    merged[category].extend(items)
    return merged


def _merge_ai_summaries(analyses: List[RepoAnalysis]) -> Optional[str]:
    """Use primary repo's AI summary, or concatenate all."""
    primary = [a for a in analyses if a.project_repository and a.project_repository.is_primary]
    if primary and primary[0].ai_summary:
        return primary[0].ai_summary
    summaries = [a.ai_summary for a in analyses if a.ai_summary]
    return summaries[0] if summaries else None


def _merge_ai_key_features(analyses: List[RepoAnalysis]) -> List[str]:
    """Merge AI key features, deduplicating."""
    seen = set()
    result = []
    for a in analyses:
        for feat in (a.ai_key_features or []):
            if feat not in seen:
                seen.add(feat)
                result.append(feat)
    return result


def _merge_architecture_patterns(analyses: List[RepoAnalysis]) -> List[str]:
    """Merge architecture patterns, deduplicating."""
    seen = set()
    result = []
    for a in analyses:
        for pat in (a.architecture_patterns or []):
            normalized = pat.strip().lower()
            if normalized not in seen:
                seen.add(normalized)
                result.append(pat)
    return result


def _merge_tech_stack_versions(analyses: List[RepoAnalysis]) -> Dict[str, Any]:
    """Merge tech stack versions, preferring non-empty values."""
    merged: Dict[str, Any] = {}
    for a in analyses:
        for tech, version in (a.tech_stack_versions or {}).items():
            if tech not in merged or (version and not merged[tech]):
                merged[tech] = version
    return merged


def _latest_analyzed_at(analyses: List[RepoAnalysis]):
    """Return the latest analyzed_at timestamp."""
    timestamps = [a.analyzed_at for a in analyses if a.analyzed_at]
    return max(timestamps) if timestamps else None
