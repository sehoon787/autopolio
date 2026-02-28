from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any


class TemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    platform: Optional[str] = None
    output_format: str = "docx"
    template_content: Optional[str] = None
    field_mappings: Optional[Dict[str, str]] = None
    sections: Optional[List[str]] = None
    style_settings: Optional[Dict[str, Any]] = None
    max_projects: Optional[int] = None
    max_characters: Optional[int] = None


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    platform: Optional[str] = None
    output_format: Optional[str] = None
    template_content: Optional[str] = None
    field_mappings: Optional[Dict[str, str]] = None
    sections: Optional[List[str]] = None
    style_settings: Optional[Dict[str, Any]] = None
    max_projects: Optional[int] = None
    max_characters: Optional[int] = None


class TemplateResponse(TemplateBase):
    id: int
    user_id: Optional[int] = None
    is_system: bool = False
    template_file_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TemplateListResponse(BaseModel):
    templates: List[TemplateResponse]
    total: int


class TemplatePreviewRequest(BaseModel):
    """Request body for template preview."""

    template_content: str
    sample_data: Optional[dict] = None


class TemplatePreviewResponse(BaseModel):
    """Response for template preview."""

    preview_html: str
    preview_text: str
    fields_used: List[str]
