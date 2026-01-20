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


class CompanyResponse(CompanyBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
