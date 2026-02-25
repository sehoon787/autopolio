from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import date

from api.database import get_db
from api.models.project import Project, Technology, ProjectTechnology
from api.models.project_repository import ProjectRepository
from api.models.achievement import ProjectAchievement
from api.models.company import Company
from api.models.user import User
from api.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    TechnologyCreate,
    TechnologyResponse,
    ProjectRepositoryCreate,
)

router = APIRouter()

# Code contribution keywords to filter out (not a real achievement)
CODE_CONTRIBUTION_KEYWORDS = ["코드 기여", "Code Contribution", "code contribution"]

# Standard selectinload options for project queries
PROJECT_LOAD_OPTIONS = [
    selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
    selectinload(Project.achievements),
    selectinload(Project.repositories).selectinload(ProjectRepository.repo_analysis),
    selectinload(Project.repo_analyses),
]


def filter_achievements(
    achievements: List[ProjectAchievement],
) -> List[ProjectAchievement]:
    """Filter out code contribution achievements (lines added/deleted is not a real achievement)."""
    return [
        a
        for a in achievements
        if not any(kw in (a.metric_name or "") for kw in CODE_CONTRIBUTION_KEYWORDS)
    ]


def _build_project_response(project: Project) -> Dict[str, Any]:
    """Build a project response dict from an ORM object."""
    # Compute last_analyzed_at, analysis_language, and ai_tools_detected from repo_analyses
    last_analyzed_at = None
    latest_analysis = None  # track the most recent analysis for language/ai_tools
    # Try per-repo analyses first (multi-repo projects with project_repository_id set)
    for repo in project.repositories or []:
        ra = repo.repo_analysis
        if ra and ra.analyzed_at:
            if last_analyzed_at is None or ra.analyzed_at > last_analyzed_at:
                last_analyzed_at = ra.analyzed_at
                latest_analysis = ra
    # Fallback: check project-level repo_analyses (for older data without project_repository_id)
    if last_analyzed_at is None:
        for ra in project.repo_analyses or []:
            if ra.analyzed_at:
                if last_analyzed_at is None or ra.analyzed_at > last_analyzed_at:
                    last_analyzed_at = ra.analyzed_at
                    latest_analysis = ra

    # Derive analysis_language from latest analysis
    analysis_language = (
        latest_analysis.analysis_language
        if latest_analysis and hasattr(latest_analysis, "analysis_language")
        else None
    )

    # Aggregate ai_tools_detected across all repo analyses
    all_ai_tools: Dict[str, Dict[str, Any]] = {}
    for ra in project.repo_analyses or []:
        if ra.ai_tools_detected:
            for tool_info in ra.ai_tools_detected:
                tool_name = tool_info.get("tool", "")
                if tool_name in all_ai_tools:
                    all_ai_tools[tool_name]["count"] += tool_info.get("count", 0)
                else:
                    all_ai_tools[tool_name] = {**tool_info}
    ai_tools_detected = list(all_ai_tools.values()) if all_ai_tools else None

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
        "last_analyzed_at": last_analyzed_at,
        "analysis_language": analysis_language,
        "ai_tools_detected": ai_tools_detected,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "technologies": [
            {
                "id": pt.technology.id,
                "name": pt.technology.name,
                "category": pt.technology.category,
            }
            for pt in project.technologies
        ],
        "achievements": filter_achievements(project.achievements),
        "repositories": [
            {
                "id": repo.id,
                "git_url": repo.git_url,
                "label": repo.label,
                "display_order": repo.display_order,
                "is_primary": bool(repo.is_primary),
                "is_analyzed": repo.repo_analysis is not None,
            }
            for repo in (project.repositories or [])
        ],
    }


async def get_or_create_technology(
    db: AsyncSession, tech_name: str, category: Optional[str] = None
) -> Technology:
    """Get existing technology or create new one."""
    result = await db.execute(select(Technology).where(Technology.name == tech_name))
    tech = result.scalar_one_or_none()
    if not tech:
        tech = Technology(name=tech_name, category=category)
        db.add(tech)
        await db.flush()
    return tech


async def _sync_repositories(
    db: AsyncSession,
    project: Project,
    repositories: Optional[List[ProjectRepositoryCreate]],
    git_url: Optional[str] = None,
):
    """Sync project repositories from create/update payload.

    If `repositories` is provided, replace all existing repos.
    If only `git_url` is provided (backward compat), ensure a single primary repo exists.
    """
    if repositories is not None:
        # Remove existing repositories
        existing = await db.execute(
            select(ProjectRepository).where(ProjectRepository.project_id == project.id)
        )
        for repo in existing.scalars().all():
            await db.delete(repo)
        await db.flush()

        # Add new repositories
        has_primary = any(r.is_primary for r in repositories)
        for i, repo_data in enumerate(repositories):
            repo = ProjectRepository(
                project_id=project.id,
                git_url=repo_data.git_url,
                label=repo_data.label,
                display_order=i,
                is_primary=1
                if repo_data.is_primary or (i == 0 and not has_primary)
                else 0,
            )
            db.add(repo)

        # Update project.git_url to the primary repo's URL
        primary = next(
            (r for r in repositories if r.is_primary),
            repositories[0] if repositories else None,
        )
        if primary:
            project.git_url = primary.git_url

    elif git_url:
        # Backward compat: single git_url → ensure a single primary repo
        existing = await db.execute(
            select(ProjectRepository).where(ProjectRepository.project_id == project.id)
        )
        repos = existing.scalars().all()

        if not repos:
            repo = ProjectRepository(
                project_id=project.id,
                git_url=git_url,
                is_primary=1,
                display_order=0,
            )
            db.add(repo)
        elif len(repos) == 1 and repos[0].git_url != git_url:
            repos[0].git_url = git_url


@router.get("", response_model=ProjectListResponse)
async def get_projects(
    user_id: int = Query(..., description="User ID"),
    company_id: Optional[int] = Query(None, description="Filter by company ID"),
    project_type: Optional[str] = Query(
        None, description="Filter by project type (company, personal, open-source)"
    ),
    is_analyzed: Optional[bool] = Query(None, description="Filter by analyzed status"),
    status: Optional[str] = Query(
        None, description="Filter by status (pending, analyzing, review, completed)"
    ),
    start_date_from: Optional[date] = Query(
        None, description="Filter projects starting from this date"
    ),
    start_date_to: Optional[date] = Query(
        None, description="Filter projects starting until this date"
    ),
    technologies: Optional[str] = Query(
        None,
        description="Filter by technologies (comma separated, e.g., 'React,TypeScript')",
    ),
    search: Optional[str] = Query(None, description="Search by project name"),
    sort_by: str = Query(
        "is_analyzed,created_at",
        description="Comma-separated sort fields (e.g., 'is_analyzed,created_at')",
    ),
    sort_order: str = Query(
        "asc,desc",
        description="Comma-separated sort orders matching sort_by fields (asc/desc)",
    ),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Get all projects for a user with optional filters."""
    query = select(Project).where(Project.user_id == user_id)

    if company_id is not None:
        query = query.where(Project.company_id == company_id)
    if project_type:
        query = query.where(Project.project_type == project_type)
    if is_analyzed is not None:
        query = query.where(Project.is_analyzed == (1 if is_analyzed else 0))
    if status:
        query = query.where(Project.status == status)
    if start_date_from:
        query = query.where(Project.start_date >= start_date_from)
    if start_date_to:
        query = query.where(Project.start_date <= start_date_to)
    if search:
        query = query.where(Project.name.ilike(f"%{search}%"))

    if technologies:
        tech_list = [t.strip() for t in technologies.split(",") if t.strip()]
        if tech_list:
            tech_subquery = (
                select(ProjectTechnology.project_id)
                .join(Technology)
                .where(Technology.name.in_(tech_list))
                .distinct()
            )
            query = query.where(Project.id.in_(tech_subquery))

    query = query.options(*PROJECT_LOAD_OPTIONS)

    # Build dynamic sort order
    sort_fields = [f.strip() for f in sort_by.split(",") if f.strip()]
    sort_orders = [o.strip() for o in sort_order.split(",") if o.strip()]

    order_clauses = []
    for i, field in enumerate(sort_fields):
        direction = sort_orders[i] if i < len(sort_orders) else "asc"
        column = getattr(Project, field, None)
        if column is not None:
            order_clauses.append(column.asc() if direction == "asc" else column.desc())

    if order_clauses:
        query = query.order_by(*order_clauses)
    else:
        query = query.order_by(Project.is_analyzed.asc(), Project.created_at.desc())

    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    projects = result.scalars().all()

    # Count total with same filters
    count_query = select(func.count(Project.id)).where(Project.user_id == user_id)
    if company_id is not None:
        count_query = count_query.where(Project.company_id == company_id)
    if project_type:
        count_query = count_query.where(Project.project_type == project_type)
    if is_analyzed is not None:
        count_query = count_query.where(
            Project.is_analyzed == (1 if is_analyzed else 0)
        )
    if status:
        count_query = count_query.where(Project.status == status)
    if start_date_from:
        count_query = count_query.where(Project.start_date >= start_date_from)
    if start_date_to:
        count_query = count_query.where(Project.start_date <= start_date_to)
    if search:
        count_query = count_query.where(Project.name.ilike(f"%{search}%"))
    if technologies:
        tech_list = [t.strip() for t in technologies.split(",") if t.strip()]
        if tech_list:
            tech_subquery = (
                select(ProjectTechnology.project_id)
                .join(Technology)
                .where(Technology.name.in_(tech_list))
                .distinct()
            )
            count_query = count_query.where(Project.id.in_(tech_subquery))

    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    return {
        "projects": [_build_project_response(p) for p in projects],
        "total": total,
        "page": skip // limit + 1,
        "page_size": limit,
    }


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific project by ID."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == user_id)
        .options(*PROJECT_LOAD_OPTIONS)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return _build_project_response(project)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project."""
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    if project_data.company_id:
        company_result = await db.execute(
            select(Company).where(Company.id == project_data.company_id)
        )
        if not company_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Company not found")

    technologies = project_data.technologies or []
    repositories = project_data.repositories
    project_dict = project_data.model_dump(exclude={"technologies", "repositories"})

    project = Project(user_id=user_id, **project_dict)
    db.add(project)
    await db.flush()

    # Add technologies
    for tech_name in technologies:
        tech = await get_or_create_technology(db, tech_name)
        project_tech = ProjectTechnology(project_id=project.id, technology_id=tech.id)
        db.add(project_tech)

    # Add repositories
    await _sync_repositories(db, project, repositories, project_data.git_url)

    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(Project).where(Project.id == project.id).options(*PROJECT_LOAD_OPTIONS)
    )
    project = result.scalar_one()

    resp = _build_project_response(project)
    resp["achievements"] = []
    return resp


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Update a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    technologies = project_data.technologies
    repositories = project_data.repositories
    update_data = project_data.model_dump(
        exclude_unset=True, exclude={"technologies", "repositories"}
    )

    for field, value in update_data.items():
        setattr(project, field, value)

    # Update technologies if provided
    if technologies is not None:
        existing = await db.execute(
            select(ProjectTechnology).where(ProjectTechnology.project_id == project_id)
        )
        for pt in existing.scalars().all():
            await db.delete(pt)

        for tech_name in technologies:
            tech = await get_or_create_technology(db, tech_name)
            project_tech = ProjectTechnology(
                project_id=project.id, technology_id=tech.id
            )
            db.add(project_tech)

    # Update repositories if provided
    if repositories is not None:
        await _sync_repositories(db, project, repositories)
    elif "git_url" in update_data:
        await _sync_repositories(db, project, None, update_data["git_url"])

    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(Project).where(Project.id == project.id).options(*PROJECT_LOAD_OPTIONS)
    )
    project = result.scalar_one()

    return _build_project_response(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()


@router.delete("", status_code=status.HTTP_200_OK)
async def delete_projects_batch(
    project_ids: List[int] = Query(..., description="List of project IDs to delete"),
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple projects at once."""
    if not project_ids:
        raise HTTPException(status_code=400, detail="No project IDs provided")

    result = await db.execute(
        select(Project).where(Project.id.in_(project_ids), Project.user_id == user_id)
    )
    projects = result.scalars().all()

    if not projects:
        raise HTTPException(
            status_code=404, detail="No projects found with the provided IDs"
        )

    deleted_ids = []
    for project in projects:
        await db.delete(project)
        deleted_ids.append(project.id)

    await db.commit()

    return {
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids,
        "not_found_ids": list(set(project_ids) - set(deleted_ids)),
    }


# Technology endpoints
@router.get("/technologies/list", response_model=List[TechnologyResponse])
async def get_all_technologies(
    category: Optional[str] = None, db: AsyncSession = Depends(get_db)
):
    """Get all available technologies."""
    query = select(Technology)
    if category:
        query = query.where(Technology.category == category)
    query = query.order_by(Technology.name)

    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/technologies",
    response_model=TechnologyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_technology(
    tech_data: TechnologyCreate, db: AsyncSession = Depends(get_db)
):
    """Create a new technology."""
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
