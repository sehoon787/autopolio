from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any


class DocumentCreate(BaseModel):
    document_name: str
    description: Optional[str] = None
    template_id: Optional[int] = None
    file_format: str = "docx"
    included_projects: Optional[List[int]] = None
    included_companies: Optional[List[int]] = None
    generation_settings: Optional[Dict[str, Any]] = None


class DocumentResponse(BaseModel):
    id: int
    user_id: int
    template_id: Optional[int] = None
    job_id: Optional[int] = None
    document_name: str
    description: Optional[str] = None
    file_path: str
    file_format: Optional[str] = None
    file_size: Optional[int] = None
    included_projects: Optional[List[int]] = None
    included_companies: Optional[List[int]] = None
    generation_settings: Optional[Dict[str, Any]] = None
    version: int = 1
    parent_document_id: Optional[int] = None
    status: str = "completed"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
    page: int
    page_size: int
