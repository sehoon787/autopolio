"""GitHub analysis inline editing endpoints.

Handles effective analysis retrieval, per-repo breakdowns, content editing, and field reset.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.database import get_db
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from api.models.project_repository import ProjectRepository
from api.schemas.github import (
    AnalysisContentUpdate, EffectiveAnalysisResponse, EditStatus,
    RepoAnalysisSummary, MultiRepoAnalysisResponse,
)
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])


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
