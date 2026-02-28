import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Dict
from collections import defaultdict

from api.database import get_db
from api.models.company import Company
from api.models.user import User
from api.models.project import Project, ProjectTechnology
from api.schemas.company import (
    CompanyCreate,
    CompanyUpdate,
    CompanyResponse,
    CompanySummaryResponse,
    CompanyGroupedResponse,
    ProjectSummary,
)
from api.services.core.domain_constants import TECH_CATEGORIES

# Logo upload settings
LOGO_DIR = "data/logos"
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5MB

router = APIRouter()


def categorize_technologies(technologies: List[str]) -> Dict[str, List[str]]:
    """Categorize technologies into predefined groups."""
    result = defaultdict(list)
    categorized = set()

    for tech in technologies:
        for category, tech_list in TECH_CATEGORIES.items():
            if tech in tech_list:
                result[category].append(tech)
                categorized.add(tech)
                break

    # Add uncategorized technologies to "Other"
    uncategorized = [t for t in technologies if t not in categorized]
    if uncategorized:
        result["Other"] = uncategorized

    return dict(result)


def format_date_range(start_date, end_date, is_current: bool = False) -> str:
    """Format date range as string."""
    start = start_date.strftime("%Y.%m") if start_date else "?"
    if is_current:
        end = "현재"
    else:
        end = end_date.strftime("%Y.%m") if end_date else "?"
    return f"{start} ~ {end}"


def _build_company_summary(company, projects) -> CompanySummaryResponse:
    """Build a CompanySummaryResponse from a company and its projects."""
    all_technologies = set()
    project_summaries = []

    for project in projects:
        tech_names = (
            [pt.technology.name for pt in project.technologies if pt.technology]
            if project.technologies
            else []
        )
        all_technologies.update(tech_names)

        project_summaries.append(
            ProjectSummary(
                id=project.id,
                name=project.name,
                start_date=project.start_date,
                end_date=project.end_date,
                role=project.role,
                description=project.description,
                git_url=project.git_url,
                team_size=project.team_size,
                technologies=tech_names,
            )
        )

    sorted_technologies = sorted(list(all_technologies))
    return CompanySummaryResponse(
        company=CompanyResponse.model_validate(company),
        projects=project_summaries,
        project_count=len(projects),
        aggregated_tech_stack=sorted_technologies,
        tech_categories=categorize_technologies(sorted_technologies),
        date_range=format_date_range(
            company.start_date, company.end_date, company.is_current
        ),
    )


@router.get("", response_model=List[CompanyResponse])
async def get_companies(
    user_id: int = Query(..., description="User ID"),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Get all companies for a user."""
    result = await db.execute(
        select(Company)
        .where(Company.user_id == user_id)
        .order_by(Company.start_date.desc())
        .offset(skip)
        .limit(limit)
    )
    companies = result.scalars().all()
    return companies


@router.get("/grouped-by-company", response_model=CompanyGroupedResponse)
async def get_companies_grouped(
    user_id: int = Query(..., description="User ID"), db: AsyncSession = Depends(get_db)
):
    """Get all companies with their projects grouped together."""
    # Get all companies for user
    companies_result = await db.execute(
        select(Company)
        .where(Company.user_id == user_id)
        .options(selectinload(Company.projects))
        .order_by(Company.start_date.desc())
    )
    companies = companies_result.scalars().all()

    company_summaries = []
    total_projects = 0

    for company in companies:
        projects_result = await db.execute(
            select(Project)
            .where(Project.company_id == company.id)
            .options(
                selectinload(Project.technologies).selectinload(
                    ProjectTechnology.technology
                )
            )
            .order_by(Project.start_date.desc())
        )
        projects = list(projects_result.scalars().all())
        company_summaries.append(_build_company_summary(company, projects))
        total_projects += len(projects)

    return CompanyGroupedResponse(
        companies=company_summaries,
        total_companies=len(companies),
        total_projects=total_projects,
    )


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific company by ID."""
    result = await db.execute(
        select(Company)
        .where(Company.id == company_id, Company.user_id == user_id)
        .options(selectinload(Company.projects))
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    company_data: CompanyCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new company."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    company = Company(user_id=user_id, **company_data.model_dump())
    db.add(company)
    await db.flush()
    await db.refresh(company)
    return company


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    company_data: CompanyUpdate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Update a company."""
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    update_data = company_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)

    await db.flush()
    await db.refresh(company)
    return company


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a company."""
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    await db.delete(company)


@router.get("/{company_id}/projects")
async def get_company_projects(
    company_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get all projects for a company."""
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    projects_result = await db.execute(
        select(Project)
        .where(Project.company_id == company_id)
        .order_by(Project.start_date.desc())
    )
    projects = projects_result.scalars().all()

    return {
        "company_id": company_id,
        "company_name": company.name,
        "projects": projects,
        "total": len(projects),
    }


@router.post("/{company_id}/link-project/{project_id}", status_code=status.HTTP_200_OK)
async def link_project_to_company(
    company_id: int,
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Link an existing project to a company."""
    # Verify company exists and belongs to user
    company_result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = company_result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Verify project exists and belongs to the same user
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Link the project to the company
    project.company_id = company_id
    await db.flush()
    await db.refresh(project)

    return {
        "message": "Project linked successfully",
        "company_id": company_id,
        "project_id": project_id,
    }


@router.delete(
    "/{company_id}/unlink-project/{project_id}", status_code=status.HTTP_200_OK
)
async def unlink_project_from_company(
    company_id: int,
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Unlink a project from a company (set company_id to NULL)."""
    # Verify company exists and belongs to user
    company_result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = company_result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Verify project exists, belongs to user, and is linked to this company
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.company_id != company_id:
        raise HTTPException(
            status_code=400, detail="Project is not linked to this company"
        )

    # Unlink the project
    project.company_id = None
    await db.flush()
    await db.refresh(project)

    return {
        "message": "Project unlinked successfully",
        "company_id": company_id,
        "project_id": project_id,
    }


@router.get("/{company_id}/summary", response_model=CompanySummaryResponse)
async def get_company_summary(
    company_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get company summary with aggregated tech stack and projects."""
    # Get company with projects
    result = await db.execute(
        select(Company)
        .where(Company.id == company_id, Company.user_id == user_id)
        .options(selectinload(Company.projects))
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Get projects with technologies
    projects_result = await db.execute(
        select(Project)
        .where(Project.company_id == company_id)
        .options(
            selectinload(Project.technologies).selectinload(
                ProjectTechnology.technology
            )
        )
        .order_by(Project.start_date.desc())
    )
    projects = list(projects_result.scalars().all())

    return _build_company_summary(company, projects)


@router.post("/{company_id}/logo", status_code=status.HTTP_200_OK)
async def upload_company_logo(
    company_id: int,
    user_id: int = Query(..., description="User ID"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a logo for a company."""
    # Verify company exists and belongs to user
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Validate file extension
    file_ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if file_ext not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_LOGO_EXTENSIONS)}",
        )

    # Check file size
    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_LOGO_SIZE // (1024 * 1024)}MB",
        )

    # Create logos directory if not exists
    os.makedirs(LOGO_DIR, exist_ok=True)

    # Delete old logo if exists
    if company.logo_path and os.path.exists(company.logo_path):
        try:
            os.remove(company.logo_path)
        except Exception:
            pass

    # Generate unique filename
    unique_filename = f"{company_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = os.path.join(LOGO_DIR, unique_filename)

    # Save file
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    # Update company logo_path
    company.logo_path = file_path
    await db.flush()
    await db.refresh(company)

    return {
        "message": "Logo uploaded successfully",
        "logo_path": file_path,
        "logo_url": f"/api/knowledge/companies/{company_id}/logo",
    }


@router.get("/{company_id}/logo")
async def get_company_logo(
    company_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get the logo for a company."""
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not company.logo_path or not os.path.exists(company.logo_path):
        raise HTTPException(status_code=404, detail="Logo not found")

    return FileResponse(
        company.logo_path,
        media_type="image/png",
        filename=os.path.basename(company.logo_path),
    )


@router.delete("/{company_id}/logo", status_code=status.HTTP_200_OK)
async def delete_company_logo(
    company_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Delete the logo for a company."""
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not company.logo_path:
        raise HTTPException(status_code=404, detail="No logo to delete")

    # Delete file
    if os.path.exists(company.logo_path):
        try:
            os.remove(company.logo_path)
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to delete logo file: {str(e)}"
            )

    # Clear logo_path
    company.logo_path = None
    await db.flush()

    return {"message": "Logo deleted successfully"}
