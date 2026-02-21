"""GitHub contributor analysis, code quality, and detailed commits endpoints.

Handles contributor stats, code quality metrics, and Conventional Commit parsing.
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
from api.models.contributor_analysis import ContributorAnalysis
from api.schemas.github import (
    ContributorAnalysisResponse, ContributorsListResponse, ContributorSummary,
    CodeQualityMetrics, DetailedCommit,
)
from api.services.github import GitHubService
from api.services.github.github_exceptions import GitHubServiceError
from api.services.core import EncryptionService
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
encryption = EncryptionService()


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
