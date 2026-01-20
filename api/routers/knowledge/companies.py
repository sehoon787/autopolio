from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from api.database import get_db
from api.models.company import Company
from api.models.user import User
from api.schemas.company import CompanyCreate, CompanyUpdate, CompanyResponse

router = APIRouter()


@router.get("", response_model=List[CompanyResponse])
async def get_companies(
    user_id: int = Query(..., description="User ID"),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
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


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(company_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific company by ID."""
    result = await db.execute(
        select(Company)
        .where(Company.id == company_id)
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
    db: AsyncSession = Depends(get_db)
):
    """Create a new company."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    company = Company(
        user_id=user_id,
        **company_data.model_dump()
    )
    db.add(company)
    await db.flush()
    await db.refresh(company)
    return company


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    company_data: CompanyUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a company."""
    result = await db.execute(select(Company).where(Company.id == company_id))
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
async def delete_company(company_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a company."""
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    await db.delete(company)


@router.get("/{company_id}/projects")
async def get_company_projects(company_id: int, db: AsyncSession = Depends(get_db)):
    """Get all projects for a company."""
    from api.models.project import Project

    result = await db.execute(select(Company).where(Company.id == company_id))
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
        "total": len(projects)
    }
