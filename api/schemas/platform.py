from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any


# ===== Field Mapping Schemas =====

class FieldDefinition(BaseModel):
    """Definition of a single field in the template."""
    name: str
    type: str  # text, email, tel, url, textarea, date, list
    label: str
    label_en: Optional[str] = None
    required: bool = False
    auto_fill: bool = False


class SectionDefinition(BaseModel):
    """Definition of a section (experiences, projects, etc.)."""
    label: str
    label_en: Optional[str] = None
    fields: List[FieldDefinition]


class FieldMappings(BaseModel):
    """Complete field mappings for a platform template."""
    common_fields: List[FieldDefinition]
    section_fields: Dict[str, SectionDefinition]


# ===== Platform Template Schemas =====

class PlatformTemplateBase(BaseModel):
    """Base schema for platform template."""
    name: str
    platform_key: str
    description: Optional[str] = None
    page_url: Optional[str] = None
    platform_color: Optional[str] = None
    features: Optional[List[str]] = None


class PlatformTemplateCreate(PlatformTemplateBase):
    """Schema for creating a platform template."""
    html_content: Optional[str] = None
    css_content: Optional[str] = None
    field_mappings: Optional[Dict[str, Any]] = None
    selectors: Optional[Dict[str, Any]] = None


class PlatformTemplateUpdate(BaseModel):
    """Schema for updating a platform template."""
    name: Optional[str] = None
    description: Optional[str] = None
    html_content: Optional[str] = None
    css_content: Optional[str] = None
    field_mappings: Optional[Dict[str, Any]] = None
    selectors: Optional[Dict[str, Any]] = None
    features: Optional[List[str]] = None


class PlatformTemplateResponse(PlatformTemplateBase):
    """Response schema for platform template."""
    id: int
    user_id: Optional[int] = None
    html_content: Optional[str] = None
    css_content: Optional[str] = None
    original_html: Optional[str] = None
    screenshot_path: Optional[str] = None
    field_mappings: Optional[Dict[str, Any]] = None
    selectors: Optional[Dict[str, Any]] = None
    is_system: bool = False
    requires_login: bool = False
    scrape_status: Optional[str] = None
    platform_logo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PlatformTemplateListItem(BaseModel):
    """Simplified response for listing platform templates."""
    id: int
    name: str
    platform_key: str
    description: Optional[str] = None
    platform_color: Optional[str] = None
    features: Optional[List[str]] = None
    is_system: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class PlatformTemplateListResponse(BaseModel):
    """Response for listing platform templates."""
    templates: List[PlatformTemplateListItem]
    total: int


# ===== Render/Export Schemas =====

class ExperienceData(BaseModel):
    """Experience data for rendering."""
    company_name: str
    position: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None
    achievements: Optional[List[str]] = None


class ProjectData(BaseModel):
    """Project data for rendering.

    Extended fields for platform-specific exports:
    - key_tasks_list: List of key implementation tasks (max 8 items used in exports)
    - team_size: Number of team members on the project
    - implementation_details: List of dicts with categorized implementation details.
      Expected format: [{"title": "Backend Development", "items": ["FastAPI setup", ...]}, ...]
    """
    name: str
    company_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    technologies: Optional[List[str]] = None
    achievements: Optional[List[str]] = None
    # Extended fields for platform-specific exports
    key_tasks_list: Optional[List[str]] = None
    has_key_tasks: bool = False
    team_size: Optional[int] = None
    implementation_details: Optional[List[Dict[str, Any]]] = None
    has_achievements: bool = False


class SkillsData(BaseModel):
    """Skills data for rendering."""
    languages: Optional[List[str]] = None
    frameworks: Optional[List[str]] = None
    databases: Optional[List[str]] = None
    tools: Optional[List[str]] = None


class EducationData(BaseModel):
    """Education data for rendering."""
    school_name: str
    major: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None


class CertificationData(BaseModel):
    """Certification data for rendering."""
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None


class RenderDataRequest(BaseModel):
    """Request schema for rendering a template with user data."""
    # Basic info
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    desired_position: Optional[str] = None
    summary: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None

    # Sections
    experiences: Optional[List[ExperienceData]] = None
    projects: Optional[List[ProjectData]] = None
    skills: Optional[SkillsData] = None
    educations: Optional[List[EducationData]] = None
    certifications: Optional[List[CertificationData]] = None


class RenderResponse(BaseModel):
    """Response for template rendering."""
    html: str
    generated_date: str


class ExportRequest(BaseModel):
    """Request for exporting a rendered template."""
    data: RenderDataRequest
    format: str = "html"  # html, docx, md


class ExportResponse(BaseModel):
    """Response for template export."""
    filename: str
    download_url: str
    format: str
    size_bytes: int


class PreviewRequest(BaseModel):
    """Request for template preview."""
    data: Optional[RenderDataRequest] = None
    use_sample_data: bool = True  # Use sample data when data is None


class PreviewResponse(BaseModel):
    """Response for template preview (HTML for iframe)."""
    html: str


# ===== Platform Info Schemas =====

class PlatformInfo(BaseModel):
    """Information about a supported platform."""
    key: str
    name: str
    name_en: str
    description: str
    description_en: str
    color: str
    features: List[str]
    template_available: bool = True


class PlatformListResponse(BaseModel):
    """Response for listing supported platforms."""
    platforms: List[PlatformInfo]
