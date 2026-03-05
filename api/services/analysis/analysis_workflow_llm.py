"""
Analysis Workflow LLM Phases - Phase 5 (LLM generation) and Phase 6 (tech versions).

Split from analysis_workflow.py for maintainability.
"""

import logging
from typing import Optional, Dict, Any, List, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.models.project import Project
from api.models.repo_analysis import RepoAnalysis
from api.services.core.key_tasks_generator import (
    generate_key_tasks as _generate_key_tasks,
)
from .analysis_workflow import AnalysisContext, _get_github_service

logger = logging.getLogger(__name__)


async def phase5_collect_code_contributions(
    ctx: AnalysisContext,
) -> Optional[Dict[str, Any]]:
    """
    Phase 5.1: Collect user code contributions for LLM context.

    Returns code contributions dict or None.
    """
    if not ctx.github_service:
        ctx.github_service = _get_github_service(ctx.github_token)

    try:
        logger.info("[Phase5.1] Collecting user code contributions")
        contributions = await ctx.github_service.get_user_code_contributions(
            ctx.git_url,
            ctx.github_username,
            max_commits=30,
            max_total_patch_size=50000,  # ~50KB of code diffs
        )
        ctx.user_code_contributions = contributions
        logger.info(
            "[Phase5.1] Collected %d commits with code diffs",
            len(contributions.get("contributions", [])),
        )
        return contributions
    except Exception as e:
        logger.warning("[Phase5.1] Failed to collect code contributions: %s", e)
        return None


async def phase5_generate_key_tasks(
    ctx: AnalysisContext,
    project_name: str,
    project_description: Optional[str],
    project_role: Optional[str],
) -> Optional[List[str]]:
    """
    Phase 5.2: Generate key tasks using LLM.

    Returns list of key tasks or None.
    """
    if not ctx.llm_service:
        return None

    try:
        logger.info(
            "[Phase5.2] Generating key tasks with %s, language=%s",
            type(ctx.llm_service).__name__,
            ctx.language,
        )

        # Create minimal objects for _generate_key_tasks
        class MinimalProject:
            def __init__(self):
                self.name = project_name
                self.description = project_description
                self.role = project_role

        class MinimalAnalysis:
            def __init__(self):
                self.detected_technologies = ctx.analysis_result.get(
                    "detected_technologies", []
                )
                self.commit_messages_summary = ctx.analysis_result.get(
                    "commit_messages_summary"
                )
                self.commit_categories = ctx.analysis_result.get("commit_categories")
                self.total_commits = ctx.analysis_result.get("total_commits", 0)
                self.lines_added = ctx.analysis_result.get("lines_added", 0)

        # Get user context from previous edits
        key_tasks_user_context = None
        if (
            ctx.existing_edits
            and ctx.existing_edits.key_tasks_modified
            and ctx.existing_edits.key_tasks
        ):
            import json

            key_tasks_user_context = json.dumps(
                ctx.existing_edits.key_tasks, ensure_ascii=False
            )
            logger.info("[Phase5.2] Using user's previous key_tasks edits as context")

        key_tasks, tokens = await _generate_key_tasks(
            MinimalProject(),
            MinimalAnalysis(),
            ctx.llm_service,
            language=ctx.language,
            user_context=key_tasks_user_context,
            code_contributions=ctx.user_code_contributions,
        )
        ctx.key_tasks = key_tasks
        ctx.total_tokens += tokens
        return key_tasks
    except Exception as e:
        import traceback

        logger.warning(
            "[Phase5.2] Failed to generate key tasks: %s: %s", type(e).__name__, e
        )
        logger.debug("[Phase5.2] Traceback: %s", traceback.format_exc())
        return None


async def phase5_generate_detailed_content(
    ctx: AnalysisContext, project_data: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Phase 5.3: Generate detailed content using LLM.

    Returns detailed content dict or None.
    """
    if not ctx.llm_service or not ctx.github_service:
        return None

    try:
        analysis_data = {
            "commit_messages_summary": ctx.analysis_result.get(
                "commit_messages_summary"
            ),
            "detected_technologies": ctx.analysis_result.get(
                "detected_technologies", []
            ),
            "commit_categories": ctx.analysis_result.get("commit_categories"),
            "total_commits": ctx.analysis_result.get("total_commits", 0),
            "lines_added": ctx.analysis_result.get("lines_added", 0),
            "lines_deleted": ctx.analysis_result.get("lines_deleted", 0),
            "files_changed": ctx.analysis_result.get("files_changed", 0),
        }

        (
            detailed_content,
            content_tokens,
        ) = await ctx.github_service.generate_detailed_content(
            project_data=project_data,
            analysis_data=analysis_data,
            llm_service=ctx.llm_service,
            language=ctx.language,
            code_contributions=ctx.user_code_contributions,
        )
        ctx.detailed_content = detailed_content
        ctx.total_tokens += content_tokens
        return detailed_content
    except Exception as e:
        logger.warning("[Phase5.3] Failed to generate detailed content: %s", e)
        return None


async def phase5_generate_ai_summary(
    ctx: AnalysisContext, project_data: Dict[str, Any]
) -> Tuple[Optional[str], Optional[List[str]]]:
    """
    Phase 5.4: Generate AI summary using LLM.

    Returns (ai_summary, ai_key_features) tuple.
    """
    if not ctx.llm_service:
        return None, None

    try:
        logger.info("[Phase5.4] Generating AI summary")

        # Add code contributions summary for better context
        if ctx.user_code_contributions:
            project_data["code_contributions_summary"] = {
                "analyzed_commits": ctx.user_code_contributions.get("summary", {}).get(
                    "analyzed_commits", 0
                ),
                "lines_added": ctx.user_code_contributions.get("summary", {}).get(
                    "lines_added", 0
                ),
                "work_areas": ctx.user_code_contributions.get("work_areas", []),
            }

        summary_result = await ctx.llm_service.generate_project_summary(
            project_data, style=ctx.summary_style, language=ctx.language
        )

        if summary_result:
            ctx.ai_summary = summary_result.get("summary", "")
            ctx.ai_key_features = summary_result.get("key_features", [])
            if hasattr(ctx.llm_service, "total_tokens_used"):
                ctx.total_tokens += ctx.llm_service.total_tokens_used
            logger.info("[Phase5.4] AI summary generated successfully")
            return ctx.ai_summary, ctx.ai_key_features

        return None, None
    except Exception as e:
        logger.warning("[Phase5.4] Failed to generate AI summary: %s", e)
        return None, None


async def phase5_save_llm_results(db: AsyncSession, ctx: AnalysisContext) -> None:
    """
    Phase 5.5: Save LLM-generated content to database.
    """
    analysis_result_db = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.id == ctx.analysis_id)
    )
    repo_analysis = analysis_result_db.scalar_one_or_none()

    if not repo_analysis:
        logger.warning("[Phase5.5] RepoAnalysis not found: %s", ctx.analysis_id)
        return

    if ctx.key_tasks:
        repo_analysis.key_tasks = ctx.key_tasks

    if ctx.detailed_content:
        if ctx.detailed_content.get("implementation_details"):
            repo_analysis.implementation_details = ctx.detailed_content[
                "implementation_details"
            ]
        if ctx.detailed_content.get("development_timeline"):
            repo_analysis.development_timeline = ctx.detailed_content[
                "development_timeline"
            ]
        if ctx.detailed_content.get("detailed_achievements"):
            repo_analysis.detailed_achievements = ctx.detailed_content[
                "detailed_achievements"
            ]

    if ctx.ai_summary:
        repo_analysis.ai_summary = ctx.ai_summary
    if ctx.ai_key_features is not None:
        repo_analysis.ai_key_features = ctx.ai_key_features

    if ctx.user_code_contributions:
        repo_analysis.user_code_contributions = {
            "summary": ctx.user_code_contributions.get("summary", {}),
            "technologies": ctx.user_code_contributions.get("technologies", []),
            "work_areas": ctx.user_code_contributions.get("work_areas", []),
        }

    repo_analysis.analysis_language = ctx.language

    await db.commit()

    # Also copy ai_summary to Project for report_service compatibility
    if ctx.ai_summary or ctx.ai_key_features is not None:
        proj_result = await db.execute(
            select(Project).where(Project.id == ctx.project_id)
        )
        project = proj_result.scalar_one_or_none()
        if project:
            if ctx.ai_summary:
                project.ai_summary = ctx.ai_summary
            if ctx.ai_key_features is not None:
                project.ai_key_features = ctx.ai_key_features
            await db.commit()
            logger.info("[Phase5.5] Copied ai_summary to Project %d", ctx.project_id)

    logger.info("[Phase5.5] LLM content saved, language=%s", ctx.language)


async def phase6_extract_tech_versions(
    db: AsyncSession, ctx: AnalysisContext
) -> Optional[Dict[str, List[str]]]:
    """
    Phase 6: Extract technology versions from repository.

    Returns tech versions dict or None.
    """
    if not ctx.github_service:
        ctx.github_service = _get_github_service(ctx.github_token)

    try:
        tech_versions = await ctx.github_service.extract_tech_versions(ctx.git_url)
        if tech_versions:
            analysis_result_db = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.id == ctx.analysis_id)
            )
            repo_analysis = analysis_result_db.scalar_one_or_none()
            if repo_analysis:
                repo_analysis.tech_stack_versions = tech_versions
                await db.commit()
        return tech_versions
    except Exception as e:
        logger.warning("[Phase6] Failed to extract tech versions: %s", e)
        return None
