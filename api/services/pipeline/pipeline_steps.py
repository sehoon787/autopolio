"""
Pipeline Steps - Individual step functions for the document generation pipeline.

This module contains the step functions extracted from PipelineService.
Each step function takes db, user_id, task_service, and request as parameters.

Performance Optimizations (v1.9):
- Parallel GitHub analysis for multiple projects
- Parallel LLM summarization for multiple projects
- Concurrency limits to respect API rate limits

Note: Steps 6 (Template Mapping) and 7 (Document Generation) are in
pipeline_template_step.py to keep file sizes under 600 lines.
"""
import asyncio
import logging
from typing import Dict, Any, TYPE_CHECKING
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

# Concurrency limits for parallel operations
MAX_CONCURRENT_GITHUB_ANALYSIS = 3  # GitHub API rate limit consideration
MAX_CONCURRENT_LLM_SUMMARY = 2  # LLM API rate limit consideration

from api.models.user import User
from api.models.project import Project, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.achievement import ProjectAchievement
from api.services.github import GitHubService
from api.services.llm import LLMService
from api.services.llm import CLILLMService
from api.services.core import EncryptionService
from api.services.achievement import AchievementService
from api.schemas.pipeline import PipelineRunRequest

if TYPE_CHECKING:
    from api.services.core import TaskService

# Step names constant
STEP_NAMES = [
    "GitHub Analysis",
    "Code Extraction",
    "Tech Detection",
    "Achievement Detection",
    "LLM Summarization",
    "Template Mapping",
    "Document Generation"
]


async def analyze_single_project(
    semaphore: asyncio.Semaphore,
    github_service: GitHubService,
    project: Project,
    username: str,
    git_url: str = "",
    project_repository_id: int = None,
) -> Dict[str, Any]:
    """Analyze a single project/repo with semaphore for rate limiting."""
    url = git_url or project.git_url
    async with semaphore:
        try:
            analysis = await github_service.analyze_repository(url, username)
            return {
                "project_id": project.id,
                "project": project,
                "analysis": analysis,
                "success": True,
                "git_url": url,
                "project_repository_id": project_repository_id,
            }
        except Exception as e:
            logger.warning("Failed to analyze project %s (%s): %s", project.id, url, e)
            return {
                "project_id": project.id,
                "project": project,
                "analysis": None,
                "success": False,
                "error": str(e),
                "git_url": url,
                "project_repository_id": project_repository_id,
            }


async def generate_single_summary(
    semaphore: asyncio.Semaphore,
    llm_service,
    project: Project,
    summary_style: str
) -> Dict[str, Any]:
    """Generate summary for a single project with semaphore for rate limiting."""
    async with semaphore:
        try:
            # Prepare project data
            project_data = {
                "name": project.name,
                "description": project.description,
                "role": project.role,
                "team_size": project.team_size,
                "contribution_percent": project.contribution_percent,
                "technologies": [pt.technology.name for pt in project.technologies],
                "start_date": str(project.start_date) if project.start_date else None,
                "end_date": str(project.end_date) if project.end_date else None,
            }

            # Add repo analysis data if available
            if project.repo_analysis:
                project_data["total_commits"] = project.repo_analysis.total_commits
                project_data["commit_summary"] = project.repo_analysis.commit_messages_summary

            # Generate summary
            summary_result = await llm_service.generate_project_summary(
                project_data,
                summary_style
            )

            return {
                "project_id": project.id,
                "project": project,
                "summary": summary_result,
                "success": True
            }
        except Exception as e:
            logger.warning("Failed to generate summary for project %s: %s", project.id, e)
            return {
                "project_id": project.id,
                "project": project,
                "summary": None,
                "success": False,
                "error": str(e)
            }


async def step_github_analysis(
    db: AsyncSession,
    user_id: int,
    task_service: "TaskService",
    request: PipelineRunRequest,
    user: User,
    encryption: EncryptionService
) -> Dict[str, Any]:
    """Step 1: Analyze GitHub repositories.

    Performance: Uses parallel analysis for multiple projects.
    """
    results = {"analyses": [], "skipped": []}

    await task_service.start_step(request.task_id, 1, STEP_NAMES[0])

    # Get projects with git URLs (and their repositories)
    from api.models.project_repository import ProjectRepository
    projects_result = await db.execute(
        select(Project)
        .where(Project.id.in_(request.project_ids))
        .where(Project.git_url.isnot(None))
        .options(selectinload(Project.repositories))
    )
    projects = projects_result.scalars().all()

    # Check if user has GitHub connected
    if user.github_token_encrypted:
        token = encryption.decrypt(user.github_token_encrypted)
        github_service = GitHubService(token)

        # Filter projects that need analysis — build (project, url, repo_id) tuples
        projects_to_analyze = []
        for project in projects:
            if project.is_analyzed:
                results["skipped"].append(project.id)
            elif request.auto_analyze:
                if project.repositories:
                    for repo in project.repositories:
                        projects_to_analyze.append((project, repo.git_url, repo.id))
                elif project.git_url:
                    projects_to_analyze.append((project, project.git_url, None))
            else:
                results["skipped"].append(project.id)

        if projects_to_analyze:
            # Parallel analysis with semaphore
            semaphore = asyncio.Semaphore(MAX_CONCURRENT_GITHUB_ANALYSIS)
            tasks = [
                analyze_single_project(
                    semaphore, github_service, project, user.github_username,
                    git_url=url, project_repository_id=repo_id,
                )
                for project, url, repo_id in projects_to_analyze
            ]

            analysis_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            for result in analysis_results:
                if isinstance(result, Exception):
                    continue
                if not result.get("success"):
                    results["skipped"].append(result["project_id"])
                    continue

                project = result["project"]
                analysis = result["analysis"]
                repo_url = result.get("git_url", project.git_url)
                repo_id = result.get("project_repository_id")

                # Save analysis — match by project_repository_id if available
                if repo_id:
                    existing = await db.execute(
                        select(RepoAnalysis).where(
                            RepoAnalysis.project_repository_id == repo_id
                        )
                    )
                else:
                    existing = await db.execute(
                        select(RepoAnalysis).where(
                            RepoAnalysis.project_id == project.id,
                            RepoAnalysis.git_url == repo_url,
                        )
                    )
                repo_analysis = existing.scalar_one_or_none()

                if repo_analysis:
                    for key, value in analysis.items():
                        if hasattr(repo_analysis, key):
                            setattr(repo_analysis, key, value)
                else:
                    repo_analysis = RepoAnalysis(
                        project_id=project.id,
                        project_repository_id=repo_id,
                        git_url=repo_url,
                        **analysis
                    )
                    db.add(repo_analysis)

                project.is_analyzed = 1
                results["analyses"].append({
                    "project_id": project.id,
                    "analysis": analysis,
                    "git_url": repo_url,
                })

        await db.flush()

    # Check if all projects were skipped (already analyzed)
    if len(results["skipped"]) == len(request.project_ids) and not results["analyses"]:
        await task_service.skip_step(
            request.task_id, 1, STEP_NAMES[0],
            reason="all_projects_analyzed",
            result=results
        )
    else:
        await task_service.complete_step(request.task_id, 1, results)

    return results


async def step_code_extraction(
    db: AsyncSession,
    task_service: "TaskService",
    request: PipelineRunRequest,
    github_results: Dict[str, Any]
) -> Dict[str, Any]:
    """Step 2: Extract code patterns and architecture."""
    await task_service.start_step(request.task_id, 2, STEP_NAMES[1])

    results = {"patterns": [], "architectures": []}

    # Get existing repo analyses
    analyses_result = await db.execute(
        select(RepoAnalysis)
        .where(RepoAnalysis.project_id.in_(request.project_ids))
    )
    analyses = analyses_result.scalars().all()

    for analysis in analyses:
        patterns = analysis.architecture_patterns or []
        results["patterns"].extend(patterns)

        # Extract from commit categories
        categories = analysis.commit_categories or {}
        if categories:
            results["architectures"].append({
                "project_id": analysis.project_id,
                "commit_distribution": categories
            })

    await task_service.complete_step(request.task_id, 2, results)
    return results


async def step_tech_detection(
    db: AsyncSession,
    task_service: "TaskService",
    request: PipelineRunRequest,
    code_results: Dict[str, Any]
) -> Dict[str, Any]:
    """Step 3: Detect and consolidate technologies."""
    await task_service.start_step(request.task_id, 3, STEP_NAMES[2])

    results = {"technologies": {}, "primary_stack": []}

    # Get repo analyses
    analyses_result = await db.execute(
        select(RepoAnalysis)
        .where(RepoAnalysis.project_id.in_(request.project_ids))
    )
    analyses = analyses_result.scalars().all()

    all_techs = {}
    for analysis in analyses:
        detected = analysis.detected_technologies or []
        for tech in detected:
            all_techs[tech] = all_techs.get(tech, 0) + 1

    # Sort by frequency
    sorted_techs = sorted(all_techs.items(), key=lambda x: x[1], reverse=True)
    results["technologies"] = dict(sorted_techs)
    results["primary_stack"] = [t[0] for t in sorted_techs[:10]]

    await task_service.complete_step(request.task_id, 3, results)
    return results


async def step_achievement_detection(
    db: AsyncSession,
    task_service: "TaskService",
    request: PipelineRunRequest,
    user: User
) -> Dict[str, Any]:
    """Step 4: Detect achievements from project data."""
    await task_service.start_step(request.task_id, 4, STEP_NAMES[3])

    results = {"projects": [], "total_detected": 0, "total_saved": 0}

    # Get projects with repo analysis
    projects_result = await db.execute(
        select(Project)
        .where(Project.id.in_(request.project_ids))
        .options(
            selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
            selectinload(Project.repo_analyses),
            selectinload(Project.achievements)
        )
    )
    projects = projects_result.scalars().all()

    for project in projects:
        # Prepare project data
        project_data = {
            "name": project.name,
            "description": project.description or "",
            "role": project.role,
            "team_size": project.team_size,
            "contribution_percent": project.contribution_percent,
            "technologies": [pt.technology.name for pt in project.technologies],
            "total_commits": 0,
            "lines_added": 0,
            "lines_deleted": 0,
            "files_changed": 0,
            "commit_categories": {},
            "commit_summary": None
        }

        commit_messages = []
        if project.repo_analysis:
            repo_analysis = project.repo_analysis
            project_data.update({
                "total_commits": repo_analysis.total_commits or 0,
                "lines_added": repo_analysis.lines_added or 0,
                "lines_deleted": repo_analysis.lines_deleted or 0,
                "files_changed": repo_analysis.files_changed or 0,
                "commit_categories": repo_analysis.commit_categories or {},
                "commit_summary": repo_analysis.commit_messages_summary
            })
            if repo_analysis.commit_messages_summary:
                commit_messages = repo_analysis.commit_messages_summary.split("\n")

        # Detect achievements (skip LLM in pipeline to save tokens)
        achievement_service = AchievementService(llm_provider=None)
        detected_achievements, stats = await achievement_service.detect_all(
            project_data=project_data,
            commit_messages=commit_messages,
            use_llm=False
        )

        # Filter out existing achievements
        existing_keys = {(a.metric_name, a.metric_value) for a in project.achievements}
        new_achievements = [
            a for a in detected_achievements
            if (a["metric_name"], a["metric_value"]) not in existing_keys
        ]

        # Save new achievements
        saved_count = 0
        for i, a in enumerate(new_achievements):
            achievement = ProjectAchievement(
                project_id=project.id,
                metric_name=a["metric_name"],
                metric_value=a["metric_value"],
                description=a.get("description"),
                category=a.get("category"),
                evidence=a.get("evidence"),
                display_order=len(project.achievements) + i
            )
            db.add(achievement)
            saved_count += 1

        results["projects"].append({
            "project_id": project.id,
            "detected": len(new_achievements),
            "saved": saved_count
        })
        results["total_detected"] += len(new_achievements)
        results["total_saved"] += saved_count

    await db.flush()
    await task_service.complete_step(request.task_id, 4, results)
    return results


async def step_llm_summarization(
    db: AsyncSession,
    task_service: "TaskService",
    request: PipelineRunRequest,
    user: User,
    tech_results: Dict[str, Any]
) -> tuple[Dict[str, Any], int]:
    """Step 5: Use pre-generated summaries from analysis, or generate new ones.

    v1.12 Update: AI summaries are now generated during analysis, not pipeline.
    This step primarily copies summaries from RepoAnalysis to Project.
    LLM generation is a fallback for projects without analysis.
    """
    results = {"summaries": [], "tokens_used": 0, "copied_from_analysis": 0}

    await task_service.start_step(request.task_id, 5, STEP_NAMES[4])

    try:
        # Get projects with their repo_analysis
        projects_result = await db.execute(
            select(Project)
            .where(Project.id.in_(request.project_ids))
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.achievements),
                selectinload(Project.repo_analyses)
            )
        )
        projects = projects_result.scalars().all()

        # Step 1: Copy summaries from RepoAnalysis to Project (if available)
        projects_needing_llm = []
        for project in projects:
            # If project already has AI summary, use it
            if project.ai_summary:
                results["summaries"].append({
                    "project_id": project.id,
                    "summary": {"summary": project.ai_summary, "key_features": project.ai_key_features},
                    "source": "existing"
                })
                continue

            # Check if RepoAnalysis has ai_summary (generated during analysis)
            if project.repo_analysis and project.repo_analysis.ai_summary:
                # Copy from RepoAnalysis to Project
                project.ai_summary = project.repo_analysis.ai_summary
                project.ai_key_features = project.repo_analysis.ai_key_features
                results["copied_from_analysis"] += 1
                results["summaries"].append({
                    "project_id": project.id,
                    "summary": {
                        "summary": project.repo_analysis.ai_summary,
                        "key_features": project.repo_analysis.ai_key_features
                    },
                    "source": "analysis"
                })
                logger.info("Copied ai_summary from RepoAnalysis for project %d", project.id)
            else:
                # No summary in RepoAnalysis, need LLM generation
                projects_needing_llm.append(project)

        # Step 2: Generate summaries for projects without analysis (fallback)
        if projects_needing_llm:
            logger.info("Generating LLM summaries for %d projects without analysis", len(projects_needing_llm))

            # Initialize LLM service
            provider = request.llm_provider or user.preferred_llm
            cli_mode = getattr(request, 'cli_mode', None)
            cli_model = getattr(request, 'cli_model', None)
            if cli_mode:
                logger.info("Using CLI mode: %s, model: %s", cli_mode, cli_model)
                llm_service = CLILLMService(cli_mode, model=cli_model)
            else:
                user_model = None
                if provider == "openai":
                    user_model = getattr(user, 'openai_model', None)
                elif provider == "anthropic":
                    user_model = getattr(user, 'anthropic_model', None)
                elif provider == "gemini":
                    user_model = getattr(user, 'gemini_model', None)
                logger.info("Using API mode: provider=%s, model=%s", provider, user_model)
                llm_service = LLMService(provider, model=user_model)

            # Get user's summary style preference
            summary_style = getattr(user, 'default_summary_style', 'professional') or 'professional'

            # Parallel summarization
            semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM_SUMMARY)
            tasks = [
                generate_single_summary(
                    semaphore, llm_service, project, summary_style
                )
                for project in projects_needing_llm
            ]

            summary_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process LLM results
            for result in summary_results:
                if isinstance(result, Exception):
                    logger.warning("Summary generation exception: %s", result)
                    continue
                if not result.get("success"):
                    continue

                project = result["project"]
                summary = result["summary"]

                project.ai_summary = summary.get("summary", "")
                project.ai_key_features = summary.get("key_features", [])

                results["summaries"].append({
                    "project_id": project.id,
                    "summary": summary,
                    "source": "llm"
                })

            results["tokens_used"] = llm_service.total_tokens_used

        # Check if all projects were skipped
        if not results["summaries"] and not projects_needing_llm:
            results["skipped_projects"] = [p.id for p in projects]
            await task_service.skip_step(
                request.task_id, 5, STEP_NAMES[4],
                reason="all_projects_have_summaries",
                result=results
            )
            return results, 0

        await db.flush()

    except Exception as e:
        results["error"] = str(e)
        logger.exception("Step 5 error: %s", e)

    await task_service.complete_step(request.task_id, 5, results)
    return results, results.get("tokens_used", 0)


# Re-export step_template_mapping and step_document_generation from pipeline_template_step
from .pipeline_template_step import (
    step_template_mapping,
    step_document_generation,
)

__all__ = [
    "STEP_NAMES",
    "analyze_single_project",
    "generate_single_summary",
    "step_github_analysis",
    "step_code_extraction",
    "step_tech_detection",
    "step_achievement_detection",
    "step_llm_summarization",
    "step_template_mapping",
    "step_document_generation",
]
