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
from api.models.project_repository import ProjectRepository
from api.schemas.github import (
    AnalysisContentUpdate, EffectiveAnalysisResponse, EditStatus,
    ContributorAnalysisResponse, ContributorsListResponse, ContributorSummary,
    CodeQualityMetrics, DetailedCommit,
    RepoAnalysisSummary, MultiRepoAnalysisResponse,
)
from api.services.github import GitHubService
from api.services.github.github_exceptions import GitHubServiceError
from api.services.core import EncryptionService
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
encryption = EncryptionService()


# ============ Inline Editing Endpoints ============

@router.get("/analysis/{project_id}/effective", response_model=EffectiveAnalysisResponse)
async def get_effective_analysis(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get repository analysis with user edits applied.

    For multi-repo projects, aggregates data from all repo analyses.
    """
    from api.services.analysis.analysis_aggregator import aggregate_analyses

    # Get ALL analyses for the project
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        .options(selectinload(RepoAnalysis.project_repository))
    )
    analyses = list(result.scalars().all())

    if not analyses:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Find the primary analysis (for id, git_url, and edits)
    primary = next(
        (a for a in analyses if a.project_repository and a.project_repository.is_primary),
        analyses[0]
    )

    # For multi-repo, aggregate data; for single repo, use directly
    if len(analyses) > 1:
        agg = aggregate_analyses(analyses)
    else:
        agg = None  # Use primary directly

    # Get user edits from primary analysis
    edits_result = await db.execute(
        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == primary.id)
    )
    edits = edits_result.scalar_one_or_none()

    # Build edit status
    edit_status = EditStatus(
        key_tasks_modified=edits.key_tasks_modified if edits else False,
        implementation_details_modified=edits.implementation_details_modified if edits else False,
        detailed_achievements_modified=edits.detailed_achievements_modified if edits else False,
    )

    # Source fields from aggregated data or primary analysis
    src_key_tasks = agg["key_tasks"] if agg else primary.key_tasks
    src_impl_details = agg["implementation_details"] if agg else primary.implementation_details
    src_achievements = agg["detailed_achievements"] if agg else primary.detailed_achievements

    # Apply edits to get effective content
    effective_key_tasks = (
        edits.key_tasks if edits and edits.key_tasks_modified and edits.key_tasks is not None
        else src_key_tasks
    )
    effective_implementation_details = (
        edits.implementation_details if edits and edits.implementation_details_modified and edits.implementation_details is not None
        else src_impl_details
    )
    effective_detailed_achievements = (
        edits.detailed_achievements if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None
        else src_achievements
    )

    if agg:
        return EffectiveAnalysisResponse(
            id=primary.id,
            project_id=project_id,
            git_url=primary.git_url,
            total_commits=agg["total_commits"],
            user_commits=agg["user_commits"],
            lines_added=agg["lines_added"],
            lines_deleted=agg["lines_deleted"],
            files_changed=agg["files_changed"],
            languages=agg["languages"],
            primary_language=agg["primary_language"],
            detected_technologies=agg["detected_technologies"],
            commit_messages_summary=agg["commit_messages_summary"],
            commit_categories=agg["commit_categories"],
            architecture_patterns=agg["architecture_patterns"],
            key_tasks=effective_key_tasks,
            implementation_details=effective_implementation_details,
            development_timeline=agg["development_timeline"],
            tech_stack_versions=agg["tech_stack_versions"],
            detailed_achievements=effective_detailed_achievements,
            ai_summary=agg.get("ai_summary"),
            ai_key_features=agg.get("ai_key_features"),
            analyzed_at=agg["analyzed_at"],
            edit_status=edit_status,
            analysis_language=primary.analysis_language or "ko",
        )

    return EffectiveAnalysisResponse(
        id=primary.id,
        project_id=primary.project_id,
        git_url=primary.git_url,
        total_commits=primary.total_commits,
        user_commits=primary.user_commits,
        lines_added=primary.lines_added,
        lines_deleted=primary.lines_deleted,
        files_changed=primary.files_changed,
        languages=primary.languages or {},
        primary_language=primary.primary_language,
        detected_technologies=primary.detected_technologies or [],
        commit_messages_summary=primary.commit_messages_summary,
        commit_categories=primary.commit_categories,
        architecture_patterns=primary.architecture_patterns,
        key_tasks=effective_key_tasks,
        implementation_details=effective_implementation_details,
        development_timeline=primary.development_timeline,
        tech_stack_versions=primary.tech_stack_versions,
        detailed_achievements=effective_detailed_achievements,
        ai_summary=primary.ai_summary,
        ai_key_features=primary.ai_key_features,
        analyzed_at=primary.analyzed_at,
        edit_status=edit_status,
        analysis_language=primary.analysis_language or "ko",
    )


@router.get("/analysis/{project_id}/per-repo", response_model=MultiRepoAnalysisResponse)
async def get_per_repo_analyses(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get all per-repo analysis breakdowns for a multi-repo project."""
    result = await db.execute(
        select(RepoAnalysis)
        .where(RepoAnalysis.project_id == project_id)
        .options(selectinload(RepoAnalysis.project_repository))
    )
    analyses = list(result.scalars().all())

    if not analyses:
        return MultiRepoAnalysisResponse(
            project_id=project_id,
            repo_count=0,
            analyses=[],
        )

    summaries = []
    for a in analyses:
        repo = a.project_repository
        summaries.append(RepoAnalysisSummary(
            repo_url=a.git_url,
            label=repo.label if repo else None,
            is_primary=repo.is_primary if repo else False,
            total_commits=a.total_commits or 0,
            user_commits=a.user_commits or 0,
            lines_added=a.lines_added or 0,
            lines_deleted=a.lines_deleted or 0,
            files_changed=a.files_changed or 0,
            detected_technologies=a.detected_technologies or [],
            primary_language=a.primary_language,
            key_tasks=a.key_tasks,
            implementation_details=a.implementation_details,
            detailed_achievements=a.detailed_achievements,
            ai_summary=a.ai_summary,
            ai_key_features=a.ai_key_features,
            languages=a.languages,
            commit_categories=a.commit_categories,
            development_timeline=a.development_timeline,
        ))

    return MultiRepoAnalysisResponse(
        project_id=project_id,
        repo_count=len(summaries),
        analyses=summaries,
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

    # Get analysis (prefer primary repo's analysis for multi-repo projects)
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        .outerjoin(ProjectRepository, RepoAnalysis.project_repository_id == ProjectRepository.id)
        .order_by(ProjectRepository.is_primary.desc().nullslast(), RepoAnalysis.id.asc())
    )
    analysis = result.scalars().first()

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

    # Get analysis (prefer primary repo's analysis for multi-repo projects)
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        .outerjoin(ProjectRepository, RepoAnalysis.project_repository_id == ProjectRepository.id)
        .order_by(ProjectRepository.is_primary.desc().nullslast(), RepoAnalysis.id.asc())
    )
    analysis = result.scalars().first()

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
    For multi-repo projects, aggregates contributor data across all repositories.
    """
    # Get user and project with repositories
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.repositories))
    )
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Collect all git URLs for this project
    repo_git_urls = []
    if project.repositories:
        repo_git_urls = [r.git_url for r in project.repositories if r.git_url]
    if not repo_git_urls and project.git_url:
        repo_git_urls = [project.git_url]
    if not repo_git_urls:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    # Get ALL repo analyses for the project
    analysis_result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    repo_analyses = list(analysis_result.scalars().all())

    if not repo_analyses:
        raise HTTPException(status_code=404, detail="Repository analysis not found. Run analysis first.")

    # Determine target username
    target_username = username or user.github_username
    if not target_username:
        raise HTTPException(status_code=400, detail="No username specified and user has no GitHub username")

    # Check for cached analyses across ALL repo analyses
    if not refresh:
        cached_list = []
        for ra in repo_analyses:
            cached_result = await db.execute(
                select(ContributorAnalysis).where(
                    ContributorAnalysis.repo_analysis_id == ra.id,
                    ContributorAnalysis.username == target_username
                )
            )
            cached = cached_result.scalar_one_or_none()
            if cached:
                cached_list.append(cached)

        if cached_list:
            # Merge cached contributor analyses across repos
            merged = _merge_contributor_analyses(cached_list, target_username)
            return ContributorAnalysisResponse(**merged)

    # Run fresh analysis for ALL repos
    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)
    is_primary = target_username == user.github_username

    try:
        all_analyses = []
        for idx, ra in enumerate(repo_analyses):
            git_url = ra.git_url
            try:
                analysis = await github_service.analyze_contributor(
                    git_url,
                    target_username,
                    commit_limit=100
                )
                all_analyses.append((ra, analysis))
            except Exception as e:
                logger.warning("Contributor analysis failed for %s: %s", git_url, e)
                continue

        if not all_analyses:
            raise HTTPException(status_code=404, detail="No contributor data found in any repository")

        # Save each per-repo contributor analysis
        for ra, analysis in all_analyses:
            existing = await db.execute(
                select(ContributorAnalysis).where(
                    ContributorAnalysis.repo_analysis_id == ra.id,
                    ContributorAnalysis.username == target_username
                )
            )
            contributor = existing.scalar_one_or_none()

            if contributor:
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
                contributor = ContributorAnalysis(
                    repo_analysis_id=ra.id,
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

        # Merge all analyses for response
        merged_data = [a for _, a in all_analyses]
        merged = _merge_contributor_data(merged_data, target_username, is_primary)
        return ContributorAnalysisResponse(**merged)

    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to analyze contributor: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze contributor: {str(e)}")


def _merge_contributor_analyses(cached_list, username: str) -> dict:
    """Merge multiple cached ContributorAnalysis ORM objects into one response dict."""
    all_data = []
    for c in cached_list:
        all_data.append({
            "total_commits": c.total_commits or 0,
            "first_commit_date": c.first_commit_date,
            "last_commit_date": c.last_commit_date,
            "lines_added": c.lines_added or 0,
            "lines_deleted": c.lines_deleted or 0,
            "file_extensions": c.file_extensions or {},
            "work_areas": c.work_areas or [],
            "detected_technologies": c.detected_technologies or [],
            "detailed_commits": c.detailed_commits or [],
            "commit_types": c.commit_types or {},
        })
    is_primary = any(c.is_primary for c in cached_list)
    email = next((c.email for c in cached_list if c.email), None)
    return _merge_contributor_data(all_data, username, is_primary, email)


def _merge_contributor_data(data_list: list, username: str, is_primary: bool, email: str = None) -> dict:
    """Merge multiple contributor analysis dicts into one."""
    if len(data_list) == 1:
        d = data_list[0]
        return {
            "username": username,
            "email": email,
            "is_primary": is_primary,
            "total_commits": d["total_commits"],
            "first_commit_date": d.get("first_commit_date"),
            "last_commit_date": d.get("last_commit_date"),
            "lines_added": d["lines_added"],
            "lines_deleted": d["lines_deleted"],
            "file_extensions": d.get("file_extensions", {}),
            "work_areas": list(set(d.get("work_areas", []))),
            "detected_technologies": d.get("detected_technologies", []),
            "detailed_commits": [
                DetailedCommit(**c) if isinstance(c, dict) else c
                for c in d.get("detailed_commits", [])
            ],
            "commit_types": d.get("commit_types", {}),
        }

    # Aggregate across multiple repos
    total_commits = sum(d["total_commits"] for d in data_list)
    lines_added = sum(d["lines_added"] for d in data_list)
    lines_deleted = sum(d["lines_deleted"] for d in data_list)

    # Earliest first_commit, latest last_commit
    first_dates = [d["first_commit_date"] for d in data_list if d.get("first_commit_date")]
    last_dates = [d["last_commit_date"] for d in data_list if d.get("last_commit_date")]

    # Merge file extensions (sum counts)
    merged_ext = {}
    for d in data_list:
        for ext, count in (d.get("file_extensions") or {}).items():
            merged_ext[ext] = merged_ext.get(ext, 0) + (count if isinstance(count, (int, float)) else 0)

    # Merge work areas (deduplicate)
    merged_areas = list(set(
        area for d in data_list for area in (d.get("work_areas") or [])
    ))

    # Merge technologies (deduplicate, preserve order)
    seen_tech = set()
    merged_tech = []
    for d in data_list:
        for tech in (d.get("detected_technologies") or []):
            if tech not in seen_tech:
                seen_tech.add(tech)
                merged_tech.append(tech)

    # Merge commit types (sum counts)
    merged_types = {}
    for d in data_list:
        for ctype, count in (d.get("commit_types") or {}).items():
            merged_types[ctype] = merged_types.get(ctype, 0) + (count if isinstance(count, int) else 0)

    # Merge detailed commits
    all_commits = []
    for d in data_list:
        for c in (d.get("detailed_commits") or []):
            if isinstance(c, dict):
                all_commits.append(DetailedCommit(**c))
            else:
                all_commits.append(c)

    return {
        "username": username,
        "email": email,
        "is_primary": is_primary,
        "total_commits": total_commits,
        "first_commit_date": min(first_dates) if first_dates else None,
        "last_commit_date": max(last_dates) if last_dates else None,
        "lines_added": lines_added,
        "lines_deleted": lines_deleted,
        "file_extensions": merged_ext,
        "work_areas": merged_areas,
        "detected_technologies": merged_tech,
        "detailed_commits": all_commits,
        "commit_types": merged_types,
    }


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

        # Update repo analysis with metrics if exists (use first() for multi-repo compat)
        analysis_result = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        )
        repo_analysis = analysis_result.scalars().first()

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
