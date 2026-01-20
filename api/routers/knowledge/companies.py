from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Dict
from collections import defaultdict

from api.database import get_db
from api.models.company import Company
from api.models.user import User
from api.models.project import Project
from api.schemas.company import (
    CompanyCreate, CompanyUpdate, CompanyResponse,
    CompanySummaryResponse, CompanyGroupedResponse, ProjectSummary
)

router = APIRouter()


# Technology categories for grouping
TECH_CATEGORIES = {
    "Backend": [
        "Python", "FastAPI", "Django", "Flask", "Spring", "Spring Boot", "Java", "Kotlin",
        "Node.js", "Express", "NestJS", "Go", "Rust", "Ruby", "Rails", "PHP", "Laravel",
        ".NET", "C#", "ASP.NET"
    ],
    "Frontend": [
        "React", "Vue", "Angular", "Next.js", "Nuxt.js", "Svelte", "TypeScript", "JavaScript",
        "HTML", "CSS", "SCSS", "Tailwind CSS", "Bootstrap", "Material UI", "Ant Design"
    ],
    "Mobile": [
        "Flutter", "React Native", "Swift", "SwiftUI", "Kotlin", "Android", "iOS",
        "Xamarin", "Ionic"
    ],
    "Database": [
        "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Oracle", "SQL Server",
        "DynamoDB", "Cassandra", "Elasticsearch"
    ],
    "DevOps/Infra": [
        "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Jenkins", "GitHub Actions",
        "GitLab CI", "Terraform", "Ansible", "Nginx", "Linux"
    ],
    "AI/ML": [
        "TensorFlow", "PyTorch", "scikit-learn", "Keras", "OpenAI", "LangChain",
        "Pandas", "NumPy", "OpenCV"
    ]
}


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


@router.get("/grouped-by-company", response_model=CompanyGroupedResponse)
async def get_companies_grouped(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
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
        # Get projects with technologies for this company
        projects_result = await db.execute(
            select(Project)
            .where(Project.company_id == company.id)
            .options(selectinload(Project.technologies))
            .order_by(Project.start_date.desc())
        )
        projects = projects_result.scalars().all()

        # Aggregate technologies
        all_technologies = set()
        project_summaries = []

        for project in projects:
            tech_names = [t.name for t in project.technologies] if project.technologies else []
            all_technologies.update(tech_names)

            project_summaries.append(ProjectSummary(
                id=project.id,
                name=project.name,
                start_date=project.start_date,
                end_date=project.end_date,
                role=project.role,
                description=project.description,
                git_url=project.git_url,
                team_size=project.team_size,
                technologies=tech_names
            ))

        sorted_technologies = sorted(list(all_technologies))
        tech_categories = categorize_technologies(sorted_technologies)
        date_range = format_date_range(company.start_date, company.end_date, company.is_current)

        company_summaries.append(CompanySummaryResponse(
            company=CompanyResponse.model_validate(company),
            projects=project_summaries,
            project_count=len(projects),
            aggregated_tech_stack=sorted_technologies,
            tech_categories=tech_categories,
            date_range=date_range
        ))

        total_projects += len(projects)

    return CompanyGroupedResponse(
        companies=company_summaries,
        total_companies=len(companies),
        total_projects=total_projects
    )


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


@router.get("/{company_id}/summary", response_model=CompanySummaryResponse)
async def get_company_summary(company_id: int, db: AsyncSession = Depends(get_db)):
    """Get company summary with aggregated tech stack and projects."""
    # Get company with projects
    result = await db.execute(
        select(Company)
        .where(Company.id == company_id)
        .options(selectinload(Company.projects))
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Get projects with technologies
    projects_result = await db.execute(
        select(Project)
        .where(Project.company_id == company_id)
        .options(selectinload(Project.technologies))
        .order_by(Project.start_date.desc())
    )
    projects = projects_result.scalars().all()

    # Aggregate technologies
    all_technologies = set()
    project_summaries = []

    for project in projects:
        tech_names = [t.name for t in project.technologies] if project.technologies else []
        all_technologies.update(tech_names)

        project_summaries.append(ProjectSummary(
            id=project.id,
            name=project.name,
            start_date=project.start_date,
            end_date=project.end_date,
            role=project.role,
            description=project.description,
            git_url=project.git_url,
            team_size=project.team_size,
            technologies=tech_names
        ))

    # Sort technologies
    sorted_technologies = sorted(list(all_technologies))

    # Categorize technologies
    tech_categories = categorize_technologies(sorted_technologies)

    # Format date range
    date_range = format_date_range(company.start_date, company.end_date, company.is_current)

    return CompanySummaryResponse(
        company=CompanyResponse.model_validate(company),
        projects=project_summaries,
        project_count=len(projects),
        aggregated_tech_stack=sorted_technologies,
        tech_categories=tech_categories,
        date_range=date_range
    )
