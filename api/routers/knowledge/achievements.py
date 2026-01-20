from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel

from api.database import get_db
from api.models.achievement import ProjectAchievement
from api.models.project import Project, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.user import User
from api.schemas.project import AchievementCreate, AchievementUpdate, AchievementResponse
from api.services.achievement_service import AchievementService
from api.services.encryption_service import EncryptionService

router = APIRouter()


class AutoDetectResponse(BaseModel):
    """Response for auto-detect achievements endpoint."""
    project_id: int
    detected_achievements: List[dict]
    saved_achievements: List[AchievementResponse]
    stats: dict
    message: str


@router.get("", response_model=List[AchievementResponse])
async def get_achievements(
    project_id: int = Query(..., description="Project ID"),
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get all achievements for a project."""
    query = select(ProjectAchievement).where(
        ProjectAchievement.project_id == project_id
    )
    if category:
        query = query.where(ProjectAchievement.category == category)
    query = query.order_by(ProjectAchievement.display_order)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{achievement_id}", response_model=AchievementResponse)
async def get_achievement(achievement_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific achievement by ID."""
    result = await db.execute(
        select(ProjectAchievement).where(ProjectAchievement.id == achievement_id)
    )
    achievement = result.scalar_one_or_none()
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")
    return achievement


@router.post("", response_model=AchievementResponse, status_code=status.HTTP_201_CREATED)
async def create_achievement(
    achievement_data: AchievementCreate,
    project_id: int = Query(..., description="Project ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new achievement for a project."""
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    achievement = ProjectAchievement(
        project_id=project_id,
        **achievement_data.model_dump()
    )
    db.add(achievement)
    await db.flush()
    await db.refresh(achievement)
    return achievement


@router.put("/{achievement_id}", response_model=AchievementResponse)
async def update_achievement(
    achievement_id: int,
    achievement_data: AchievementUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an achievement."""
    result = await db.execute(
        select(ProjectAchievement).where(ProjectAchievement.id == achievement_id)
    )
    achievement = result.scalar_one_or_none()
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    update_data = achievement_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(achievement, field, value)

    await db.flush()
    await db.refresh(achievement)
    return achievement


@router.delete("/{achievement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_achievement(achievement_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an achievement."""
    result = await db.execute(
        select(ProjectAchievement).where(ProjectAchievement.id == achievement_id)
    )
    achievement = result.scalar_one_or_none()
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    await db.delete(achievement)


@router.post("/bulk", response_model=List[AchievementResponse], status_code=status.HTTP_201_CREATED)
async def create_achievements_bulk(
    achievements_data: List[AchievementCreate],
    project_id: int = Query(..., description="Project ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create multiple achievements for a project at once."""
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    achievements = []
    for i, data in enumerate(achievements_data):
        achievement = ProjectAchievement(
            project_id=project_id,
            display_order=data.display_order or i,
            **data.model_dump(exclude={"display_order"})
        )
        db.add(achievement)
        achievements.append(achievement)

    await db.flush()
    for achievement in achievements:
        await db.refresh(achievement)

    return achievements


@router.post("/auto-detect", response_model=AutoDetectResponse)
async def auto_detect_achievements(
    project_id: int = Query(..., description="Project ID"),
    use_llm: bool = Query(True, description="Use LLM to generate additional achievements"),
    save_to_db: bool = Query(True, description="Save detected achievements to database"),
    db: AsyncSession = Depends(get_db)
):
    """
    Automatically detect achievements from project data.

    Detects achievements from:
    1. Project description (pattern matching)
    2. Commit messages (if analyzed)
    3. Code statistics (commits, lines added/deleted)
    4. LLM-based generation (optional)
    """
    # Get project with related data
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
            selectinload(Project.repo_analysis),
            selectinload(Project.achievements)
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get user for LLM provider
    user_result = await db.execute(select(User).where(User.id == project.user_id))
    user = user_result.scalar_one_or_none()

    # Prepare project data for achievement detection
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

    # Add repo analysis data if available
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
        # Parse commit messages from summary
        if repo_analysis.commit_messages_summary:
            commit_messages = repo_analysis.commit_messages_summary.split("\n")

    # Get LLM provider from user settings
    llm_provider = None
    if use_llm and user:
        llm_provider = user.preferred_llm

    # Detect achievements
    achievement_service = AchievementService(llm_provider=llm_provider)
    detected_achievements, stats = await achievement_service.detect_all(
        project_data=project_data,
        commit_messages=commit_messages,
        use_llm=use_llm and llm_provider is not None
    )

    # Filter out achievements that already exist
    existing_keys = {(a.metric_name, a.metric_value) for a in project.achievements}
    new_achievements = [
        a for a in detected_achievements
        if (a["metric_name"], a["metric_value"]) not in existing_keys
    ]

    saved_achievements = []
    if save_to_db and new_achievements:
        # Save new achievements to database
        for i, a in enumerate(new_achievements):
            achievement = ProjectAchievement(
                project_id=project_id,
                metric_name=a["metric_name"],
                metric_value=a["metric_value"],
                description=a.get("description"),
                category=a.get("category"),
                evidence=a.get("evidence"),
                display_order=len(project.achievements) + i
            )
            db.add(achievement)
            saved_achievements.append(achievement)

        await db.flush()
        for achievement in saved_achievements:
            await db.refresh(achievement)

    return AutoDetectResponse(
        project_id=project_id,
        detected_achievements=new_achievements,
        saved_achievements=saved_achievements,
        stats=stats,
        message=f"{len(new_achievements)}개의 새로운 성과가 감지되었습니다." +
                (f" {len(saved_achievements)}개가 저장되었습니다." if save_to_db else "")
    )


@router.post("/auto-detect-all")
async def auto_detect_all_projects(
    user_id: int = Query(..., description="User ID"),
    use_llm: bool = Query(False, description="Use LLM (can be slow)"),
    save_to_db: bool = Query(True, description="Save detected achievements"),
    db: AsyncSession = Depends(get_db)
):
    """
    Auto-detect achievements for all projects of a user.
    LLM is disabled by default for batch operations.
    """
    # Get all projects for user
    result = await db.execute(
        select(Project)
        .where(Project.user_id == user_id)
        .options(
            selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
            selectinload(Project.repo_analysis),
            selectinload(Project.achievements)
        )
    )
    projects = result.scalars().all()

    if not projects:
        raise HTTPException(status_code=404, detail="No projects found for user")

    # Get user for LLM provider
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    llm_provider = user.preferred_llm if use_llm and user else None

    results = []
    total_detected = 0
    total_saved = 0

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

        # Detect achievements
        achievement_service = AchievementService(llm_provider=llm_provider)
        detected_achievements, stats = await achievement_service.detect_all(
            project_data=project_data,
            commit_messages=commit_messages,
            use_llm=use_llm and llm_provider is not None
        )

        # Filter existing
        existing_keys = {(a.metric_name, a.metric_value) for a in project.achievements}
        new_achievements = [
            a for a in detected_achievements
            if (a["metric_name"], a["metric_value"]) not in existing_keys
        ]

        saved_count = 0
        if save_to_db and new_achievements:
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

        total_detected += len(new_achievements)
        total_saved += saved_count

        results.append({
            "project_id": project.id,
            "project_name": project.name,
            "detected": len(new_achievements),
            "saved": saved_count
        })

    if save_to_db:
        await db.flush()

    return {
        "user_id": user_id,
        "projects_processed": len(projects),
        "total_detected": total_detected,
        "total_saved": total_saved,
        "results": results
    }
