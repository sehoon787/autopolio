from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import json
import os
import uuid
from functools import lru_cache
from pathlib import Path

from api.database import get_db
from api.config import get_settings, PLATFORM_CONFIGS
from api.models.template import Template
from api.models.user import User
from api.schemas.template import (
    TemplateCreate,
    TemplateUpdate,
    TemplateResponse,
    TemplateListResponse,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
)
from api.services.document import DocumentService
from api.services.user_data import UserDataCollector
from api.services.template import TemplateRenderingService, DEFAULT_SAMPLE_DATA
from api.services.template.static_doc_templates import (
    get_static_doc_templates,
    get_static_doc_template_by_id,
    is_static_doc_id,
)

router = APIRouter()
settings = get_settings()

_FIELDS_JSON = Path(__file__).resolve().parent.parent.parent / "config" / "template_available_fields.json"


@lru_cache(maxsize=1)
def _load_available_fields() -> dict:
    with open(_FIELDS_JSON, encoding="utf-8") as f:
        return json.load(f)


async def _get_mutable_template(template_id: int, db: AsyncSession) -> Template:
    """Get a non-system template or raise 403/404."""
    if is_static_doc_id(template_id):
        raise HTTPException(status_code=403, detail="Cannot modify system templates")
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system templates")
    return template


@router.get("", response_model=TemplateListResponse)
async def get_templates(
    user_id: Optional[int] = None,
    platform: Optional[str] = None,
    include_system: bool = True,
    include_platform_templates: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Get all templates (static system + user's custom templates from DB).

    System templates are loaded from static code definitions (no DB needed).
    User templates are loaded from DB.

    Args:
        user_id: Filter by user ID
        platform: Filter by specific platform
        include_system: Include system templates
        include_platform_templates: Include platform-specific templates (saramin, wanted, remember).
                                   Defaults to False since these are now in /platforms.
    """
    from sqlalchemy import not_

    all_templates = []

    # Static system templates (always available, no DB)
    if include_system:
        static_system = get_static_doc_templates()
        if platform:
            static_system = [t for t in static_system if t.platform == platform]
        if not include_platform_templates:
            platform_specific = ["saramin", "remember", "jumpit"]
            static_system = [
                t for t in static_system if t.platform not in platform_specific
            ]
        all_templates.extend(static_system)

    # User templates from DB
    if user_id:
        query = select(Template).where(
            Template.user_id == user_id,
            Template.is_system == 0,
        )
        if platform:
            query = query.where(Template.platform == platform)
        if not include_platform_templates:
            platform_specific = ["saramin", "remember", "jumpit"]
            query = query.where(not_(Template.platform.in_(platform_specific)))
        query = query.order_by(Template.name)
        result = await db.execute(query)
        all_templates.extend(result.scalars().all())

    return {"templates": all_templates, "total": len(all_templates)}


@router.get("/platforms")
async def get_platforms():
    """Get available platform configurations."""
    return PLATFORM_CONFIGS


@router.get("/fields/available")
async def get_available_fields():
    """Get list of all available template fields with descriptions."""
    return _load_available_fields()


@router.post("/preview", response_model=TemplatePreviewResponse)
async def preview_template(
    request: TemplatePreviewRequest,
    user_id: Optional[int] = Query(None, description="User ID for real data preview"),
    db: AsyncSession = Depends(get_db),
):
    """
    Preview template with sample or real data.

    If user_id is provided, uses real user data for preview.
    Otherwise, uses sample_data from request or default sample data.
    """
    # Get sample data
    sample_data = request.sample_data or {}

    if user_id and not sample_data:
        # Use UserDataCollector for proper data priority (user-entered > OAuth defaults)
        try:
            collector = UserDataCollector(db)
            collected_data = await collector.collect(user_id)

            # Map collected data to sample_data format for template rendering
            sample_data = {
                "name": collected_data.get("name", "사용자명"),
                "email": collected_data.get("email", "user@example.com"),
                "phone": collected_data.get("phone", ""),
                "address": collected_data.get("address", ""),
                "birthdate": collected_data.get("birthdate", ""),
                "github_username": collected_data.get("github_url", "").replace(
                    "https://github.com/", ""
                )
                if collected_data.get("github_url")
                else "",
                "github_url": collected_data.get("github_url", ""),
                "photo_url": collected_data.get("photo_url", ""),
                "summary": collected_data.get("introduction", "")
                or "경험이 풍부한 개발자입니다.",
                "skills": ", ".join(collected_data.get("skills", []))
                if collected_data.get("skills")
                else "React, Python, FastAPI",
                "companies": [
                    {
                        "name": exp.get("company_name", ""),
                        "position": exp.get("position", "개발자"),
                        "department": exp.get("department", ""),
                        "start_date": exp.get("start_date", "2020.01"),
                        "end_date": exp.get("end_date", "") or "현재",
                        "description": exp.get("description", "소프트웨어 개발"),
                    }
                    for exp in collected_data.get("experiences", [])
                ],
                "projects": [
                    {
                        "name": p.get("name", ""),
                        "short_description": p.get("description", "")[:100]
                        if p.get("description")
                        else "",
                        "description": p.get("description", "") or "프로젝트 설명",
                        "role": p.get("role", "개발자"),
                        "team_size": p.get("team_size", 3),
                        "contribution_percent": 50,
                        "start_date": p.get("start_date", "2023.01"),
                        "end_date": p.get("end_date", "") or "2023.06",
                        "technologies": p.get("technologies", "") or "React, Node.js",
                        "achievements": p.get("achievements_list", []),
                        # Use achievements_summary_list as default (title only, no description)
                        "achievements_summary_list": p.get(
                            "achievements_summary_list", []
                        ),
                        # Also pass detailed list for templates that need description
                        "achievements_detailed_list": p.get(
                            "achievements_detailed_list", []
                        ),
                        "has_achievements": p.get("has_achievements", False),
                        "key_tasks": p.get("key_tasks", ""),
                        "links": {},
                    }
                    for p in collected_data.get("projects", [])[:5]
                ],
                # Include credentials
                "certifications": collected_data.get("certifications", []),
                "awards": collected_data.get("awards", []),
                "educations": collected_data.get("educations", []),
                "publications": collected_data.get("publications", []),
                "volunteer_activities": collected_data.get("volunteer_activities", []),
                # Boolean flags for conditionals
                "has_certifications": collected_data.get("has_certifications", False),
                "has_awards": collected_data.get("has_awards", False),
                "has_educations": collected_data.get("has_educations", False),
                "has_publications": collected_data.get("has_publications", False),
                "has_volunteer_activities": collected_data.get(
                    "has_volunteer_activities", False
                ),
            }
        except ValueError:
            # User not found, will use default sample data
            pass

    # Default sample data if nothing provided
    if not sample_data:
        sample_data = DEFAULT_SAMPLE_DATA.copy()

    # Use TemplateRenderingService for rendering
    renderer = TemplateRenderingService()
    preview_html, preview_text, fields_used = renderer.render_to_html(
        request.template_content, sample_data
    )

    return TemplatePreviewResponse(
        preview_html=preview_html, preview_text=preview_text, fields_used=fields_used
    )


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific template by ID (checks static system templates first, then DB)."""
    # Check static system templates first
    if is_static_doc_id(template_id):
        template = get_static_doc_template_by_id(template_id)
        if template:
            return template

    # Fall back to DB
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: TemplateCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom template."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    template = Template(user_id=user_id, is_system=0, **template_data.model_dump())
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.post(
    "/upload", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED
)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Query(...),
    platform: str = Query("custom"),
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Upload a Word/PDF template file."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Validate file type
    allowed_extensions = {".docx", ".doc", ".pdf"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}",
        )

    # Save file
    file_id = str(uuid.uuid4())
    file_name = f"{file_id}{file_ext}"
    file_path = settings.templates_dir / file_name

    os.makedirs(settings.templates_dir, exist_ok=True)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Parse template to extract field mappings
    doc_service = DocumentService()
    try:
        parsed_content, field_mappings = await doc_service.parse_template(
            str(file_path)
        )
    except Exception as e:
        # Clean up file on parse error
        os.remove(file_path)
        raise HTTPException(
            status_code=400, detail=f"Failed to parse template: {str(e)}"
        )

    # Determine output format
    output_format = "docx" if file_ext in {".docx", ".doc"} else "pdf"

    template = Template(
        user_id=user_id,
        name=name,
        platform=platform,
        is_system=0,
        template_file_path=str(file_path),
        template_content=parsed_content,
        field_mappings=field_mappings,
        output_format=output_format,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int, template_data: TemplateUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a template."""
    template = await _get_mutable_template(template_id, db)

    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    await db.flush()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a template."""
    template = await _get_mutable_template(template_id, db)

    # Delete template file if exists
    if template.template_file_path and os.path.exists(template.template_file_path):
        os.remove(template.template_file_path)

    await db.delete(template)


@router.post("/init-system-templates")
async def initialize_system_templates(
    force_update: bool = False, db: AsyncSession = Depends(get_db)
):
    """No-op: System templates are now loaded from static code definitions.

    This endpoint is kept for backward compatibility with frontend auto-init calls.
    """
    static_templates = get_static_doc_templates()
    return {
        "message": f"System templates loaded from static definitions ({len(static_templates)} templates)",
        "created": 0,
        "updated": 0,
    }


@router.post(
    "/{template_id}/clone",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_template(
    template_id: int,
    user_id: int = Query(..., description="User ID"),
    new_name: Optional[str] = Query(None, description="New template name (optional)"),
    db: AsyncSession = Depends(get_db),
):
    """Clone a template (system or user's own) to create a new user template."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Get source template (check static first, then DB)
    source_template = None
    if is_static_doc_id(template_id):
        source_template = get_static_doc_template_by_id(template_id)
    if not source_template:
        result = await db.execute(select(Template).where(Template.id == template_id))
        source_template = result.scalar_one_or_none()
    if not source_template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Create cloned template
    cloned_name = new_name or f"{source_template.name} (복사본)"

    cloned_template = Template(
        user_id=user_id,
        name=cloned_name,
        description=source_template.description,
        platform=source_template.platform,
        is_system=0,
        template_content=source_template.template_content,
        template_file_path=None,  # Don't copy file path
        field_mappings=source_template.field_mappings,
        sections=source_template.sections,
        style_settings=source_template.style_settings,
        max_projects=source_template.max_projects,
        max_characters=source_template.max_characters,
        output_format=source_template.output_format,
    )
    db.add(cloned_template)
    await db.flush()
    await db.refresh(cloned_template)
    return cloned_template
