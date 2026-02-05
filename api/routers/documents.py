from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Literal
import os

from api.database import get_db
from api.config import get_settings
from api.models.document import GeneratedDocument
from api.models.user import User
from api.schemas.document import DocumentResponse, DocumentListResponse
from api.services.report_service import ReportService
from api.services.export_service import ExportService

router = APIRouter()
settings = get_settings()


# ==================== Report Generation Endpoints ====================
# NOTE: These must be defined BEFORE /{document_id} routes to avoid path conflicts

@router.get("/reports/projects")
async def generate_projects_report(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate PROJECTS.md style report.
    Lists all projects with details like period, company, team size, role, etc.
    """
    report_service = ReportService(db)
    try:
        content = await report_service.generate_projects_md(user_id)
        return {
            "report_type": "projects_md",
            "content": content,
            "format": "markdown"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/reports/performance")
async def generate_performance_report(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate PROJECT_PERFORMANCE_SUMMARY.md style report.
    Focuses on quantitative achievements and metrics.
    """
    report_service = ReportService(db)
    try:
        content = await report_service.generate_performance_summary(user_id)
        return {
            "report_type": "performance_summary",
            "content": content,
            "format": "markdown"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/reports/company-integrated")
async def generate_company_integrated_report(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate company-integrated report.
    Groups projects by company with aggregated tech stacks.
    """
    report_service = ReportService(db)
    try:
        content = await report_service.generate_company_integrated_report(user_id)
        return {
            "report_type": "company_integrated",
            "content": content,
            "format": "markdown"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/reports/all")
async def generate_all_reports(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate all report formats at once.
    Returns projects_md, performance_summary, and company_integrated reports.
    """
    report_service = ReportService(db)
    try:
        reports = await report_service.generate_full_report(user_id)
        return {
            "reports": reports,
            "formats": ["projects_md", "performance_summary", "company_integrated"]
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/reports/download/{report_type}")
async def download_report(
    report_type: Literal["projects", "performance", "company-integrated"] = "projects",
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Download a report as markdown file.
    """
    report_service = ReportService(db)

    try:
        if report_type == "projects":
            content = await report_service.generate_projects_md(user_id)
            filename = "PROJECTS.md"
        elif report_type == "performance":
            content = await report_service.generate_performance_summary(user_id)
            filename = "PROJECT_PERFORMANCE_SUMMARY.md"
        else:  # company-integrated
            content = await report_service.generate_company_integrated_report(user_id)
            filename = "COMPANY_INTEGRATED_REPORT.md"

        return Response(
            content=content,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# Project-specific Report Endpoints
@router.get("/reports/project/{project_id}/detailed")
async def get_detailed_report(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate DETAILED_COMPLETION_REPORT style for a specific project.
    Returns structured data for detailed technical analysis view.
    """
    report_service = ReportService(db)
    try:
        report = await report_service.generate_detailed_report(project_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/reports/project/{project_id}/final")
async def get_final_report(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate FINAL_PROJECT_REPORT style for a specific project.
    Returns structured data for work/achievement summary view.
    """
    report_service = ReportService(db)
    try:
        report = await report_service.generate_final_report(project_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/reports/project/{project_id}/summary")
async def get_performance_summary_for_project(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate PROJECT_PERFORMANCE_SUMMARY style for a specific project.
    Returns structured data for basic info, key tasks, achievements, and stats.
    """
    report_service = ReportService(db)
    try:
        report = await report_service.generate_performance_summary_for_project(project_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ==================== Export Endpoints (v1.6) ====================

@router.get("/export/preview")
async def get_export_preview(
    user_id: int = Query(..., description="User ID"),
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get preview data for export.

    Returns project count, total commits, and content preview.
    report_type:
    - "detailed": 상세 - Full DETAILED_COMPLETION_REPORT style with project overview, tech stack, implementation details, timeline, achievements
    - "final": 상세 요약 - Concise FINAL_PROJECT_REPORT style with key info and top achievements
    - "summary": 요약 - PROJECT_PERFORMANCE_SUMMARY style with key tasks and achievements

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits) in the report
    """
    export_service = ExportService(db)
    try:
        preview = await export_service.get_export_preview(user_id, report_type, include_code_stats)
        return preview
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Export preview failed: {str(e)}")


@router.post("/export/markdown")
async def export_to_markdown(
    user_id: int = Query(..., description="User ID"),
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export analyzed projects to Markdown file.

    report_type:
    - "detailed": 상세 - Full DETAILED_COMPLETION_REPORT style
    - "final": 상세 요약 - Concise FINAL_PROJECT_REPORT style
    - "summary": 요약 - PROJECT_PERFORMANCE_SUMMARY style with key tasks and achievements

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)

    Returns file path and download URL.
    """
    export_service = ExportService(db)
    try:
        file_path, content = await export_service.export_to_markdown(user_id, report_type, include_code_stats)
        filename = os.path.basename(file_path)
        return {
            "success": True,
            "file_path": file_path,
            "filename": filename,
            "format": "markdown",
            "download_url": f"/api/documents/export/download/{filename}",
            "preview": content[:1000] + "..." if len(content) > 1000 else content
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Markdown export failed: {str(e)}")


@router.post("/export/docx")
async def export_to_docx(
    user_id: int = Query(..., description="User ID"),
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export analyzed projects to Word document.

    report_type:
    - "detailed": 상세 - Full DETAILED_COMPLETION_REPORT style
    - "final": 상세 요약 - Concise FINAL_PROJECT_REPORT style
    - "summary": 요약 - PROJECT_PERFORMANCE_SUMMARY style with key tasks and achievements

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)

    Returns file path and download URL.
    """
    export_service = ExportService(db)
    try:
        file_path = await export_service.export_to_docx(user_id, report_type, include_code_stats)
        filename = os.path.basename(file_path)
        return {
            "success": True,
            "file_path": file_path,
            "filename": filename,
            "format": "docx",
            "download_url": f"/api/documents/export/download/{filename}"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate Word document: {str(e)}")


@router.get("/export/download/{filename}")
async def download_export_file(filename: str):
    """
    Download an exported file by filename.
    """
    file_path = settings.result_dir / filename

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    if filename.endswith(".md"):
        media_type = "text/markdown"
    elif filename.endswith(".docx"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif filename.endswith(".pdf"):
        media_type = "application/pdf"
    else:
        media_type = "application/octet-stream"

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename
    )


# ==================== Single Project Export Endpoints ====================

@router.get("/export/project/{project_id}/preview")
async def get_single_project_export_preview(
    project_id: int,
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get preview data for single project export.

    report_type:
    - "detailed": 상세 - Full DETAILED_COMPLETION_REPORT style
    - "final": 상세 요약 - Concise FINAL_PROJECT_REPORT style
    - "summary": 요약 - PROJECT_PERFORMANCE_SUMMARY style

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)
    """
    export_service = ExportService(db)
    try:
        preview = await export_service.get_single_project_preview(project_id, report_type, include_code_stats)
        return preview
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Single project export preview failed: {str(e)}")


@router.post("/export/project/{project_id}/markdown")
async def export_single_project_to_markdown(
    project_id: int,
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export single project to Markdown file.

    report_type:
    - "detailed": 상세 - Full DETAILED_COMPLETION_REPORT style
    - "final": 상세 요약 - Concise FINAL_PROJECT_REPORT style
    - "summary": 요약 - PROJECT_PERFORMANCE_SUMMARY style

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)
    """
    export_service = ExportService(db)
    try:
        file_path, content = await export_service.export_single_project_to_markdown(project_id, report_type, include_code_stats)
        filename = os.path.basename(file_path)
        return {
            "success": True,
            "file_path": file_path,
            "filename": filename,
            "format": "markdown",
            "download_url": f"/api/documents/export/download/{filename}",
            "preview": content[:1000] + "..." if len(content) > 1000 else content
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Single project markdown export failed: {str(e)}")


@router.post("/export/project/{project_id}/docx")
async def export_single_project_to_docx(
    project_id: int,
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export single project to Word document.

    report_type:
    - "detailed": 상세 - Full DETAILED_COMPLETION_REPORT style
    - "final": 상세 요약 - Concise FINAL_PROJECT_REPORT style
    - "summary": 요약 - PROJECT_PERFORMANCE_SUMMARY style

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)
    """
    export_service = ExportService(db)
    try:
        file_path = await export_service.export_single_project_to_docx(project_id, report_type, include_code_stats)
        filename = os.path.basename(file_path)
        return {
            "success": True,
            "file_path": file_path,
            "filename": filename,
            "format": "docx",
            "download_url": f"/api/documents/export/download/{filename}"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate Word document: {str(e)}")


# ==================== Document CRUD Endpoints ====================

@router.get("", response_model=DocumentListResponse)
async def get_documents(
    user_id: int = Query(..., description="User ID"),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Get all generated documents for a user."""
    query = select(GeneratedDocument).where(GeneratedDocument.user_id == user_id)

    if status:
        query = query.where(GeneratedDocument.status == status)

    query = query.order_by(GeneratedDocument.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    documents = result.scalars().all()

    # Get total count
    count_query = select(GeneratedDocument).where(GeneratedDocument.user_id == user_id)
    if status:
        count_query = count_query.where(GeneratedDocument.status == status)
    count_result = await db.execute(count_query)
    total = len(count_result.scalars().all())

    return {
        "documents": documents,
        "total": total,
        "page": skip // limit + 1,
        "page_size": limit
    }


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific document by ID."""
    result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return document


@router.get("/{document_id}/download")
async def download_document(document_id: int, db: AsyncSession = Depends(get_db)):
    """Download a generated document."""
    result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    media_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "md": "text/markdown"
    }
    media_type = media_types.get(document.file_format, "application/octet-stream")

    return FileResponse(
        path=document.file_path,
        media_type=media_type,
        filename=f"{document.document_name}.{document.file_format}"
    )


@router.get("/{document_id}/preview")
async def preview_document(document_id: int, db: AsyncSession = Depends(get_db)):
    """Get document content for preview (supports markdown and text)."""
    result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Only support preview for markdown files
    if document.file_format == "md":
        with open(document.file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "document_id": document.id,
            "document_name": document.document_name,
            "format": document.file_format,
            "content": content,
            "preview_available": True
        }
    else:
        return {
            "document_id": document.id,
            "document_name": document.document_name,
            "format": document.file_format,
            "content": None,
            "preview_available": False,
            "message": f"Preview not available for {document.file_format} files. Use download instead."
        }


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a generated document."""
    result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file if exists
    if document.file_path and os.path.exists(document.file_path):
        os.remove(document.file_path)

    await db.delete(document)
    await db.flush()  # Ensure delete is staged for commit


@router.put("/{document_id}/archive")
async def archive_document(document_id: int, db: AsyncSession = Depends(get_db)):
    """Archive a document."""
    result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document.status = "archived"
    await db.flush()
    await db.refresh(document)

    return document


@router.get("/{document_id}/versions")
async def get_document_versions(document_id: int, db: AsyncSession = Depends(get_db)):
    """Get all versions of a document."""
    result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Find all related versions
    versions = [document]

    # Find children (newer versions)
    children_result = await db.execute(
        select(GeneratedDocument)
        .where(GeneratedDocument.parent_document_id == document_id)
        .order_by(GeneratedDocument.version.desc())
    )
    versions.extend(children_result.scalars().all())

    # Find parent (older versions)
    if document.parent_document_id:
        parent_result = await db.execute(
            select(GeneratedDocument)
            .where(GeneratedDocument.id == document.parent_document_id)
        )
        parent = parent_result.scalar_one_or_none()
        if parent:
            versions.insert(0, parent)

    return {
        "document_id": document_id,
        "versions": [
            {
                "id": v.id,
                "version": v.version,
                "document_name": v.document_name,
                "created_at": v.created_at,
                "status": v.status
            }
            for v in versions
        ],
        "total_versions": len(versions)
    }
