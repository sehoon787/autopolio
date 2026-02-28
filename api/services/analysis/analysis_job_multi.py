"""Multi-repo background analysis execution."""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy import select
from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from .role_service import RoleService
from api.database import AsyncSessionLocal
from .analysis_job_runner import AnalysisCancelledException, STEPS_PER_REPO
from .analysis_job_helpers import (
    _generate_key_tasks_bg,
    _generate_combined_ai_summary,
    build_summary_project_data,
    save_repo_basic_results,
    save_llm_results,
    save_contributor_analysis,
)
from api.services.llm.llm_utils import create_llm_service

logger = logging.getLogger(__name__)


async def run_multi_repo_background_analysis(
    task_id: str,
    user_id: int,
    project_id: int,
    github_username: str,
    github_token: str,
    repositories: List[Dict[str, Any]],
    options: Optional[Dict[str, Any]] = None,
) -> None:
    """Run background analysis for a multi-repo project.

    Analyzes each repo sequentially (GitHub API rate limit safe).
    If one repo fails, the others are still analyzed.
    The job only fails if ALL repos fail.
    """
    from api.services.github import GitHubService
    from .analysis_job_crud import AnalysisJobService

    logger.info(
        "[MultiRepoAnalysis] Starting task_id=%s, project_id=%d, repos=%d",
        task_id,
        project_id,
        len(repositories),
    )

    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)
        job = await service.get_job(task_id)
        if not job:
            logger.error("[MultiRepoAnalysis] Job not found: %s", task_id)
            return
        job.status = "running"
        job.started_at = datetime.utcnow()
        await db.commit()

    github_service = GitHubService(github_token)
    role_service = RoleService()
    options = options or {}
    total_tokens = 0
    language = options.get("language", "ko")

    # Initialize LLM service
    llm_service = None
    try:
        llm_service = create_llm_service(options)
        logger.info(
            "[MultiRepoAnalysis] LLM: provider=%s, has_api_key=%s",
            options.get("provider"),
            bool(options.get("api_key")),
        )
    except Exception as e:
        logger.warning("[MultiRepoAnalysis] LLM service not available: %s", e)

    # Create a fresh service instance for step updates
    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)

    repo_count = len(repositories)
    succeeded = 0
    failed_repos: List[str] = []
    all_detected_techs: List[str] = []

    try:
        for repo_idx, repo_info in enumerate(repositories):
            repo_id = repo_info["id"]
            git_url = repo_info["git_url"]
            label = repo_info.get("label") or git_url.split("/")[-1].replace(".git", "")
            is_primary = repo_info.get("is_primary", False)

            step_offset = repo_idx * STEPS_PER_REPO
            label_prefix = f"[{label}] "

            logger.info(
                "[MultiRepoAnalysis] Repo %d/%d: %s (%s)",
                repo_idx + 1,
                repo_count,
                label,
                git_url,
            )

            try:
                repo_tokens = await _analyze_single_repo_for_multi(
                    task_id=task_id,
                    service=service,
                    github_service=github_service,
                    role_service=role_service,
                    llm_service=llm_service,
                    user_id=user_id,
                    project_id=project_id,
                    git_url=git_url,
                    github_username=github_username,
                    project_repository_id=repo_id,
                    is_primary=is_primary,
                    language=language,
                    options=options,
                    step_offset=step_offset,
                    label_prefix=label_prefix,
                    all_detected_techs=all_detected_techs,
                )
                succeeded += 1
                total_tokens += repo_tokens
            except AnalysisCancelledException:
                raise
            except Exception as e:
                logger.exception("[MultiRepoAnalysis] Repo %s failed: %s", label, e)
                failed_repos.append(label)
                # Mark remaining steps for this repo as failed
                for remaining_step in range(1, STEPS_PER_REPO + 1):
                    global_step = step_offset + remaining_step
                    try:
                        await service.update_step_progress(
                            task_id, global_step, "failed", {"error": str(e)[:200]}
                        )
                    except Exception as inner_e:
                        logger.warning(
                            "[MultiRepoAnalysis] Failed to mark step %d as failed: %s",
                            global_step,
                            inner_e,
                        )

        # After all repos: merge technologies at project level
        if all_detected_techs:
            unique_techs = list(
                dict.fromkeys(all_detected_techs)
            )  # preserve order, dedupe
            async with AsyncSessionLocal() as db:
                await db.execute(
                    ProjectTechnology.__table__.delete().where(
                        ProjectTechnology.project_id == project_id
                    )
                )
                for tech_name in unique_techs:
                    tech_result = await db.execute(
                        select(Technology).where(Technology.name == tech_name)
                    )
                    tech = tech_result.scalar_one_or_none()
                    if not tech:
                        tech = Technology(name=tech_name)
                        db.add(tech)
                        await db.flush()
                    db.add(
                        ProjectTechnology(
                            project_id=project_id,
                            technology_id=tech.id,
                            is_primary=0,
                        )
                    )
                await db.commit()

        if succeeded == 0:
            raise RuntimeError(
                f"All {repo_count} repos failed: {', '.join(failed_repos)}"
            )

        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        # Generate combined AI summary across all repos
        if llm_service and succeeded > 0:
            try:
                logger.info(
                    "[MultiRepoAnalysis] Generating combined AI summary for project %d",
                    project_id,
                )
                combined_tokens = await _generate_combined_ai_summary(
                    project_id=project_id,
                    llm_service=llm_service,
                    language=language,
                    summary_style=options.get("summary_style", "professional"),
                )
                total_tokens += combined_tokens
            except Exception as e:
                logger.warning("[MultiRepoAnalysis] Combined AI summary failed: %s", e)

        logger.info(
            "[MultiRepoAnalysis] Completing: task_id=%s, total_tokens=%d",
            task_id,
            total_tokens,
        )
        await service.complete_job(
            task_id,
            {
                "total_tokens": total_tokens,
                "repos_succeeded": succeeded,
                "repos_failed": len(failed_repos),
            },
        )
        logger.info(
            "[MultiRepoAnalysis] Completed task_id=%s (%d/%d repos succeeded)",
            task_id,
            succeeded,
            repo_count,
        )

    except AnalysisCancelledException:
        logger.info("[MultiRepoAnalysis] Cancelled task_id=%s", task_id)

    except Exception as e:
        logger.exception("[MultiRepoAnalysis] Failed task_id=%s: %s", task_id, e)
        await service.fail_job(task_id, str(e), {"type": type(e).__name__})


async def _analyze_single_repo_for_multi(
    *,
    task_id: str,
    service,
    github_service,
    role_service,
    llm_service,
    user_id: int,
    project_id: int,
    git_url: str,
    github_username: str,
    project_repository_id: int,
    is_primary: bool,
    language: str,
    options: Dict[str, Any],
    step_offset: int,
    label_prefix: str,
    all_detected_techs: List[str],
) -> int:
    """Analyze a single repo within a multi-repo job.
    Returns total tokens used for this repo.
    """
    summary_style = options.get("summary_style", "professional")
    repo_tokens = 0

    def gs(step: int) -> int:
        """Global step number."""
        return step_offset + step

    # --- Step 1: Repository info ---
    if await service.check_cancelled(task_id):
        raise AnalysisCancelledException()

    await service.update_step_progress(
        task_id,
        gs(1),
        "running",
        step_name_override=f"{label_prefix}repository_info",
    )

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
    await service.update_step_progress(task_id, gs(1), "completed", step1_result)

    # --- Step 2: Technology detection ---
    if await service.check_cancelled(task_id):
        raise AnalysisCancelledException()
    await service.update_step_progress(
        task_id,
        gs(2),
        "running",
        step_name_override=f"{label_prefix}technology_detection",
    )

    detected_techs = analysis_result.get("detected_technologies", [])
    all_detected_techs.extend(detected_techs)
    await service.update_step_progress(
        task_id, gs(2), "completed", {"technologies": detected_techs}
    )

    # --- Step 3: Commit analysis ---
    if await service.check_cancelled(task_id):
        raise AnalysisCancelledException()
    await service.update_step_progress(
        task_id,
        gs(3),
        "running",
        step_name_override=f"{label_prefix}commit_analysis",
    )

    await service.update_step_progress(
        task_id,
        gs(3),
        "completed",
        {
            "summary": analysis_result.get("commit_messages_summary"),
            "categories": analysis_result.get("commit_categories", {}),
        },
    )

    # --- Step 4: Role detection ---
    if await service.check_cancelled(task_id):
        raise AnalysisCancelledException()
    await service.update_step_progress(
        task_id,
        gs(4),
        "running",
        step_name_override=f"{label_prefix}role_detection",
    )

    detected_role, _ = role_service.detect_role(
        technologies=detected_techs,
        commit_messages=analysis_result.get("commit_messages", [])[:100],
    )
    await service.update_step_progress(
        task_id, gs(4), "completed", {"detected_role": detected_role}
    )

    # --- Save basic results to DB ---
    analysis_id = await save_repo_basic_results(
        project_id=project_id,
        project_repository_id=project_repository_id,
        git_url=git_url,
        is_primary=is_primary,
        detected_role=detected_role,
        analysis_result=analysis_result,
        llm_service=llm_service,
        language=language,
    )

    # --- Steps 5+6: LLM key tasks + detailed content (CLI: sequential; API: parallel) ---
    if await service.check_cancelled(task_id):
        raise AnalysisCancelledException()

    key_tasks: List[str] = []
    detailed_content: Dict[str, Any] = {}
    if llm_service:
        from api.services.llm.cli_llm_service import CLILLMService

        is_cli_mode = isinstance(llm_service, CLILLMService)

        await service.update_step_progress(
            task_id,
            gs(5),
            "running",
            step_name_override=f"{label_prefix}llm_key_tasks",
        )

        async with AsyncSessionLocal() as db:
            proj_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
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
            "detected_technologies": detected_techs,
            "commit_categories": analysis_result.get("commit_categories", {}),
            "total_commits": analysis_result.get("total_commits", 0),
            "lines_added": analysis_result.get("lines_added", 0),
            "lines_deleted": analysis_result.get("lines_deleted", 0),
            "files_changed": analysis_result.get("files_changed", 0),
        }

        if is_cli_mode:
            # CLI mode: sequential to avoid concurrent subprocess conflicts
            logger.info(
                "[MultiRepoAnalysis] %sCLI mode — running Steps 5→6 sequentially",
                label_prefix,
            )

            try:
                key_tasks, tokens = await _generate_key_tasks_bg(
                    project_id, analysis_result, llm_service, language
                )
                repo_tokens += tokens
                logger.info(
                    "[MultiRepoAnalysis] %sStep 5: %d key tasks, %d tokens",
                    label_prefix,
                    len(key_tasks),
                    tokens,
                )
            except Exception as e:
                logger.error(
                    "[MultiRepoAnalysis] %sStep 5 failed: %s: %s",
                    label_prefix,
                    type(e).__name__,
                    e,
                )

            await service.update_step_progress(
                task_id, gs(5), "completed", {"tasks": key_tasks}
            )
            await service.update_step_progress(
                task_id,
                gs(6),
                "running",
                step_name_override=f"{label_prefix}llm_detailed_content",
            )

            try:
                (
                    detailed_content,
                    tokens,
                ) = await github_service.generate_detailed_content(
                    project_data=project_data,
                    analysis_data=analysis_data_for_step6,
                    llm_service=llm_service,
                    language=language,
                )
                repo_tokens += tokens
                logger.info(
                    "[MultiRepoAnalysis] %sStep 6: impl=%d, tokens=%d",
                    label_prefix,
                    len(detailed_content.get("implementation_details", [])),
                    tokens,
                )
            except Exception as e:
                logger.error(
                    "[MultiRepoAnalysis] %sStep 6 failed: %s: %s",
                    label_prefix,
                    type(e).__name__,
                    e,
                )
        else:
            # API mode: parallel
            await service.update_step_progress(task_id, gs(6), "running")

            results = await asyncio.gather(
                _generate_key_tasks_bg(
                    project_id, analysis_result, llm_service, language
                ),
                github_service.generate_detailed_content(
                    project_data=project_data,
                    analysis_data=analysis_data_for_step6,
                    llm_service=llm_service,
                    language=language,
                ),
                return_exceptions=True,
            )

            if not isinstance(results[0], Exception):
                key_tasks, tokens = results[0]
                repo_tokens += tokens
            else:
                logger.warning(
                    "[MultiRepoAnalysis] Key tasks failed for %s: %s",
                    label_prefix,
                    results[0],
                )

            if not isinstance(results[1], Exception):
                detailed_content, tokens = results[1]
                repo_tokens += tokens
            else:
                logger.warning(
                    "[MultiRepoAnalysis] Detailed content failed for %s: %s",
                    label_prefix,
                    results[1],
                )

    await service.update_step_progress(
        task_id, gs(5), "completed", {"tasks": key_tasks}
    )
    await service.update_step_progress(
        task_id,
        gs(6),
        "completed",
        detailed_content,
        step_name_override=f"{label_prefix}llm_detailed_content",
    )

    # --- Post-processing for this repo ---
    if await service.check_cancelled(task_id):
        raise AnalysisCancelledException()

    # Generate AI summary
    ai_summary = None
    ai_key_features = None
    if llm_service:
        try:
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
                        summary_project_data,
                        style=summary_style,
                        language=language,
                    )
                    if summary_result:
                        ai_summary = summary_result.get("summary", "")
                        ai_key_features = summary_result.get("key_features", [])
                        # Add only the per-call token usage from summary (not cumulative total_tokens_used)
                        repo_tokens += summary_result.get("token_usage", 0)
        except Exception as e:
            logger.warning(
                "[MultiRepoAnalysis] AI summary failed for %s: %s", label_prefix, e
            )

    # Save LLM results (always saves language; key_tasks/detailed_content may be empty)
    await save_llm_results(
        analysis_id=analysis_id,
        project_id=project_id,
        is_primary=is_primary,
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
            "[MultiRepoAnalysis] Tech versions failed for %s: %s", label_prefix, e
        )

    if await service.check_cancelled(task_id):
        raise AnalysisCancelledException()

    # ContributorAnalysis for the current user
    if github_username:
        try:
            await save_contributor_analysis(
                analysis_id=analysis_id,
                github_service=github_service,
                git_url=git_url,
                github_username=github_username,
                label_prefix=label_prefix,
            )
        except Exception as e:
            logger.warning(
                "[MultiRepoAnalysis] ContributorAnalysis failed for %s: %s",
                label_prefix,
                e,
            )

    logger.info(
        "[MultiRepoAnalysis] Repo %s completed (tokens=%d)", label_prefix, repo_tokens
    )
    return repo_tokens
