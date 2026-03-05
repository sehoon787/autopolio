"""
Platform Templates Router - Manage platform-specific resume templates
Supports Saramin, Remember, Jumpit styles with HTML/Word/Markdown export
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import os

from api.database import get_db
from api.models.user import User
from api.schemas.platform import (
    PlatformTemplateCreate,
    PlatformTemplateUpdate,
    PlatformTemplateResponse,
    PlatformTemplateListItem,
    PlatformTemplateListResponse,
    RenderDataRequest,
    RenderResponse,
    ExportRequest,
    ExportResponse,
    PreviewRequest,
    PreviewResponse,
    PlatformListResponse,
)
from api.services.platform import PlatformTemplateService
from api.constants import DocumentFormat
from api.dependencies.tier_guards import check_export_format_dep
from sqlalchemy import select

router = APIRouter()


# ==================== Platform Info ====================


@router.get("/info", response_model=PlatformListResponse)
async def get_supported_platforms(db: AsyncSession = Depends(get_db)):
    """Get list of supported platforms with their information."""
    service = PlatformTemplateService(db)
    platforms = service.get_supported_platforms()
    return PlatformListResponse(platforms=platforms)


@router.get("/field-mappings")
async def get_field_mappings(db: AsyncSession = Depends(get_db)):
    """Get field mappings configuration for all platforms."""
    service = PlatformTemplateService(db)
    return service.get_field_mappings()


# ==================== System Template Initialization ====================


@router.post("/init-system")
async def init_system_templates(db: AsyncSession = Depends(get_db)):
    """No-op: System platform templates are now loaded from static files.

    This endpoint is kept for backward compatibility with frontend auto-init calls.
    """
    service = PlatformTemplateService(db)
    templates = await service.get_all()
    system_templates = [t for t in templates if t.is_system]
    return {
        "message": f"System templates loaded from static files ({len(system_templates)} templates)",
        "templates": [
            {"id": t.id, "name": t.name, "platform_key": t.platform_key}
            for t in system_templates
        ],
    }


@router.post("/refresh-system")
async def refresh_system_templates(db: AsyncSession = Depends(get_db)):
    """Refresh static platform templates by clearing the in-memory cache."""
    from api.services.platform.static_platform_templates import invalidate_cache

    invalidate_cache()

    service = PlatformTemplateService(db)
    templates = await service.get_all()
    system_templates = [t for t in templates if t.is_system]
    return {
        "message": f"Refreshed {len(system_templates)} system templates from files",
        "templates": [
            {"id": t.id, "name": t.name, "platform_key": t.platform_key}
            for t in system_templates
        ],
    }


# ==================== Template CRUD ====================


@router.get("", response_model=PlatformTemplateListResponse)
async def get_platform_templates(
    user_id: Optional[int] = None, db: AsyncSession = Depends(get_db)
):
    """Get all platform templates (system + user's custom templates)."""
    service = PlatformTemplateService(db)
    templates = await service.get_all(user_id)

    items = [
        PlatformTemplateListItem(
            id=t.id,
            name=t.name,
            platform_key=t.platform_key,
            description=t.description,
            platform_color=t.platform_color,
            features=t.features,
            is_system=bool(t.is_system),
            created_at=t.created_at,
        )
        for t in templates
    ]

    return PlatformTemplateListResponse(templates=items, total=len(items))


@router.get("/{template_id}", response_model=PlatformTemplateResponse)
async def get_platform_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific platform template by ID."""
    service = PlatformTemplateService(db)
    template = await service.get_by_id(template_id)

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return PlatformTemplateResponse(
        id=template.id,
        user_id=template.user_id,
        name=template.name,
        platform_key=template.platform_key,
        description=template.description,
        page_url=template.page_url,
        html_content=template.html_content,
        css_content=template.css_content,
        original_html=template.original_html,
        screenshot_path=template.screenshot_path,
        field_mappings=template.field_mappings,
        selectors=template.selectors,
        is_system=bool(template.is_system),
        requires_login=bool(template.requires_login),
        scrape_status=template.scrape_status,
        platform_color=template.platform_color,
        platform_logo_url=template.platform_logo_url,
        features=template.features,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.post(
    "", response_model=PlatformTemplateResponse, status_code=status.HTTP_201_CREATED
)
async def create_platform_template(
    data: PlatformTemplateCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom platform template."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    service = PlatformTemplateService(db)
    template = await service.create(data, user_id)

    return PlatformTemplateResponse(
        id=template.id,
        user_id=template.user_id,
        name=template.name,
        platform_key=template.platform_key,
        description=template.description,
        page_url=template.page_url,
        html_content=template.html_content,
        css_content=template.css_content,
        original_html=template.original_html,
        screenshot_path=template.screenshot_path,
        field_mappings=template.field_mappings,
        selectors=template.selectors,
        is_system=bool(template.is_system),
        requires_login=bool(template.requires_login),
        scrape_status=template.scrape_status,
        platform_color=template.platform_color,
        platform_logo_url=template.platform_logo_url,
        features=template.features,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.put("/{template_id}", response_model=PlatformTemplateResponse)
async def update_platform_template(
    template_id: int, data: PlatformTemplateUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a platform template."""
    service = PlatformTemplateService(db)
    template = await service.get_by_id(template_id)

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Don't allow editing system templates
    if template.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system templates")

    template = await service.update(template_id, data)

    return PlatformTemplateResponse(
        id=template.id,
        user_id=template.user_id,
        name=template.name,
        platform_key=template.platform_key,
        description=template.description,
        page_url=template.page_url,
        html_content=template.html_content,
        css_content=template.css_content,
        original_html=template.original_html,
        screenshot_path=template.screenshot_path,
        field_mappings=template.field_mappings,
        selectors=template.selectors,
        is_system=bool(template.is_system),
        requires_login=bool(template.requires_login),
        scrape_status=template.scrape_status,
        platform_color=template.platform_color,
        platform_logo_url=template.platform_logo_url,
        features=template.features,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_platform_template(
    template_id: int, db: AsyncSession = Depends(get_db)
):
    """Delete a platform template."""
    service = PlatformTemplateService(db)

    if not await service.delete(template_id):
        raise HTTPException(
            status_code=404,
            detail="Template not found or cannot be deleted (system template)",
        )


# ==================== Rendering & Preview ====================


@router.post("/{template_id}/render", response_model=RenderResponse)
async def render_template(
    template_id: int, data: RenderDataRequest, db: AsyncSession = Depends(get_db)
):
    """
    Render a platform template with user-provided data.
    Returns the rendered HTML.
    """
    service = PlatformTemplateService(db)

    try:
        html = await service.render_with_user_data(template_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return RenderResponse(html=html, generated_date=datetime.now().strftime("%Y-%m-%d"))


@router.post("/{template_id}/preview", response_model=PreviewResponse)
async def preview_template(
    template_id: int, request: PreviewRequest = None, db: AsyncSession = Depends(get_db)
):
    """
    Preview a platform template with user data.
    Returns HTML suitable for iframe embedding.
    If no data is provided and use_sample_data is True, uses sample data.
    """
    service = PlatformTemplateService(db)

    try:
        # If no request or no data, use sample data for preview
        if request is None or (request.data is None and request.use_sample_data):
            html = await service.render_with_sample_data(template_id)
        else:
            html = await service.render_with_user_data(template_id, request.data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return PreviewResponse(html=html)


@router.get("/{template_id}/render-from-db")
async def render_from_database(
    template_id: int,
    user_id: int = Query(..., description="User ID to fetch data for"),
    db: AsyncSession = Depends(get_db),
):
    """
    Render a platform template with data from the database.
    Automatically fetches user's companies, projects, skills, etc.
    """
    service = PlatformTemplateService(db)

    try:
        html = await service.render_from_db(template_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"html": html, "generated_date": datetime.now().strftime("%Y-%m-%d")}


@router.get("/{template_id}/render-markdown-from-db")
async def render_markdown_from_database(
    template_id: int,
    user_id: int = Query(..., description="User ID to fetch data for"),
    db: AsyncSession = Depends(get_db),
):
    """
    Render a platform template as Markdown with data from the database.
    Returns markdown string for preview.
    """
    service = PlatformTemplateService(db)

    try:
        markdown = await service.render_markdown_from_db(template_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"markdown": markdown, "generated_date": datetime.now().strftime("%Y-%m-%d")}


@router.get("/{template_id}/preview-markdown-sample")
async def preview_markdown_with_sample_data(
    template_id: int, db: AsyncSession = Depends(get_db)
):
    """
    Preview a platform template as Markdown with sample data.
    Returns markdown string suitable for preview when no user data is available.
    """
    service = PlatformTemplateService(db)

    try:
        markdown = await service.render_markdown_with_sample_data(template_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"markdown": markdown, "generated_date": datetime.now().strftime("%Y-%m-%d")}


# ==================== Export from DB ====================


@router.post("/{template_id}/export-from-db/html", response_model=ExportResponse)
async def export_from_db_to_html(
    template_id: int,
    user_id: int = Query(..., description="User ID to fetch data for"),
    db: AsyncSession = Depends(get_db),
):
    """Export rendered template to HTML file using data from the database."""
    # Tier guard: check html export permission
    await check_export_format_dep("html", user_id, db)

    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    service = PlatformTemplateService(db)

    try:
        file_path, content = await service.export_from_db_to_html(template_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)

    return ExportResponse(
        filename=filename,
        download_url=f"/api/platforms/download/{filename}",
        format=DocumentFormat.HTML,
        size_bytes=file_size,
    )


@router.post("/{template_id}/export-from-db/md", response_model=ExportResponse)
async def export_from_db_to_markdown(
    template_id: int,
    user_id: int = Query(..., description="User ID to fetch data for"),
    db: AsyncSession = Depends(get_db),
):
    """Export to Markdown file using data from the database."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    service = PlatformTemplateService(db)

    try:
        file_path, content = await service.export_from_db_to_markdown(
            template_id, user_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)

    return ExportResponse(
        filename=filename,
        download_url=f"/api/platforms/download/{filename}",
        format=DocumentFormat.MD,
        size_bytes=file_size,
    )


@router.post("/{template_id}/export-from-db/docx", response_model=ExportResponse)
async def export_from_db_to_docx(
    template_id: int,
    user_id: int = Query(..., description="User ID to fetch data for"),
    db: AsyncSession = Depends(get_db),
):
    """Export to Word document using data from the database."""
    # Tier guard: check docx export permission
    await check_export_format_dep("docx", user_id, db)

    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    service = PlatformTemplateService(db)

    try:
        file_path = await service.export_from_db_to_docx(template_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)

    return ExportResponse(
        filename=filename,
        download_url=f"/api/platforms/download/{filename}",
        format=DocumentFormat.DOCX,
        size_bytes=file_size,
    )


# ==================== Export ====================


@router.post("/{template_id}/export/html", response_model=ExportResponse)
async def export_to_html(
    template_id: int, request: ExportRequest, db: AsyncSession = Depends(get_db)
):
    """Export rendered template to HTML file."""
    service = PlatformTemplateService(db)

    try:
        file_path, content = await service.export_to_html(template_id, request.data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)

    return ExportResponse(
        filename=filename,
        download_url=f"/api/platforms/download/{filename}",
        format=DocumentFormat.HTML,
        size_bytes=file_size,
    )


@router.post("/{template_id}/export/md", response_model=ExportResponse)
async def export_to_markdown(
    template_id: int, request: ExportRequest, db: AsyncSession = Depends(get_db)
):
    """Export to Markdown file."""
    service = PlatformTemplateService(db)

    try:
        file_path, content = await service.export_to_markdown(template_id, request.data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)

    return ExportResponse(
        filename=filename,
        download_url=f"/api/platforms/download/{filename}",
        format=DocumentFormat.MD,
        size_bytes=file_size,
    )


@router.post("/{template_id}/export/docx", response_model=ExportResponse)
async def export_to_docx(
    template_id: int, request: ExportRequest, db: AsyncSession = Depends(get_db)
):
    """Export to Word document."""
    service = PlatformTemplateService(db)

    try:
        file_path = await service.export_to_docx(template_id, request.data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)

    return ExportResponse(
        filename=filename,
        download_url=f"/api/platforms/download/{filename}",
        format=DocumentFormat.DOCX,
        size_bytes=file_size,
    )


@router.get("/download/{filename}")
async def download_file(filename: str, db: AsyncSession = Depends(get_db)):
    """Download an exported file."""
    from api.config import get_settings

    settings = get_settings()

    # Security: Sanitize filename to prevent path traversal attacks
    safe_filename = os.path.basename(filename)
    if not safe_filename or safe_filename != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = settings.result_dir / safe_filename

    # Additional security check: Ensure resolved path is within result_dir
    try:
        resolved_path = file_path.resolve()
        result_dir_resolved = settings.result_dir.resolve()
        if not str(resolved_path).startswith(str(result_dir_resolved)):
            raise HTTPException(status_code=403, detail="Access denied")
    except (OSError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid file path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    ext = os.path.splitext(filename)[1].lower()
    media_types = {
        ".html": "text/html",
        ".md": "text/markdown",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pdf": "application/pdf",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(path=file_path, filename=filename, media_type=media_type)
