from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class CompanyBase(BaseModel):
    name: str
    position: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: bool = False
    description: Optional[str] = None
    location: Optional[str] = None
    company_url: Optional[str] = None
    logo_path: Optional[str] = None


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = None
    description: Optional[str] = None
    location: Optional[str] = None
    company_url: Optional[str] = None
    logo_path: Optional[str] = None


class CompanyResponse(CompanyBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectSummary(BaseModel):
    """Project summary for company grouping"""

    id: int
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    role: Optional[str] = None
    description: Optional[str] = None
    git_url: Optional[str] = None
    team_size: Optional[int] = None
    technologies: list[str] = []

    class Config:
        from_attributes = True


class CompanySummaryResponse(BaseModel):
    """Company summary with aggregated information"""

    company: CompanyResponse
    projects: list[ProjectSummary]
    project_count: int
    aggregated_tech_stack: list[str]
    tech_categories: dict[str, list[str]]
    date_range: str


class CompanyGroupedResponse(BaseModel):
    """Response for grouped-by-company endpoint"""

    companies: list[CompanySummaryResponse]
    total_companies: int
    total_projects: int
