"""GitHub background job endpoints.

Handles background analysis jobs, status tracking, and cancellation.
"""
import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from api.database import get_db
from api.models.user import User
from api.models.project import Project
from api.schemas.github import (
    RepoAnalysisRequest,
    AnalysisJobStatus, AnalysisJobListResponse,
    StartAnalysisResponse, CancelAnalysisResponse,
)
from api.services.github import GitHubService
from api.services.core import EncryptionService
from api.models.project_repository import ProjectRepository
from api.services.analysis import AnalysisJobService, run_background_analysis, run_multi_repo_background_analysis
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
encryption = EncryptionService()


def _extract_token_and_provider(job) -> tuple:
    """Extract token_usage and llm_provider from a Job model.

    Returns (token_usage, llm_provider) tuple.
    """
    token_usage = None
    if job.output_data and isinstance(job.output_data, dict):
        token_usage = job.output_data.get("total_tokens")

    llm_provider = None
    if job.input_data and isinstance(job.input_data, dict):
        options = job.input_data.get("options", {})
        llm_provider = options.get("provider") or options.get("cli_mode")

    if job.status == "completed":
        logger.debug("[TokenExtract] task_id=%s, token_usage=%s, llm_provider=%s, output_data=%s",
                     job.task_id, token_usage, llm_provider,
                     {k: v for k, v in (job.output_data or {}).items() if k != "analysis_id"})

    return token_usage, llm_provider


def _build_job_status(job) -> AnalysisJobStatus:
    """Build AnalysisJobStatus from a Job model."""
    token_usage, llm_provider = _extract_token_and_provider(job)
    return AnalysisJobStatus(
        task_id=job.task_id,
        project_id=job.target_project_id,
        status=job.status,
        progress=job.progress,
        current_step=job.current_step,
        total_steps=job.total_steps,
        step_name=job.step_name,
        error_message=job.error_message,
        partial_results=job.partial_results,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
        token_usage=token_usage,
        llm_provider=llm_provider,
    )


@router.post("/analyze-background", response_model=StartAnalysisResponse)
async def start_background_analysis(
    request: RepoAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    provider: Optional[str] = Query(None, description="LLM provider to use"),
    cli_mode: Optional[str] = Query(None, description="CLI mode: 'claude_code' or 'gemini_cli'"),
    cli_model: Optional[str] = Query(None, description="CLI model name"),
    language: Optional[str] = Query(None, description="Analysis language: 'ko' or 'en'"),
    project_repository_id: Optional[int] = Query(None, description="Specific ProjectRepository to analyze"),
    db: AsyncSession = Depends(get_db)
):
    """Start a background analysis job for a GitHub repository.

    Returns immediately with a task_id that can be used to track progress.
    """
    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub is not connected. Please connect GitHub first.")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
        github_username = user.github_username
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub token is corrupted. Please reconnect.")

    # Get or create project
    project_id = request.project_id
    if project_id:
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    else:
        # Create project
        github_service = GitHubService(token)
        repo_info = await github_service.get_repo_info(request.git_url)
        project = Project(
            user_id=user_id,
            name=repo_info["name"],
            description=repo_info.get("description"),
            git_url=request.git_url,
            project_type="personal",
            status="pending"
        )
        db.add(project)
        await db.flush()
        await db.refresh(project)
        project_id = project.id

    # Check if there's already an active job for this project
    service = AnalysisJobService(db)
    existing_job = await service.get_job_by_project(project_id)
    if existing_job:
        return StartAnalysisResponse(
            task_id=existing_job.task_id,
            project_id=project_id,
            message="Analysis already in progress"
        )

    # Build options
    options = {}
    if cli_mode:
        options["cli_mode"] = cli_mode
        options["cli_model"] = cli_model
    elif provider:
        options["provider"] = provider
    if language:
        options["language"] = language

    # Resolve user's LLM API key (user DB first, then .env fallback)
    llm_provider = provider or cli_mode
    if llm_provider and llm_provider not in ("claude_code", "gemini_cli"):
        try:
            key_attr = f"{llm_provider}_api_key_encrypted"
            encrypted_key = getattr(user, key_attr, None)
            if encrypted_key:
                options["api_key"] = encryption.decrypt(encrypted_key)
        except Exception:
            pass  # fall back to settings

    # Load project repositories
    proj_with_repos = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.repositories))
    )
    project_with_repos = proj_with_repos.scalar_one_or_none()
    repositories = list(project_with_repos.repositories) if project_with_repos else []

    is_multi_repo = len(repositories) > 1

    # Create job with total_steps adjusted for multi-repo
    from api.services.analysis.analysis_job_runner import STEPS_PER_REPO
    job = await service.create_analysis_job(
        user_id=user_id,
        project_id=project_id,
        git_url=request.git_url,
        options=options
    )
    # Override total_steps for multi-repo
    if is_multi_repo:
        job.total_steps = STEPS_PER_REPO * len(repositories)
        await db.flush()

    await db.commit()

    # Start background analysis task
    if is_multi_repo:
        repo_list = [
            {
                "id": r.id,
                "git_url": r.git_url,
                "label": r.label,
                "is_primary": bool(r.is_primary),
            }
            for r in sorted(repositories, key=lambda r: (not r.is_primary, r.display_order))
        ]
        asyncio.create_task(run_multi_repo_background_analysis(
            task_id=job.task_id,
            user_id=user_id,
            project_id=project_id,
            github_username=github_username,
            github_token=token,
            repositories=repo_list,
            options=options,
        ))
        message = f"Multi-repo analysis started ({len(repositories)} repos)"
    else:
        # Single repo: use existing logic
        # Determine git_url and project_repository_id
        effective_git_url = request.git_url
        effective_repo_id = project_repository_id
        if len(repositories) == 1 and not effective_repo_id:
            effective_repo_id = repositories[0].id
            effective_git_url = repositories[0].git_url

        asyncio.create_task(run_background_analysis(
            task_id=job.task_id,
            user_id=user_id,
            project_id=project_id,
            git_url=effective_git_url,
            github_username=github_username,
            github_token=token,
            options=options,
            project_repository_id=effective_repo_id,
        ))
        message = "Analysis started in background"

    return StartAnalysisResponse(
        task_id=job.task_id,
        project_id=project_id,
        message=message,
    )


@router.get("/active-analyses", response_model=AnalysisJobListResponse)
async def get_active_analyses(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all active analysis jobs for a user."""
    service = AnalysisJobService(db)
    jobs = await service.get_active_jobs_for_user(user_id)

    return AnalysisJobListResponse(
        jobs=[_build_job_status(job) for job in jobs],
        total=len(jobs)
    )


@router.get("/analysis-status/{project_id}", response_model=Optional[AnalysisJobStatus])
async def get_analysis_status(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get the status of an active analysis job for a project."""
    service = AnalysisJobService(db)
    job = await service.get_job_by_project(project_id)

    if not job:
        return None

    # Verify user owns this job
    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this job")

    return _build_job_status(job)


@router.post("/analysis/{project_id}/cancel", response_model=CancelAnalysisResponse)
async def cancel_analysis(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Cancel an in-progress analysis for a project.

    Partial results will be saved if any steps completed.
    """
    service = AnalysisJobService(db)
    job = await service.get_job_by_project(project_id)

    if not job:
        raise HTTPException(status_code=404, detail="No active analysis found for this project")

    # Verify user owns this job
    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this job")

    # Cancel the job
    cancelled_job = await service.cancel_job(job.task_id)
    await db.commit()

    partial_saved = bool(cancelled_job.partial_results)

    return CancelAnalysisResponse(
        task_id=cancelled_job.task_id,
        project_id=project_id,
        status=cancelled_job.status,
        message="Analysis cancelled" + (" with partial results saved" if partial_saved else ""),
        partial_saved=partial_saved
    )


@router.get("/job/{task_id}", response_model=AnalysisJobStatus)
async def get_job_status(
    task_id: str,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get the status of a specific analysis job by task_id."""
    service = AnalysisJobService(db)
    job = await service.get_job(task_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Verify user owns this job
    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this job")

    return _build_job_status(job)
