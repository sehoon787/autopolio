"""
Analysis Job Runner - Single-repo background analysis execution.

Multi-repo analysis is in analysis_job_multi.py.
Shared LLM helpers are in analysis_job_helpers.py.
"""

import asyncio
import logging
import time
from typing import Optional, Dict, Any
from datetime import datetime

from sqlalchemy import select

from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.achievement import ProjectAchievement
from .role_service import RoleService
from .analysis_job_helpers import (
    _generate_key_tasks_bg,
    build_summary_project_data,
    save_llm_results,
    save_contributor_analysis,
)
from api.services.llm.llm_utils import create_llm_service
from api.database import AsyncSessionLocal
from api.constants import JobStatus, SummaryStyle

logger = logging.getLogger(__name__)

STEPS_PER_REPO = 6  # Steps 1-6 for each repository


class AnalysisCancelledException(Exception):
    """Raised when analysis is cancelled by user."""

    pass


async def run_background_analysis(
    task_id: str,
    user_id: int,
    project_id: int,
    git_url: str,
    github_username: str,
    github_token: str,
    options: Optional[Dict[str, Any]] = None,
    project_repository_id: Optional[int] = None,
) -> None:
    """
    Run analysis in background with step-by-step progress tracking.
    This function is designed to be called via asyncio.create_task().
    """
    from api.services.github import GitHubService
    from api.services.achievement import AchievementService
    from .analysis_job_crud import AnalysisJobService

    logger.info(
        "[BackgroundAnalysis] Starting for task_id=%s, project_id=%d",
        task_id,
        project_id,
    )

    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)

        # Mark job as running
        job = await service.get_job(task_id)
        if not job:
            logger.error("[BackgroundAnalysis] Job not found: %s", task_id)
            return

        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        await db.commit()

    github_service = GitHubService(github_token)
    role_service = RoleService()
    options = options or {}
    total_tokens = 0
    language = options.get("language", "ko")
    summary_style = options.get("summary_style", SummaryStyle.PROFESSIONAL)

    logger.info("[BackgroundAnalysis] language=%s, options=%s", language, options)

    # Initialize LLM service
    llm_service = None
    try:
        llm_service = create_llm_service(options)
        logger.info(
            "[BackgroundAnalysis] LLM: cli_mode=%s, provider=%s, has_api_key=%s",
            options.get("cli_mode"),
            options.get("provider"),
            bool(options.get("api_key")),
        )
    except Exception as e:
        logger.warning("[BackgroundAnalysis] LLM service not available: %s", e)

    # Create a fresh service instance for step updates
    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)

    try:
        # Step 1: Repository info
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 1, JobStatus.RUNNING)
        logger.info("[BackgroundAnalysis] Step 1: Repository info")

        analysis_result = await github_service.analyze_repository(
            git_url, github_username
        )

        step1_result = {
            "total_commits": analysis_result.get("total_commits", 0),
            "user_commits": analysis_result.get("user_commits", 0),
            "lines_added": analysis_result.get("lines_added", 0),
            "lines_deleted": analysis_result.get("lines_deleted", 0),
            "files_changed": analysis_result.get("files_changed", 0),
            "languages": analysis_result.get("languages", {}),
            "primary_language": analysis_result.get("primary_language"),
        }
        await service.update_step_progress(
            task_id, 1, JobStatus.COMPLETED, step1_result
        )

        # Step 2: Technology detection (already done in analyze_repository)
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 2, JobStatus.RUNNING)
        logger.info("[BackgroundAnalysis] Step 2: Technology detection")

        step2_result = {
            "technologies": analysis_result.get("detected_technologies", []),
        }
        await service.update_step_progress(
            task_id, 2, JobStatus.COMPLETED, step2_result
        )

        # Step 3: Commit analysis
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 3, JobStatus.RUNNING)
        logger.info("[BackgroundAnalysis] Step 3: Commit analysis")

        step3_result = {
            "summary": analysis_result.get("commit_messages_summary"),
            "categories": analysis_result.get("commit_categories", {}),
        }
        await service.update_step_progress(
            task_id, 3, JobStatus.COMPLETED, step3_result
        )

        # Step 4: Role detection
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 4, JobStatus.RUNNING)
        logger.info("[BackgroundAnalysis] Step 4: Role detection")

        detected_role, _ = role_service.detect_role(
            technologies=analysis_result.get("detected_technologies", []),
            commit_messages=analysis_result.get("commit_messages", [])[:100],
        )

        step4_result = {"detected_role": detected_role}
        await service.update_step_progress(
            task_id, 4, JobStatus.COMPLETED, step4_result
        )

        # Save basic results to DB
        async with AsyncSessionLocal() as db:
            proj_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = proj_result.scalar_one_or_none()

            if not project:
                raise ValueError(f"Project not found: {project_id}")

            # Get or create repo analysis — match by project_repository_id if available
            if project_repository_id:
                analysis_db_result = await db.execute(
                    select(RepoAnalysis).where(
                        RepoAnalysis.project_repository_id == project_repository_id
                    )
                )
            else:
                analysis_db_result = await db.execute(
                    select(RepoAnalysis).where(
                        RepoAnalysis.project_id == project_id,
                        RepoAnalysis.git_url == git_url,
                    )
                )
            repo_analysis = analysis_db_result.scalar_one_or_none()

            if repo_analysis:
                for key, value in analysis_result.items():
                    if hasattr(repo_analysis, key):
                        setattr(repo_analysis, key, value)
            else:
                repo_analysis = RepoAnalysis(
                    project_id=project_id,
                    project_repository_id=project_repository_id,
                    git_url=git_url,
                    **analysis_result,
                )
                db.add(repo_analysis)

            # Update project
            if not project.role and detected_role:
                project.role = detected_role
            project.is_analyzed = 1
            project.git_url = git_url

            # Save technologies
            detected_techs = analysis_result.get("detected_technologies", [])
            if detected_techs:
                await db.execute(
                    ProjectTechnology.__table__.delete().where(
                        ProjectTechnology.project_id == project_id
                    )
                )
                for tech_name in detected_techs:
                    tech_result = await db.execute(
                        select(Technology).where(Technology.name == tech_name)
                    )
                    tech = tech_result.scalar_one_or_none()
                    if not tech:
                        tech = Technology(name=tech_name)
                        db.add(tech)
                        await db.flush()
                    project_tech = ProjectTechnology(
                        project_id=project_id,
                        technology_id=tech.id,
                        is_primary=1
                        if tech_name == analysis_result.get("primary_language")
                        else 0,
                    )
                    db.add(project_tech)

            # Auto-detect achievements
            try:
                achievement_service = AchievementService(llm_service=llm_service)
                project_data = {
                    "name": project.name,
                    "description": project.description or "",
                    "role": project.role or "",
                    "total_commits": repo_analysis.total_commits or 0,
                    "lines_added": repo_analysis.lines_added or 0,
                    "lines_deleted": repo_analysis.lines_deleted or 0,
                    "files_changed": repo_analysis.files_changed or 0,
                    "commit_categories": repo_analysis.commit_categories or {},
                }
                commit_messages = []
                if repo_analysis.commit_messages_summary:
                    commit_messages = repo_analysis.commit_messages_summary.split("\n")

                achievements, _ = await achievement_service.detect_all(
                    project_data=project_data,
                    commit_messages=commit_messages,
                    use_llm=llm_service is not None,
                    language=language,
                )

                if achievements:
                    await db.execute(
                        ProjectAchievement.__table__.delete().where(
                            ProjectAchievement.project_id == project_id
                        )
                    )
                    for achievement in achievements:
                        db.add(
                            ProjectAchievement(
                                project_id=project_id,
                                metric_name=achievement.get("metric_name", ""),
                                metric_value=achievement.get("metric_value", ""),
                                description=achievement.get("description"),
                                category=achievement.get("category"),
                                evidence=achievement.get("evidence"),
                            )
                        )
                    logger.info(
                        "[BackgroundAnalysis] Saved %d achievements", len(achievements)
                    )
            except Exception as e:
                logger.warning(
                    "[BackgroundAnalysis] Failed to auto-detect achievements: %s", e
                )

            await db.commit()
            analysis_id = repo_analysis.id

        # Steps 5+6: LLM key tasks + detailed content
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        key_tasks = []
        detailed_content = {}
        if llm_service:
            from api.services.llm.cli_llm_service import CLILLMService

            is_cli_mode = isinstance(llm_service, CLILLMService)

            await service.update_step_progress(task_id, 5, JobStatus.RUNNING)
            logger.info(
                "[BackgroundAnalysis] Steps 5+6: LLM (cli=%s, language=%s)",
                is_cli_mode,
                language,
            )

            # Prepare project_data for Step 6
            async with AsyncSessionLocal() as db:
                proj_result = await db.execute(
                    select(Project).where(Project.id == project_id)
                )
                project = proj_result.scalar_one_or_none()
                project_data = {
                    "name": project.name,
                    "description": project.description,
                    "role": project.role,
                    "start_date": str(project.start_date)
                    if project.start_date
                    else None,
                    "end_date": str(project.end_date) if project.end_date else None,
                }

            analysis_data_for_step6 = {
                "commit_messages_summary": analysis_result.get(
                    "commit_messages_summary"
                ),
                "detected_technologies": analysis_result.get(
                    "detected_technologies", []
                ),
                "commit_categories": analysis_result.get("commit_categories", {}),
                "total_commits": analysis_result.get("total_commits", 0),
                "lines_added": analysis_result.get("lines_added", 0),
                "lines_deleted": analysis_result.get("lines_deleted", 0),
                "files_changed": analysis_result.get("files_changed", 0),
            }

            _steps_start = time.time()
            total_tokens += await _run_llm_steps(
                service,
                task_id,
                project_id,
                analysis_result,
                llm_service,
                github_service,
                project_data,
                analysis_data_for_step6,
                language,
                is_cli_mode,
                key_tasks,
                detailed_content,
            )

            _steps_elapsed = time.time() - _steps_start
            logger.info(
                "[BackgroundAnalysis] Steps 5+6 completed in %.1fs (cli=%s)",
                _steps_elapsed,
                is_cli_mode,
            )
        else:
            logger.warning(
                "[BackgroundAnalysis] Skipping Steps 5+6: llm_service is None"
            )

        await service.update_step_progress(
            task_id, 5, JobStatus.COMPLETED, {"tasks": key_tasks}
        )
        await service.update_step_progress(
            task_id, 6, JobStatus.COMPLETED, detailed_content
        )

        # --- Post-processing ---

        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        # Generate AI summary
        ai_summary = None
        ai_key_features = None
        if llm_service:
            try:
                logger.info(
                    "[BackgroundAnalysis] Generating AI summary (language=%s)", language
                )
                async with AsyncSessionLocal() as db:
                    proj_result = await db.execute(
                        select(Project).where(Project.id == project_id)
                    )
                    project = proj_result.scalar_one_or_none()
                    if project:
                        summary_project_data = build_summary_project_data(
                            project, analysis_result
                        )
                        summary_result = await llm_service.generate_project_summary(
                            summary_project_data, style=summary_style, language=language
                        )
                        if summary_result:
                            ai_summary = summary_result.get("summary", "")
                            ai_key_features = summary_result.get("key_features", [])
                            total_tokens += summary_result.get("token_usage", 0)
            except Exception as e:
                logger.warning(
                    "[BackgroundAnalysis] Failed to generate AI summary: %s", e
                )
        else:
            logger.warning(
                "[BackgroundAnalysis] Skipping AI summary: llm_service is None"
            )

        # Save LLM results to DB
        await save_llm_results(
            analysis_id=analysis_id,
            project_id=project_id,
            is_primary=True,
            language=language,
            key_tasks=key_tasks,
            detailed_content=detailed_content,
            ai_summary=ai_summary,
            ai_key_features=ai_key_features,
        )

        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        # Extract tech versions
        try:
            tech_versions = await github_service.extract_tech_versions(git_url)
            if tech_versions:
                async with AsyncSessionLocal() as db:
                    analysis_db_result = await db.execute(
                        select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
                    )
                    repo_analysis = analysis_db_result.scalar_one_or_none()
                    if repo_analysis:
                        repo_analysis.tech_stack_versions = tech_versions
                        await db.commit()
        except Exception as e:
            logger.warning(
                "[BackgroundAnalysis] Failed to extract tech versions: %s", e
            )

        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        # Create ContributorAnalysis for the current user
        if github_username:
            try:
                logger.info(
                    "[BackgroundAnalysis] Creating ContributorAnalysis for user: %s",
                    github_username,
                )
                await save_contributor_analysis(
                    analysis_id, github_service, git_url, github_username
                )
                logger.info(
                    "[BackgroundAnalysis] Saved ContributorAnalysis for %s",
                    github_username,
                )
            except Exception as e:
                logger.warning(
                    "[BackgroundAnalysis] Failed to create ContributorAnalysis: %s", e
                )

        # Complete the job
        logger.info(
            "[BackgroundAnalysis] Completing: task_id=%s, total_tokens=%d",
            task_id,
            total_tokens,
        )
        await service.complete_job(
            task_id,
            {
                "analysis_id": analysis_id,
                "total_tokens": total_tokens,
            },
        )

        logger.info("[BackgroundAnalysis] Completed for task_id=%s", task_id)

    except AnalysisCancelledException:
        logger.info("[BackgroundAnalysis] Cancelled for task_id=%s", task_id)

    except Exception as e:
        logger.exception("[BackgroundAnalysis] Failed for task_id=%s: %s", task_id, e)
        await service.fail_job(task_id, str(e), {"type": type(e).__name__})


async def _run_llm_steps(
    service,
    task_id,
    project_id,
    analysis_result,
    llm_service,
    github_service,
    project_data,
    analysis_data_for_step6,
    language,
    is_cli_mode,
    key_tasks,
    detailed_content,
) -> int:
    """Run Steps 5+6 (key tasks + detailed content). Returns tokens used.

    CLI mode: sequential to avoid concurrent subprocess conflicts.
    API mode: parallel for speed.
    Mutates key_tasks and detailed_content lists/dicts in place.
    """
    tokens = 0

    if is_cli_mode:
        logger.info(
            "[BackgroundAnalysis] CLI mode — running Steps 5 then 6 sequentially"
        )

        try:
            tasks, t = await _generate_key_tasks_bg(
                project_id, analysis_result, llm_service, language
            )
            key_tasks.extend(tasks)
            tokens += t
            logger.info(
                "[BackgroundAnalysis] Step 5 done: %d key tasks, %d tokens",
                len(tasks),
                t,
            )
        except Exception as e:
            logger.error(
                "[BackgroundAnalysis] Step 5 (key_tasks) failed: %s: %s",
                type(e).__name__,
                e,
            )

        await service.update_step_progress(
            task_id, 5, JobStatus.COMPLETED, {"tasks": key_tasks}
        )
        await service.update_step_progress(task_id, 6, JobStatus.RUNNING)

        try:
            content, ct = await github_service.generate_detailed_content(
                project_data=project_data,
                analysis_data=analysis_data_for_step6,
                llm_service=llm_service,
                language=language,
            )
            detailed_content.update(content)
            tokens += ct
            logger.info(
                "[BackgroundAnalysis] Step 6 done: impl=%d, timeline=%d, achievements=%d, tokens=%d",
                len(content.get("implementation_details", [])),
                len(content.get("development_timeline", [])),
                len(content.get("detailed_achievements", {})),
                ct,
            )
        except Exception as e:
            logger.error(
                "[BackgroundAnalysis] Step 6 (detailed_content) failed: %s: %s",
                type(e).__name__,
                e,
            )
    else:
        await service.update_step_progress(task_id, 6, JobStatus.RUNNING)

        results = await asyncio.gather(
            _generate_key_tasks_bg(project_id, analysis_result, llm_service, language),
            github_service.generate_detailed_content(
                project_data=project_data,
                analysis_data=analysis_data_for_step6,
                llm_service=llm_service,
                language=language,
            ),
            return_exceptions=True,
        )

        if isinstance(results[0], Exception):
            logger.warning(
                "[BackgroundAnalysis] Failed to generate key tasks: %s", results[0]
            )
        else:
            tasks, t = results[0]
            key_tasks.extend(tasks)
            tokens += t
            logger.info(
                "[BackgroundAnalysis] Generated %d key tasks, tokens=%d",
                len(tasks),
                t,
            )

        if isinstance(results[1], Exception):
            logger.warning(
                "[BackgroundAnalysis] Failed to generate detailed content: %s",
                results[1],
            )
        else:
            content, ct = results[1]
            detailed_content.update(content)
            tokens += ct

    return tokens


# Re-export for backward compatibility (consumers import from this module).
from .analysis_job_multi import run_multi_repo_background_analysis  # noqa: E402, F401
from .analysis_job_helpers import _generate_combined_ai_summary  # noqa: E402, F401
