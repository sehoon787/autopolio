from pydantic import BaseModel, field_validator
from datetime import date, datetime
from typing import Optional, List, Union


# ============================================================
# Certification Schemas (자격증)
# ============================================================

class CertificationBase(BaseModel):
    name: str
    issuer: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    description: Optional[str] = None
    display_order: int = 0


class CertificationCreate(CertificationBase):
    pass


class CertificationUpdate(BaseModel):
    name: Optional[str] = None
    issuer: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None


class CertificationResponse(CertificationBase):
    id: int
    user_id: int
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_size: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Award Schemas (수상이력)
# ============================================================

class AwardBase(BaseModel):
    name: str
    issuer: Optional[str] = None
    award_date: Optional[date] = None
    description: Optional[str] = None
    award_url: Optional[str] = None
    display_order: int = 0


class AwardCreate(AwardBase):
    pass


class AwardUpdate(BaseModel):
    name: Optional[str] = None
    issuer: Optional[str] = None
    award_date: Optional[date] = None
    description: Optional[str] = None
    award_url: Optional[str] = None
    display_order: Optional[int] = None


class AwardResponse(AwardBase):
    id: int
    user_id: int
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_size: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Education Schemas (교육이력)
# ============================================================

class EducationBase(BaseModel):
    school_name: str
    major: Optional[str] = None
    degree: Optional[str] = None  # 학사/석사/박사/수료
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: bool = False  # deprecated, use graduation_status
    graduation_status: Optional[str] = None  # graduated/enrolled/completed/withdrawn
    gpa: Optional[str] = None
    description: Optional[str] = None
    # University metadata (from Hipo database)
    school_country: Optional[str] = None  # Full country name
    school_country_code: Optional[str] = None  # ISO alpha-2 code
    school_state: Optional[str] = None  # State/province
    school_domain: Optional[str] = None  # Primary email domain
    school_web_page: Optional[str] = None  # Primary website URL
    display_order: int = 0


class EducationCreate(EducationBase):
    pass


class EducationUpdate(BaseModel):
    school_name: Optional[str] = None
    major: Optional[str] = None
    degree: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = None  # deprecated, use graduation_status
    graduation_status: Optional[str] = None  # graduated/enrolled/completed/withdrawn
    gpa: Optional[str] = None
    description: Optional[str] = None
    school_country: Optional[str] = None
    school_country_code: Optional[str] = None
    school_state: Optional[str] = None
    school_domain: Optional[str] = None
    school_web_page: Optional[str] = None
    display_order: Optional[int] = None


class EducationResponse(EducationBase):
    id: int
    user_id: int
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_size: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Publication Schemas (논문/저술)
# ============================================================

class PublicationBase(BaseModel):
    title: str
    authors: Optional[str] = None
    publication_type: Optional[str] = None  # journal/conference/book/patent
    publisher: Optional[str] = None
    # Accept both date and string for patents (pipe-separated dates)
    publication_date: Optional[Union[date, str]] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    display_order: int = 0


class PublicationCreate(PublicationBase):
    pass


class PublicationUpdate(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_type: Optional[str] = None
    publisher: Optional[str] = None
    # Accept both date and string for patents (pipe-separated dates)
    publication_date: Optional[Union[date, str]] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None


class PublicationResponse(PublicationBase):
    id: int
    user_id: int
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_size: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# VolunteerActivity Schemas (봉사활동/대외활동)
# ============================================================

class VolunteerActivityBase(BaseModel):
    name: str
    organization: Optional[str] = None
    activity_type: Optional[str] = None  # volunteer/external
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: bool = False
    hours: Optional[int] = None
    role: Optional[str] = None
    description: Optional[str] = None
    certificate_url: Optional[str] = None
    display_order: int = 0


class VolunteerActivityCreate(VolunteerActivityBase):
    pass


class VolunteerActivityUpdate(BaseModel):
    name: Optional[str] = None
    organization: Optional[str] = None
    activity_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = None
    hours: Optional[int] = None
    role: Optional[str] = None
    description: Optional[str] = None
    certificate_url: Optional[str] = None
    display_order: Optional[int] = None


class VolunteerActivityResponse(VolunteerActivityBase):
    id: int
    user_id: int
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_size: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Reorder Schema
# ============================================================

class ReorderRequest(BaseModel):
    """Request for reordering items"""
    item_ids: List[int]  # List of IDs in desired order


# ============================================================
# Summary Schemas (for template data)
# ============================================================

class CertificationSummary(BaseModel):
    """Certification summary for templates"""
    name: str
    issuer: Optional[str] = None
    issue_date: Optional[str] = None  # Formatted date string
    expiry_date: Optional[str] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    description: Optional[str] = None


class AwardSummary(BaseModel):
    """Award summary for templates"""
    name: str
    issuer: Optional[str] = None
    award_date: Optional[str] = None
    description: Optional[str] = None
    award_url: Optional[str] = None


class EducationSummary(BaseModel):
    """Education summary for templates"""
    school_name: str
    major: Optional[str] = None
    degree: Optional[str] = None
    period: Optional[str] = None  # "2015.03 - 2019.02" or "2020.03 - 재학중"
    gpa: Optional[str] = None
    description: Optional[str] = None


class PublicationSummary(BaseModel):
    """Publication summary for templates"""
    title: str
    authors: Optional[str] = None
    publication_type: Optional[str] = None
    publisher: Optional[str] = None
    publication_date: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None


class VolunteerActivitySummary(BaseModel):
    """Volunteer activity summary for templates"""
    name: str
    organization: Optional[str] = None
    activity_type: Optional[str] = None
    period: Optional[str] = None  # "2020.01 - 2020.12" or "2021.01 - 진행중"
    hours: Optional[int] = None
    role: Optional[str] = None
    description: Optional[str] = None
