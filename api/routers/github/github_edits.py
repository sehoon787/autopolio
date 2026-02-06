"""GitHub analysis editing and extended analysis endpoints.

Handles inline editing, contributor analysis, code quality metrics, and detailed commits.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from api.database import get_db
from api.models.user import User
from api.models.project import Project
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from api.models.contributor_analysis import ContributorAnalysis
from api.schemas.github import (
    AnalysisContentUpdate, EffectiveAnalysisResponse, EditStatus,
    ContributorAnalysisResponse, ContributorsListResponse, ContributorSummary,
    CodeQualityMetrics, DetailedCommit,
)
from api.services.github import GitHubService
from api.services.github.github_exceptions import GitHubServiceError
from api.services.core import EncryptionService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
encryption = EncryptionService()


# ============ Inline Editing Endpoints ============

@router.get("/analysis/{project_id}/effective", response_model=EffectiveAnalysisResponse)
async def get_effective_analysis(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get repository analysis with user edits applied."""
    # Get analysis
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get user edits if any
    edits_result = await db.execute(
        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
    )
    edits = edits_result.scalar_one_or_none()

    # Build edit status
    edit_status = EditStatus(
        key_tasks_modified=edits.key_tasks_modified if edits else False,
        implementation_details_modified=edits.implementation_details_modified if edits else False,
        detailed_achievements_modified=edits.detailed_achievements_modified if edits else False,
    )

    # Apply edits to get effective content
    effective_key_tasks = (
        edits.key_tasks if edits and edits.key_tasks_modified and edits.key_tasks is not None
        else analysis.key_tasks
    )
    effective_implementation_details = (
        edits.implementation_details if edits and edits.implementation_details_modified and edits.implementation_details is not None
        else analysis.implementation_details
    )
    effective_detailed_achievements = (
        edits.detailed_achievements if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None
        else analysis.detailed_achievements
    )

    return EffectiveAnalysisResponse(
        id=analysis.id,
        project_id=analysis.project_id,
        git_url=analysis.git_url,
        total_commits=analysis.total_commits,
        user_commits=analysis.user_commits,
        lines_added=analysis.lines_added,
        lines_deleted=analysis.lines_deleted,
        files_changed=analysis.files_changed,
        languages=analysis.languages or {},
        primary_language=analysis.primary_language,
        detected_technologies=analysis.detected_technologies or [],
        commit_messages_summary=analysis.commit_messages_summary,
        commit_categories=analysis.commit_categories,
        architecture_patterns=analysis.architecture_patterns,
        key_tasks=effective_key_tasks,
        implementation_details=effective_implementation_details,
        development_timeline=analysis.development_timeline,
        tech_stack_versions=analysis.tech_stack_versions,
        detailed_achievements=effective_detailed_achievements,
        analyzed_at=analysis.analyzed_at,
        edit_status=edit_status
    )


@router.patch("/analysis/{project_id}/content")
async def update_analysis_content(
    project_id: int,
    update: AnalysisContentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update specific analysis content field."""
    # Validate field name
    valid_fields = ['key_tasks', 'implementation_details', 'detailed_achievements']
    if update.field not in valid_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field. Must be one of: {', '.join(valid_fields)}"
        )

    # Get analysis
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get or create edits record
    edits_result = await db.execute(
        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
    )
    edits = edits_result.scalar_one_or_none()

    if not edits:
        edits = RepoAnalysisEdits(repo_analysis_id=analysis.id)
        db.add(edits)

    # Update the specific field
    if update.field == 'key_tasks':
        edits.key_tasks = update.content
        edits.key_tasks_modified = True
    elif update.field == 'implementation_details':
        edits.implementation_details = update.content
        edits.implementation_details_modified = True
    elif update.field == 'detailed_achievements':
        edits.detailed_achievements = update.content
        edits.detailed_achievements_modified = True

    await db.commit()

    return {
        "success": True,
        "field": update.field,
        "message": f"{update.field} content has been saved."
    }


@router.post("/analysis/{project_id}/reset/{field}")
async def reset_analysis_field(
    project_id: int,
    field: str,
    db: AsyncSession = Depends(get_db)
):
    """Reset a specific field to original analysis content."""
    # Validate field name
    valid_fields = ['key_tasks', 'implementation_details', 'detailed_achievements']
    if field not in valid_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field. Must be one of: {', '.join(valid_fields)}"
        )

    # Get analysis
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get edits record
    edits_result = await db.execute(
        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
    )
    edits = edits_result.scalar_one_or_none()

    if not edits:
        return {
            "success": True,
            "field": field,
            "message": "No modifications exist."
        }

    # Reset the specific field
    if field == 'key_tasks':
        edits.key_tasks = None
        edits.key_tasks_modified = False
    elif field == 'implementation_details':
        edits.implementation_details = None
        edits.implementation_details_modified = False
    elif field == 'detailed_achievements':
        edits.detailed_achievements = None
        edits.detailed_achievements_modified = False

    await db.commit()

    return {
        "success": True,
        "field": field,
        "message": f"{field} content has been reset to original."
    }


# ============ Extended Analysis Endpoints (v1.10) ============

@router.get("/contributors/{project_id}", response_model=ContributorsListResponse)
async def get_contributors(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all contributors for a project's repository."""
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        contributors = await github_service.get_all_contributors(project.git_url)
        return ContributorsListResponse(
            contributors=[ContributorSummary(**c) for c in contributors],
            total=len(contributors)
        )
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch contributors: {str(e)}")


@router.get("/contributor-analysis/{project_id}", response_model=ContributorAnalysisResponse)
async def get_contributor_analysis(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    username: Optional[str] = Query(
        None,
        description="Username to analyze (defaults to logged-in user)",
        max_length=39,
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$"
    ),
    refresh: bool = Query(False, description="Force refresh analysis"),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed contributor analysis for a project.

    If username is not provided, analyzes the logged-in user's contributions.
    """
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    # Get repo analysis
    analysis_result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    repo_analysis = analysis_result.scalar_one_or_none()

    if not repo_analysis:
        raise HTTPException(status_code=404, detail="Repository analysis not found. Run analysis first.")

    # Determine target username
    target_username = username or user.github_username
    if not target_username:
        raise HTTPException(status_code=400, detail="No username specified and user has no GitHub username")

    # Check for cached analysis
    if not refresh:
        cached_result = await db.execute(
            select(ContributorAnalysis).where(
                ContributorAnalysis.repo_analysis_id == repo_analysis.id,
                ContributorAnalysis.username == target_username
            )
        )
        cached = cached_result.scalar_one_or_none()
        if cached:
            return ContributorAnalysisResponse(
                username=cached.username,
                email=cached.email,
                is_primary=cached.is_primary,
                total_commits=cached.total_commits,
                first_commit_date=cached.first_commit_date,
                last_commit_date=cached.last_commit_date,
                lines_added=cached.lines_added,
                lines_deleted=cached.lines_deleted,
                file_extensions=cached.file_extensions or {},
                work_areas=cached.work_areas or [],
                detected_technologies=cached.detected_technologies or [],
                detailed_commits=[DetailedCommit(**c) for c in (cached.detailed_commits or [])],
                commit_types=cached.commit_types or {},
            )

    # Run fresh analysis
    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        analysis = await github_service.analyze_contributor(
            project.git_url,
            target_username,
            commit_limit=100
        )

        # Save to database
        existing = await db.execute(
            select(ContributorAnalysis).where(
                ContributorAnalysis.repo_analysis_id == repo_analysis.id,
                ContributorAnalysis.username == target_username
            )
        )
        contributor = existing.scalar_one_or_none()

        is_primary = target_username == user.github_username

        if contributor:
            # Update existing
            contributor.total_commits = analysis["total_commits"]
            contributor.first_commit_date = analysis["first_commit_date"]
            contributor.last_commit_date = analysis["last_commit_date"]
            contributor.lines_added = analysis["lines_added"]
            contributor.lines_deleted = analysis["lines_deleted"]
            contributor.file_extensions = analysis["file_extensions"]
            contributor.work_areas = analysis["work_areas"]
            contributor.detected_technologies = analysis["detected_technologies"]
            contributor.detailed_commits = analysis["detailed_commits"]
            contributor.commit_types = analysis["commit_types"]
            contributor.is_primary = is_primary
        else:
            # Create new
            contributor = ContributorAnalysis(
                repo_analysis_id=repo_analysis.id,
                username=target_username,
                is_primary=is_primary,
                total_commits=analysis["total_commits"],
                first_commit_date=analysis["first_commit_date"],
                last_commit_date=analysis["last_commit_date"],
                lines_added=analysis["lines_added"],
                lines_deleted=analysis["lines_deleted"],
                file_extensions=analysis["file_extensions"],
                work_areas=analysis["work_areas"],
                detected_technologies=analysis["detected_technologies"],
                detailed_commits=analysis["detailed_commits"],
                commit_types=analysis["commit_types"],
            )
            db.add(contributor)

        await db.commit()

        return ContributorAnalysisResponse(
            username=target_username,
            is_primary=is_primary,
            total_commits=analysis["total_commits"],
            first_commit_date=analysis["first_commit_date"],
            last_commit_date=analysis["last_commit_date"],
            lines_added=analysis["lines_added"],
            lines_deleted=analysis["lines_deleted"],
            file_extensions=analysis["file_extensions"],
            work_areas=analysis["work_areas"],
            detected_technologies=analysis["detected_technologies"],
            detailed_commits=[DetailedCommit(**c) for c in analysis["detailed_commits"]],
            commit_types=analysis["commit_types"],
        )

    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.exception("Failed to analyze contributor: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze contributor: {str(e)}")


@router.get("/code-quality/{project_id}", response_model=CodeQualityMetrics)
async def get_code_quality(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get code quality metrics for a project's repository."""
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        metrics = await github_service.analyze_code_quality(project.git_url)

        # Update repo analysis with metrics if exists
        analysis_result = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        )
        repo_analysis = analysis_result.scalar_one_or_none()

        if repo_analysis:
            repo_analysis.code_quality_metrics = metrics
            await db.commit()

        return CodeQualityMetrics(**metrics)

    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.exception("Failed to analyze code quality: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze code quality: {str(e)}")


@router.get("/detailed-commits/{project_id}")
async def get_detailed_commits(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    author: Optional[str] = Query(
        None,
        description="Filter by author username",
        max_length=39,
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$"
    ),
    limit: int = Query(50, description="Maximum commits to return", le=100),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed commit history with Conventional Commit parsing."""
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        commits = await github_service.get_detailed_commits(
            project.git_url,
            author=author,
            limit=limit
        )

        return {
            "commits": commits,
            "total": len(commits),
            "author": author,
        }

    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.exception("Failed to get detailed commits: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get detailed commits: {str(e)}")
