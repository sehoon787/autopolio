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
from api.models.contributor_analysis import ContributorAnalysis
from .role_service import RoleService
from .analysis_job_helpers import _generate_key_tasks_bg
from api.database import AsyncSessionLocal

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
    from api.services.llm import LLMService
    from api.services.llm import CLILLMService
    from api.services.github import GitHubService
    from api.services.achievement import AchievementService
    from .analysis_job_crud import AnalysisJobService

    logger.info("[BackgroundAnalysis] Starting for task_id=%s, project_id=%d", task_id, project_id)

    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)

        # Mark job as running
        job = await service.get_job(task_id)
        if not job:
            logger.error("[BackgroundAnalysis] Job not found: %s", task_id)
            return

        job.status = "running"
        job.started_at = datetime.utcnow()
        await db.commit()

    github_service = GitHubService(github_token)
    role_service = RoleService()
    options = options or {}
    total_tokens = 0
    language = options.get("language", "ko")  # Default to Korean
    summary_style = options.get("summary_style", "professional")  # Default to professional

    logger.info("[BackgroundAnalysis] language=%s, options=%s", language, options)

    # Initialize LLM service
    llm_service = None
    try:
        cli_mode = options.get("cli_mode")
        cli_model = options.get("cli_model")
        provider = options.get("provider")

        api_key = options.get("api_key")
        if cli_mode:
            llm_service = CLILLMService(cli_mode, model=cli_model)
        elif provider:
            llm_service = LLMService(provider, api_key=api_key)
        else:
            llm_service = LLMService(api_key=api_key)
        logger.info("[BackgroundAnalysis] LLM: cli_mode=%s, provider=%s, has_api_key=%s", cli_mode, provider, bool(api_key))
    except Exception as e:
        logger.warning("[BackgroundAnalysis] LLM service not available: %s", e)

    # Create a fresh service instance for step updates
    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)

    try:
        # Step 1: Repository info
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 1, "running")
        logger.info("[BackgroundAnalysis] Step 1: Repository info")

        analysis_result = await github_service.analyze_repository(git_url, github_username)

        step1_result = {
            "total_commits": analysis_result.get("total_commits", 0),
            "user_commits": analysis_result.get("user_commits", 0),
            "lines_added": analysis_result.get("lines_added", 0),
            "lines_deleted": analysis_result.get("lines_deleted", 0),
            "files_changed": analysis_result.get("files_changed", 0),
            "languages": analysis_result.get("languages", {}),
            "primary_language": analysis_result.get("primary_language"),
        }
        await service.update_step_progress(task_id, 1, "completed", step1_result)

        # Step 2: Technology detection (already done in analyze_repository)
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 2, "running")
        logger.info("[BackgroundAnalysis] Step 2: Technology detection")

        step2_result = {
            "technologies": analysis_result.get("detected_technologies", []),
        }
        await service.update_step_progress(task_id, 2, "completed", step2_result)

        # Step 3: Commit analysis
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 3, "running")
        logger.info("[BackgroundAnalysis] Step 3: Commit analysis")

        step3_result = {
            "summary": analysis_result.get("commit_messages_summary"),
            "categories": analysis_result.get("commit_categories", {}),
        }
        await service.update_step_progress(task_id, 3, "completed", step3_result)

        # Step 4: Role detection
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 4, "running")
        logger.info("[BackgroundAnalysis] Step 4: Role detection")

        detected_role, _ = role_service.detect_role(
            technologies=analysis_result.get("detected_technologies", []),
            commit_messages=analysis_result.get("commit_messages", [])[:100],
        )

        step4_result = {"detected_role": detected_role}
        await service.update_step_progress(task_id, 4, "completed", step4_result)

        # Save basic results to DB
        async with AsyncSessionLocal() as db:
            # Get project
            proj_result = await db.execute(select(Project).where(Project.id == project_id))
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
                    **analysis_result
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
                        is_primary=1 if tech_name == analysis_result.get("primary_language") else 0
                    )
                    db.add(project_tech)

            # Auto-detect achievements
            try:
                achievement_service = AchievementService(llm_provider=None)
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
                    use_llm=False,
                    language=language
                )

                if achievements:
                    # Delete existing achievements to avoid language mixing
                    await db.execute(
                        ProjectAchievement.__table__.delete().where(
                            ProjectAchievement.project_id == project_id
                        )
                    )
                    for achievement in achievements:
                        db.add(ProjectAchievement(
                            project_id=project_id,
                            metric_name=achievement.get("metric_name", ""),
                            metric_value=achievement.get("metric_value", ""),
                            description=achievement.get("description"),
                            category=achievement.get("category"),
                            evidence=achievement.get("evidence"),
                        ))
                    logger.info("[BackgroundAnalysis] Saved %d achievements", len(achievements))
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to auto-detect achievements: %s", e)

            await db.commit()
            analysis_id = repo_analysis.id

        # Steps 5+6: LLM key tasks + detailed content
        # CLI mode: run sequentially to avoid concurrent subprocess conflicts
        # API mode: run in parallel for speed
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        key_tasks = []
        detailed_content = {}
        if llm_service:
            from api.services.llm.cli_llm_service import CLILLMService
            is_cli_mode = isinstance(llm_service, CLILLMService)

            await service.update_step_progress(task_id, 5, "running")
            logger.info("[BackgroundAnalysis] Steps 5+6: LLM (cli=%s, language=%s)", is_cli_mode, language)

            # Prepare project_data for Step 6 before launching tasks
            async with AsyncSessionLocal() as db:
                proj_result = await db.execute(select(Project).where(Project.id == project_id))
                project = proj_result.scalar_one_or_none()

                project_data = {
                    "name": project.name,
                    "description": project.description,
                    "role": project.role,
                    "start_date": str(project.start_date) if project.start_date else None,
                    "end_date": str(project.end_date) if project.end_date else None,
                }

            analysis_data_for_step6 = {
                "commit_messages_summary": analysis_result.get("commit_messages_summary"),
                "detected_technologies": analysis_result.get("detected_technologies", []),
                "commit_categories": analysis_result.get("commit_categories", {}),
                "total_commits": analysis_result.get("total_commits", 0),
                "lines_added": analysis_result.get("lines_added", 0),
                "lines_deleted": analysis_result.get("lines_deleted", 0),
                "files_changed": analysis_result.get("files_changed", 0),
            }

            _steps_start = time.time()

            if is_cli_mode:
                # CLI mode: run sequentially to avoid concurrent process conflicts
                logger.info("[BackgroundAnalysis] CLI mode — running Steps 5 then 6 sequentially")

                # Step 5: Key tasks
                try:
                    key_tasks, tokens = await _generate_key_tasks_bg(
                        project_id, analysis_result, llm_service, language
                    )
                    total_tokens += tokens
                    logger.info("[BackgroundAnalysis] Step 5 done: %d key tasks, %d tokens", len(key_tasks), tokens)
                except Exception as e:
                    logger.error("[BackgroundAnalysis] Step 5 (key_tasks) failed: %s: %s", type(e).__name__, e)

                await service.update_step_progress(task_id, 5, "completed", {"tasks": key_tasks})
                await service.update_step_progress(task_id, 6, "running")

                # Step 6: Detailed content (internally also sequential for CLI)
                try:
                    detailed_content, content_tokens = await github_service.generate_detailed_content(
                        project_data=project_data,
                        analysis_data=analysis_data_for_step6,
                        llm_service=llm_service,
                        language=language
                    )
                    total_tokens += content_tokens
                    logger.info("[BackgroundAnalysis] Step 6 done: impl=%d, timeline=%d, achievements=%d, tokens=%d",
                                len(detailed_content.get("implementation_details", [])),
                                len(detailed_content.get("development_timeline", [])),
                                len(detailed_content.get("detailed_achievements", {})),
                                content_tokens)
                except Exception as e:
                    logger.error("[BackgroundAnalysis] Step 6 (detailed_content) failed: %s: %s", type(e).__name__, e)
            else:
                # API mode: run in parallel for speed
                await service.update_step_progress(task_id, 6, "running")

                key_tasks_coro = _generate_key_tasks_bg(
                    project_id, analysis_result, llm_service, language
                )
                detailed_content_coro = github_service.generate_detailed_content(
                    project_data=project_data,
                    analysis_data=analysis_data_for_step6,
                    llm_service=llm_service,
                    language=language
                )

                results = await asyncio.gather(
                    key_tasks_coro, detailed_content_coro, return_exceptions=True
                )

                # Process Step 5 result
                if isinstance(results[0], Exception):
                    logger.warning("[BackgroundAnalysis] Failed to generate key tasks: %s", results[0])
                else:
                    key_tasks, tokens = results[0]
                    total_tokens += tokens
                    logger.info("[BackgroundAnalysis] Generated %d key tasks, tokens=%d", len(key_tasks), tokens)

                # Process Step 6 result
                if isinstance(results[1], Exception):
                    logger.warning("[BackgroundAnalysis] Failed to generate detailed content: %s", results[1])
                else:
                    detailed_content, content_tokens = results[1]
                    total_tokens += content_tokens

            _steps_elapsed = time.time() - _steps_start
            logger.info("[BackgroundAnalysis] Steps 5+6 completed in %.1fs (cli=%s)", _steps_elapsed, is_cli_mode)
        else:
            logger.warning("[BackgroundAnalysis] Skipping Steps 5+6: llm_service is None")

        step5_result = {"tasks": key_tasks}
        await service.update_step_progress(task_id, 5, "completed", step5_result)
        step6_result = detailed_content
        await service.update_step_progress(task_id, 6, "completed", step6_result)

        # --- Post-processing (progress stays at 95% until complete_job) ---

        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        # Generate AI summary (same as synchronous analysis)
        ai_summary = None
        ai_key_features = None
        if llm_service:
            try:
                logger.info("[BackgroundAnalysis] Generating AI summary (language=%s)", language)
                async with AsyncSessionLocal() as db:
                    proj_result = await db.execute(select(Project).where(Project.id == project_id))
                    project = proj_result.scalar_one_or_none()

                    if project:
                        summary_project_data = {
                            "name": project.name,
                            "description": project.description,
                            "role": project.role,
                            "team_size": project.team_size,
                            "contribution_percent": project.contribution_percent,
                            "technologies": analysis_result.get("detected_technologies", []),
                            "start_date": str(project.start_date) if project.start_date else None,
                            "end_date": str(project.end_date) if project.end_date else None,
                            "total_commits": analysis_result.get("total_commits", 0),
                            "commit_summary": analysis_result.get("commit_messages_summary", ""),
                        }

                        summary_result = await llm_service.generate_project_summary(
                            summary_project_data,
                            style=summary_style,
                            language=language
                        )
                        if summary_result:
                            ai_summary = summary_result.get("summary", "")
                            ai_key_features = summary_result.get("key_features", [])
                            # Add only the per-call token usage from summary (not cumulative total_tokens_used)
                            total_tokens += summary_result.get("token_usage", 0)
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to generate AI summary: %s", e)
        else:
            logger.warning("[BackgroundAnalysis] Skipping AI summary: llm_service is None")

        # Save LLM results and language to DB (ALWAYS save language, even if LLM failed)
        async with AsyncSessionLocal() as db:
            analysis_db_result = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
            )
            repo_analysis = analysis_db_result.scalar_one_or_none()

            if repo_analysis:
                repo_analysis.analysis_language = language
                if llm_service:
                    # Only overwrite LLM fields if we got actual data; keep existing on failure
                    if key_tasks:
                        repo_analysis.key_tasks = key_tasks
                    if detailed_content.get("implementation_details"):
                        repo_analysis.implementation_details = detailed_content["implementation_details"]
                    if detailed_content.get("development_timeline"):
                        repo_analysis.development_timeline = detailed_content["development_timeline"]
                    if detailed_content.get("detailed_achievements"):
                        repo_analysis.detailed_achievements = detailed_content["detailed_achievements"]
                    if ai_summary:
                        repo_analysis.ai_summary = ai_summary
                    if ai_key_features:
                        repo_analysis.ai_key_features = ai_key_features
                await db.commit()

                # Copy ai_summary to Project for report_service compatibility
                if ai_summary or ai_key_features:
                    proj_result = await db.execute(select(Project).where(Project.id == project_id))
                    project = proj_result.scalar_one_or_none()
                    if project:
                        if ai_summary:
                            project.ai_summary = ai_summary
                        if ai_key_features:
                            project.ai_key_features = ai_key_features
                        await db.commit()

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
            logger.warning("[BackgroundAnalysis] Failed to extract tech versions: %s", e)

        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        # Create ContributorAnalysis for the current user
        if github_username:
            try:
                logger.info("[BackgroundAnalysis] Creating ContributorAnalysis for user: %s", github_username)
                contributor_data = await github_service.analyze_contributor(
                    git_url,
                    github_username,
                    commit_limit=100
                )

                async with AsyncSessionLocal() as db:
                    # Check if already exists
                    existing_result = await db.execute(
                        select(ContributorAnalysis).where(
                            ContributorAnalysis.repo_analysis_id == analysis_id,
                            ContributorAnalysis.username == github_username
                        )
                    )
                    existing = existing_result.scalar_one_or_none()

                    if existing:
                        # Update existing record
                        existing.email = contributor_data.get("email")
                        existing.is_primary = True
                        existing.total_commits = contributor_data.get("total_commits", 0)
                        existing.first_commit_date = contributor_data.get("first_commit_date")
                        existing.last_commit_date = contributor_data.get("last_commit_date")
                        existing.lines_added = contributor_data.get("lines_added", 0)
                        existing.lines_deleted = contributor_data.get("lines_deleted", 0)
                        existing.file_extensions = contributor_data.get("file_extensions", {})
                        existing.work_areas = contributor_data.get("work_areas", [])
                        existing.detected_technologies = contributor_data.get("detected_technologies", [])
                        existing.detailed_commits = contributor_data.get("detailed_commits", [])
                        existing.commit_types = contributor_data.get("commit_types", {})
                    else:
                        # Create new record
                        new_contributor = ContributorAnalysis(
                            repo_analysis_id=analysis_id,
                            username=github_username,
                            email=contributor_data.get("email"),
                            is_primary=True,
                            total_commits=contributor_data.get("total_commits", 0),
                            first_commit_date=contributor_data.get("first_commit_date"),
                            last_commit_date=contributor_data.get("last_commit_date"),
                            lines_added=contributor_data.get("lines_added", 0),
                            lines_deleted=contributor_data.get("lines_deleted", 0),
                            file_extensions=contributor_data.get("file_extensions", {}),
                            work_areas=contributor_data.get("work_areas", []),
                            detected_technologies=contributor_data.get("detected_technologies", []),
                            detailed_commits=contributor_data.get("detailed_commits", []),
                            commit_types=contributor_data.get("commit_types", {}),
                        )
                        db.add(new_contributor)
                    await db.commit()
                    logger.info("[BackgroundAnalysis] Saved ContributorAnalysis for %s", github_username)
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to create ContributorAnalysis: %s", e)

        # Complete the job
        await service.complete_job(task_id, {
            "analysis_id": analysis_id,
            "total_tokens": total_tokens,
        })

        logger.info("[BackgroundAnalysis] Completed for task_id=%s", task_id)

    except AnalysisCancelledException:
        logger.info("[BackgroundAnalysis] Cancelled for task_id=%s", task_id)
        # Job already marked as cancelled

    except Exception as e:
        logger.exception("[BackgroundAnalysis] Failed for task_id=%s: %s", task_id, e)
        await service.fail_job(task_id, str(e), {"type": type(e).__name__})


# Re-export for backward compatibility (consumers import from this module).
from .analysis_job_multi import run_multi_repo_background_analysis  # noqa: E402, F401
from .analysis_job_helpers import _generate_combined_ai_summary  # noqa: E402, F401
