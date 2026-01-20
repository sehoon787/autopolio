from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from api.database import get_db
from api.models.achievement import ProjectAchievement
from api.models.project import Project
from api.schemas.project import AchievementCreate, AchievementUpdate, AchievementResponse

router = APIRouter()


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
