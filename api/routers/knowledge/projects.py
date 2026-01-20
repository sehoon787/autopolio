from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from api.database import get_db
from api.models.project import Project, Technology, ProjectTechnology
from api.models.user import User
from api.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse,
    TechnologyCreate, TechnologyResponse
)

router = APIRouter()


async def get_or_create_technology(
    db: AsyncSession,
    tech_name: str,
    category: Optional[str] = None
) -> Technology:
    """Get existing technology or create new one."""
    result = await db.execute(
        select(Technology).where(Technology.name == tech_name)
    )
    tech = result.scalar_one_or_none()
    if not tech:
        tech = Technology(name=tech_name, category=category)
        db.add(tech)
        await db.flush()
    return tech


@router.get("", response_model=ProjectListResponse)
async def get_projects(
    user_id: int = Query(..., description="User ID"),
    company_id: Optional[int] = None,
    project_type: Optional[str] = None,
    is_analyzed: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all projects for a user with optional filters."""
    query = select(Project).where(Project.user_id == user_id)

    if company_id is not None:
        query = query.where(Project.company_id == company_id)
    if project_type:
        query = query.where(Project.project_type == project_type)
    if is_analyzed is not None:
        query = query.where(Project.is_analyzed == (1 if is_analyzed else 0))

    query = query.options(
        selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
        selectinload(Project.achievements)
    ).order_by(Project.start_date.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    projects = result.scalars().all()

    # Count total
    count_query = select(Project).where(Project.user_id == user_id)
    if company_id is not None:
        count_query = count_query.where(Project.company_id == company_id)
    count_result = await db.execute(count_query)
    total = len(count_result.scalars().all())

    # Transform technologies for response
    projects_response = []
    for project in projects:
        project_dict = {
            "id": project.id,
            "user_id": project.user_id,
            "company_id": project.company_id,
            "name": project.name,
            "short_description": project.short_description,
            "description": project.description,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "team_size": project.team_size,
            "role": project.role,
            "contribution_percent": project.contribution_percent,
            "git_url": project.git_url,
            "project_type": project.project_type,
            "status": project.status,
            "links": project.links,
            "images": project.images,
            "is_analyzed": bool(project.is_analyzed),
            "ai_summary": project.ai_summary,
            "ai_key_features": project.ai_key_features,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
            "technologies": [
                {"id": pt.technology.id, "name": pt.technology.name, "category": pt.technology.category}
                for pt in project.technologies
            ],
            "achievements": project.achievements
        }
        projects_response.append(project_dict)

    return {
        "projects": projects_response,
        "total": total,
        "page": skip // limit + 1,
        "page_size": limit
    }


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific project by ID."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
            selectinload(Project.achievements),
            selectinload(Project.repo_analysis)
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Transform for response
    return {
        "id": project.id,
        "user_id": project.user_id,
        "company_id": project.company_id,
        "name": project.name,
        "short_description": project.short_description,
        "description": project.description,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "team_size": project.team_size,
        "role": project.role,
        "contribution_percent": project.contribution_percent,
        "git_url": project.git_url,
        "project_type": project.project_type,
        "status": project.status,
        "links": project.links,
        "images": project.images,
        "is_analyzed": bool(project.is_analyzed),
        "ai_summary": project.ai_summary,
        "ai_key_features": project.ai_key_features,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "technologies": [
            {"id": pt.technology.id, "name": pt.technology.name, "category": pt.technology.category}
            for pt in project.technologies
        ],
        "achievements": project.achievements
    }


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Extract technologies from data
    technologies = project_data.technologies or []
    project_dict = project_data.model_dump(exclude={"technologies"})

    project = Project(user_id=user_id, **project_dict)
    db.add(project)
    await db.flush()

    # Add technologies
    for tech_name in technologies:
        tech = await get_or_create_technology(db, tech_name)
        project_tech = ProjectTechnology(
            project_id=project.id,
            technology_id=tech.id
        )
        db.add(project_tech)

    await db.flush()
    await db.refresh(project)

    # Reload with relationships
    result = await db.execute(
        select(Project)
        .where(Project.id == project.id)
        .options(
            selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
            selectinload(Project.achievements)
        )
    )
    project = result.scalar_one()

    return {
        "id": project.id,
        "user_id": project.user_id,
        "company_id": project.company_id,
        "name": project.name,
        "short_description": project.short_description,
        "description": project.description,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "team_size": project.team_size,
        "role": project.role,
        "contribution_percent": project.contribution_percent,
        "git_url": project.git_url,
        "project_type": project.project_type,
        "status": project.status,
        "links": project.links,
        "images": project.images,
        "is_analyzed": bool(project.is_analyzed),
        "ai_summary": project.ai_summary,
        "ai_key_features": project.ai_key_features,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "technologies": [
            {"id": pt.technology.id, "name": pt.technology.name, "category": pt.technology.category}
            for pt in project.technologies
        ],
        "achievements": []
    }


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Handle technologies separately
    technologies = project_data.technologies
    update_data = project_data.model_dump(exclude_unset=True, exclude={"technologies"})

    for field, value in update_data.items():
        setattr(project, field, value)

    # Update technologies if provided
    if technologies is not None:
        # Remove existing
        await db.execute(
            select(ProjectTechnology).where(ProjectTechnology.project_id == project_id)
        )
        existing = await db.execute(
            select(ProjectTechnology).where(ProjectTechnology.project_id == project_id)
        )
        for pt in existing.scalars().all():
            await db.delete(pt)

        # Add new
        for tech_name in technologies:
            tech = await get_or_create_technology(db, tech_name)
            project_tech = ProjectTechnology(
                project_id=project.id,
                technology_id=tech.id
            )
            db.add(project_tech)

    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(Project)
        .where(Project.id == project.id)
        .options(
            selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
            selectinload(Project.achievements)
        )
    )
    project = result.scalar_one()

    return {
        "id": project.id,
        "user_id": project.user_id,
        "company_id": project.company_id,
        "name": project.name,
        "short_description": project.short_description,
        "description": project.description,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "team_size": project.team_size,
        "role": project.role,
        "contribution_percent": project.contribution_percent,
        "git_url": project.git_url,
        "project_type": project.project_type,
        "status": project.status,
        "links": project.links,
        "images": project.images,
        "is_analyzed": bool(project.is_analyzed),
        "ai_summary": project.ai_summary,
        "ai_key_features": project.ai_key_features,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "technologies": [
            {"id": pt.technology.id, "name": pt.technology.name, "category": pt.technology.category}
            for pt in project.technologies
        ],
        "achievements": project.achievements
    }


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)


# Technology endpoints
@router.get("/technologies/list", response_model=List[TechnologyResponse])
async def get_all_technologies(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get all available technologies."""
    query = select(Technology)
    if category:
        query = query.where(Technology.category == category)
    query = query.order_by(Technology.name)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/technologies", response_model=TechnologyResponse, status_code=status.HTTP_201_CREATED)
async def create_technology(
    tech_data: TechnologyCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new technology."""
    # Check if exists
    result = await db.execute(
        select(Technology).where(Technology.name == tech_data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Technology already exists")

    tech = Technology(**tech_data.model_dump())
    db.add(tech)
    await db.flush()
    await db.refresh(tech)
    return tech
