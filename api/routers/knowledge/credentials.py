"""
Credentials Router - CRUD endpoints for user credentials

Uses generic CRUD factory to eliminate code duplication.
Each credential type (certifications, awards, etc.) shares the same
CRUD pattern with minor variations in model class and field names.

Attachment endpoints are handled separately as they use a unified
endpoint pattern for all credential types.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Literal

from api.database import get_db
from api.models.credentials import (
    Certification, Award, Education, Publication, VolunteerActivity
)
from api.schemas.credentials import (
    CertificationCreate, CertificationUpdate, CertificationResponse,
    AwardCreate, AwardUpdate, AwardResponse,
    EducationCreate, EducationUpdate, EducationResponse,
    PublicationCreate, PublicationUpdate, PublicationResponse,
    VolunteerActivityCreate, VolunteerActivityUpdate, VolunteerActivityResponse,
)
from api.services.core import attachment_service
from .crud_factory import create_credential_crud_endpoints


router = APIRouter()

# Type alias for credential types (used in attachment endpoints)
CredentialType = Literal[
    "certifications", "awards", "educations", 
    "publications", "volunteer_activities"
]

# Model mapping for attachment endpoints
MODEL_MAP = {
    "certifications": Certification,
    "awards": Award,
    "educations": Education,
    "publications": Publication,
    "volunteer_activities": VolunteerActivity
}


# ============================================================
# Create CRUD routers using factory
# ============================================================

# Certifications - professional certifications and licenses
certifications_router = create_credential_crud_endpoints(
    model_class=Certification,
    create_schema=CertificationCreate,
    update_schema=CertificationUpdate,
    response_schema=CertificationResponse,
    name="certifications",
    singular_name="Certification",
    date_field="issue_date",
)

# Awards - honors, prizes, and recognitions
awards_router = create_credential_crud_endpoints(
    model_class=Award,
    create_schema=AwardCreate,
    update_schema=AwardUpdate,
    response_schema=AwardResponse,
    name="awards",
    singular_name="Award",
    date_field="award_date",
)

# Educations - academic degrees and programs
educations_router = create_credential_crud_endpoints(
    model_class=Education,
    create_schema=EducationCreate,
    update_schema=EducationUpdate,
    response_schema=EducationResponse,
    name="educations",
    singular_name="Education",
    date_field="start_date",
    bool_fields=["is_current"],  # SQLite integer conversion needed
)

# Publications - academic papers, articles, books
publications_router = create_credential_crud_endpoints(
    model_class=Publication,
    create_schema=PublicationCreate,
    update_schema=PublicationUpdate,
    response_schema=PublicationResponse,
    name="publications",
    singular_name="Publication",
    date_field="publication_date",
)

# Volunteer Activities - community service and volunteering
volunteer_activities_router = create_credential_crud_endpoints(
    model_class=VolunteerActivity,
    create_schema=VolunteerActivityCreate,
    update_schema=VolunteerActivityUpdate,
    response_schema=VolunteerActivityResponse,
    name="volunteer_activities",
    singular_name="Volunteer activity",
    date_field="start_date",
    bool_fields=["is_current"],  # SQLite integer conversion needed
)


# Include all CRUD routers
router.include_router(certifications_router)
router.include_router(awards_router)
router.include_router(educations_router)
router.include_router(publications_router)
router.include_router(volunteer_activities_router)


# ============================================================
# Attachment Endpoints (unified for all credential types)
# ============================================================

@router.post("/{credential_type}/{id}/attachment")
async def upload_attachment(
    credential_type: CredentialType,
    id: int,
    user_id: int = Query(..., description="User ID"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload an attachment file for a credential."""
    model = MODEL_MAP.get(credential_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid credential type")

    # Get the credential and verify ownership
    result = await db.execute(
        select(model).where(model.id == id, model.user_id == user_id)
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(
            status_code=404, 
            detail=f"{credential_type[:-1].title()} not found"
        )

    # Delete existing attachment if any
    if credential.attachment_path:
        await attachment_service.delete_attachment(credential.attachment_path)

    # Save new attachment
    relative_path, original_name, file_size = await attachment_service.save_attachment(
        file, credential_type, credential.user_id
    )

    # Update credential
    credential.attachment_path = relative_path
    credential.attachment_name = original_name
    credential.attachment_size = file_size

    await db.flush()
    await db.refresh(credential)

    return {
        "message": "Attachment uploaded successfully",
        "attachment_path": relative_path,
        "attachment_name": original_name,
        "attachment_size": file_size
    }


@router.get("/{credential_type}/{id}/attachment")
async def download_attachment(
    credential_type: CredentialType,
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Download an attachment file for a credential."""
    model = MODEL_MAP.get(credential_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid credential type")

    # Get the credential and verify ownership
    result = await db.execute(
        select(model).where(model.id == id, model.user_id == user_id)
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(
            status_code=404,
            detail=f"{credential_type[:-1].title()} not found"
        )

    if not credential.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found")

    full_path = attachment_service.get_full_path(credential.attachment_path)
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file not found")

    content_type = attachment_service.get_content_type(
        credential.attachment_name or "file"
    )

    return FileResponse(
        path=full_path,
        filename=credential.attachment_name,
        media_type=content_type
    )


@router.delete("/{credential_type}/{id}/attachment", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    credential_type: CredentialType,
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Delete an attachment file for a credential."""
    model = MODEL_MAP.get(credential_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid credential type")

    # Get the credential and verify ownership
    result = await db.execute(
        select(model).where(model.id == id, model.user_id == user_id)
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(
            status_code=404,
            detail=f"{credential_type[:-1].title()} not found"
        )

    if not credential.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found")

    # Delete the file
    await attachment_service.delete_attachment(credential.attachment_path)

    # Update credential
    credential.attachment_path = None
    credential.attachment_name = None
    credential.attachment_size = None

    await db.flush()
