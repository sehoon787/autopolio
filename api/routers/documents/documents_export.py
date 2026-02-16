"""Export endpoints for documents."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal
import os

from api.database import get_db
from api.config import get_settings
from api.services.export import ExportService

router = APIRouter()
settings = get_settings()


@router.get("/preview")
async def get_export_preview(
    user_id: int = Query(..., description="User ID"),
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    language: str = Query("ko", description="Output language: 'ko' or 'en'"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get preview data for export.

    Returns project count, total commits, and content preview.
    report_type:
    - "detailed": Full DETAILED_COMPLETION_REPORT style with project overview, tech stack, implementation details, timeline, achievements
    - "final": Concise FINAL_PROJECT_REPORT style with key info and top achievements
    - "summary": PROJECT_PERFORMANCE_SUMMARY style with key tasks and achievements

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits) in the report
    """
    export_service = ExportService(db, language=language)
    try:
        preview = await export_service.get_export_preview(user_id, report_type, include_code_stats)
        return preview
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Export preview failed: {str(e)}")


@router.post("/markdown")
async def export_to_markdown(
    user_id: int = Query(..., description="User ID"),
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    language: str = Query("ko", description="Output language: 'ko' or 'en'"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export analyzed projects to Markdown file.

    report_type:
    - "detailed": Full DETAILED_COMPLETION_REPORT style
    - "final": Concise FINAL_PROJECT_REPORT style
    - "summary": PROJECT_PERFORMANCE_SUMMARY style with key tasks and achievements

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)

    Returns file path and download URL.
    """
    export_service = ExportService(db, language=language)
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


@router.post("/docx")
async def export_to_docx(
    user_id: int = Query(..., description="User ID"),
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    language: str = Query("ko", description="Output language: 'ko' or 'en'"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export analyzed projects to Word document.

    report_type:
    - "detailed": Full DETAILED_COMPLETION_REPORT style
    - "final": Concise FINAL_PROJECT_REPORT style
    - "summary": PROJECT_PERFORMANCE_SUMMARY style with key tasks and achievements

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)

    Returns file path and download URL.
    """
    export_service = ExportService(db, language=language)
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


@router.get("/download/{filename}")
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


@router.get("/project/{project_id}/preview")
async def get_single_project_export_preview(
    project_id: int,
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    language: str = Query("ko", description="Output language: 'ko' or 'en'"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get preview data for single project export.

    report_type:
    - "detailed": Full DETAILED_COMPLETION_REPORT style
    - "final": Concise FINAL_PROJECT_REPORT style
    - "summary": PROJECT_PERFORMANCE_SUMMARY style

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)
    """
    export_service = ExportService(db, language=language)
    try:
        preview = await export_service.get_single_project_preview(project_id, report_type, include_code_stats)
        return preview
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Single project export preview failed: {str(e)}")


@router.post("/project/{project_id}/markdown")
async def export_single_project_to_markdown(
    project_id: int,
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    language: str = Query("ko", description="Output language: 'ko' or 'en'"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export single project to Markdown file.

    report_type:
    - "detailed": Full DETAILED_COMPLETION_REPORT style
    - "final": Concise FINAL_PROJECT_REPORT style
    - "summary": PROJECT_PERFORMANCE_SUMMARY style

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)
    """
    export_service = ExportService(db, language=language)
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


@router.post("/project/{project_id}/docx")
async def export_single_project_to_docx(
    project_id: int,
    report_type: Literal["detailed", "final", "summary"] = Query("summary", description="Report type"),
    include_code_stats: bool = Query(False, description="Include code statistics (lines added/deleted, commits)"),
    language: str = Query("ko", description="Output language: 'ko' or 'en'"),
    db: AsyncSession = Depends(get_db)
):
    """
    Export single project to Word document.

    report_type:
    - "detailed": Full DETAILED_COMPLETION_REPORT style
    - "final": Concise FINAL_PROJECT_REPORT style
    - "summary": PROJECT_PERFORMANCE_SUMMARY style

    include_code_stats: If True, include code contribution statistics (lines_added, lines_deleted, total_commits)
    """
    export_service = ExportService(db, language=language)
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
