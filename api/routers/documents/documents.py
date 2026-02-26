"""Document CRUD endpoints and sub-router aggregation."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import os

from api.database import get_db
from api.models.document import GeneratedDocument
from api.schemas.document import DocumentResponse, DocumentListResponse
from api.config import get_settings

# Import sub-routers
from .documents_reports import router as reports_router
from .documents_export import router as export_router

router = APIRouter()

# Include sub-routers with prefixes
router.include_router(reports_router, prefix="/reports", tags=["Reports"])
router.include_router(export_router, prefix="/export", tags=["Export"])


def _resolve_file_path(stored_path: str) -> str:
    """Resolve a stored file path, falling back to result_dir by filename.

    DB may store Docker paths (/app/result/...) that don't exist locally.
    Falls back to settings.result_dir / basename.
    """
    if os.path.exists(stored_path):
        return stored_path
    # Try resolving by filename in local result_dir
    filename = os.path.basename(stored_path)
    local_path = str(get_settings().result_dir / filename)
    if os.path.exists(local_path):
        return local_path
    return stored_path  # Return original for consistent error


# ==================== Document CRUD Endpoints ====================


@router.get("", response_model=DocumentListResponse)
async def get_documents(
    user_id: int = Query(..., description="User ID"),
    status: Optional[str] = None,
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort direction (asc/desc)"),
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Get all generated documents for a user."""
    query = select(GeneratedDocument).where(GeneratedDocument.user_id == user_id)

    if status:
        query = query.where(GeneratedDocument.status == status)

    # Dynamic sort
    column = getattr(GeneratedDocument, sort_by, None)
    if column is not None:
        query = query.order_by(column.desc() if sort_order == "desc" else column.asc())
    else:
        query = query.order_by(GeneratedDocument.created_at.desc())

    query = query.offset(skip).limit(limit)

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
        "page_size": limit,
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

    resolved_path = _resolve_file_path(document.file_path)
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    media_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "md": "text/markdown",
    }
    media_type = media_types.get(document.file_format, "application/octet-stream")

    return FileResponse(
        path=resolved_path,
        media_type=media_type,
        filename=f"{document.document_name}.{document.file_format}",
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

    resolved_path = _resolve_file_path(document.file_path)
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Only support preview for markdown files
    if document.file_format == "md":
        with open(resolved_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "document_id": document.id,
            "document_name": document.document_name,
            "format": document.file_format,
            "content": content,
            "preview_available": True,
        }
    else:
        return {
            "document_id": document.id,
            "document_name": document.document_name,
            "format": document.file_format,
            "content": None,
            "preview_available": False,
            "message": f"Preview not available for {document.file_format} files. Use download instead.",
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
    resolved_path = (
        _resolve_file_path(document.file_path) if document.file_path else None
    )
    if resolved_path and os.path.exists(resolved_path):
        os.remove(resolved_path)

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
            select(GeneratedDocument).where(
                GeneratedDocument.id == document.parent_document_id
            )
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
                "status": v.status,
            }
            for v in versions
        ],
        "total_versions": len(versions),
    }
