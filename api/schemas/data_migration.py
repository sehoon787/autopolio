"""Schemas for data migration (Desktop → Web export/import)."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DataExportResponse(BaseModel):
    """Complete user data export (excludes sensitive tokens/keys)."""

    version: str = "1.0"
    exported_at: str
    user: dict
    companies: list[dict]
    projects: list[dict]
    achievements: list[dict]
    technologies: list[dict]
    certifications: list[dict]
    awards: list[dict]
    educations: list[dict]
    publications: list[dict]
    volunteer_activities: list[dict]


class DataImportRequest(BaseModel):
    """Import data payload (same structure as export)."""

    version: str
    user: Optional[dict] = None
    companies: list[dict] = []
    projects: list[dict] = []
    achievements: list[dict] = []
    technologies: list[dict] = []
    certifications: list[dict] = []
    awards: list[dict] = []
    educations: list[dict] = []
    publications: list[dict] = []
    volunteer_activities: list[dict] = []


class DataImportResponse(BaseModel):
    """Result of import operation."""

    success: bool
    imported_counts: dict  # {"companies": 3, "projects": 5, ...}
    skipped_counts: dict  # {"companies": 1, ...} (duplicates)
    errors: list[str] = []
