from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Literal

from api.database import get_db
from api.models.user import User
from api.models.credentials import Certification, Award, Education, Publication, VolunteerActivity
from api.schemas.credentials import (
    CertificationCreate, CertificationUpdate, CertificationResponse,
    AwardCreate, AwardUpdate, AwardResponse,
    EducationCreate, EducationUpdate, EducationResponse,
    PublicationCreate, PublicationUpdate, PublicationResponse,
    VolunteerActivityCreate, VolunteerActivityUpdate, VolunteerActivityResponse,
    ReorderRequest
)
from api.services.attachment_service import attachment_service

router = APIRouter()

# Type alias for credential types
CredentialType = Literal["certifications", "awards", "educations", "publications", "volunteer_activities"]

# Model mapping
MODEL_MAP = {
    "certifications": Certification,
    "awards": Award,
    "educations": Education,
    "publications": Publication,
    "volunteer_activities": VolunteerActivity
}

# Schema mapping for responses
RESPONSE_SCHEMA_MAP = {
    "certifications": CertificationResponse,
    "awards": AwardResponse,
    "educations": EducationResponse,
    "publications": PublicationResponse,
    "volunteer_activities": VolunteerActivityResponse
}


# ============================================================
# Certifications CRUD
# ============================================================

@router.get("/certifications", response_model=List[CertificationResponse])
async def get_certifications(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all certifications for a user."""
    result = await db.execute(
        select(Certification)
        .where(Certification.user_id == user_id)
        .order_by(Certification.display_order, Certification.issue_date.desc())
    )
    return result.scalars().all()


@router.post("/certifications", response_model=CertificationResponse, status_code=status.HTTP_201_CREATED)
async def create_certification(
    data: CertificationCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new certification."""
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    certification = Certification(user_id=user_id, **data.model_dump())
    db.add(certification)
    await db.flush()
    await db.refresh(certification)
    return certification


@router.get("/certifications/{id}", response_model=CertificationResponse)
async def get_certification(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific certification by ID."""
    result = await db.execute(
        select(Certification).where(Certification.id == id, Certification.user_id == user_id)
    )
    certification = result.scalar_one_or_none()
    if not certification:
        raise HTTPException(status_code=404, detail="Certification not found")
    return certification


@router.put("/certifications/{id}", response_model=CertificationResponse)
async def update_certification(
    id: int,
    data: CertificationUpdate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Update a certification."""
    result = await db.execute(
        select(Certification).where(Certification.id == id, Certification.user_id == user_id)
    )
    certification = result.scalar_one_or_none()
    if not certification:
        raise HTTPException(status_code=404, detail="Certification not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(certification, field, value)

    await db.flush()
    await db.refresh(certification)
    return certification


@router.delete("/certifications/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certification(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Delete a certification."""
    result = await db.execute(
        select(Certification).where(Certification.id == id, Certification.user_id == user_id)
    )
    certification = result.scalar_one_or_none()
    if not certification:
        raise HTTPException(status_code=404, detail="Certification not found")

    await db.delete(certification)


@router.put("/certifications/reorder", response_model=List[CertificationResponse])
async def reorder_certifications(
    data: ReorderRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Reorder certifications by providing list of IDs in desired order."""
    result = await db.execute(
        select(Certification).where(Certification.user_id == user_id)
    )
    certifications = {c.id: c for c in result.scalars().all()}

    for order, item_id in enumerate(data.item_ids):
        if item_id in certifications:
            certifications[item_id].display_order = order

    await db.flush()

    result = await db.execute(
        select(Certification)
        .where(Certification.user_id == user_id)
        .order_by(Certification.display_order)
    )
    return result.scalars().all()


# ============================================================
# Awards CRUD
# ============================================================

@router.get("/awards", response_model=List[AwardResponse])
async def get_awards(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all awards for a user."""
    result = await db.execute(
        select(Award)
        .where(Award.user_id == user_id)
        .order_by(Award.display_order, Award.award_date.desc())
    )
    return result.scalars().all()


@router.post("/awards", response_model=AwardResponse, status_code=status.HTTP_201_CREATED)
async def create_award(
    data: AwardCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new award."""
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    award = Award(user_id=user_id, **data.model_dump())
    db.add(award)
    await db.flush()
    await db.refresh(award)
    return award


@router.get("/awards/{id}", response_model=AwardResponse)
async def get_award(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific award by ID."""
    result = await db.execute(
        select(Award).where(Award.id == id, Award.user_id == user_id)
    )
    award = result.scalar_one_or_none()
    if not award:
        raise HTTPException(status_code=404, detail="Award not found")
    return award


@router.put("/awards/{id}", response_model=AwardResponse)
async def update_award(
    id: int,
    data: AwardUpdate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Update an award."""
    result = await db.execute(
        select(Award).where(Award.id == id, Award.user_id == user_id)
    )
    award = result.scalar_one_or_none()
    if not award:
        raise HTTPException(status_code=404, detail="Award not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(award, field, value)

    await db.flush()
    await db.refresh(award)
    return award


@router.delete("/awards/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_award(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Delete an award."""
    result = await db.execute(
        select(Award).where(Award.id == id, Award.user_id == user_id)
    )
    award = result.scalar_one_or_none()
    if not award:
        raise HTTPException(status_code=404, detail="Award not found")

    await db.delete(award)


@router.put("/awards/reorder", response_model=List[AwardResponse])
async def reorder_awards(
    data: ReorderRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Reorder awards by providing list of IDs in desired order."""
    result = await db.execute(
        select(Award).where(Award.user_id == user_id)
    )
    awards = {a.id: a for a in result.scalars().all()}

    for order, item_id in enumerate(data.item_ids):
        if item_id in awards:
            awards[item_id].display_order = order

    await db.flush()

    result = await db.execute(
        select(Award)
        .where(Award.user_id == user_id)
        .order_by(Award.display_order)
    )
    return result.scalars().all()


# ============================================================
# Educations CRUD
# ============================================================

@router.get("/educations", response_model=List[EducationResponse])
async def get_educations(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all educations for a user."""
    result = await db.execute(
        select(Education)
        .where(Education.user_id == user_id)
        .order_by(Education.display_order, Education.start_date.desc())
    )
    return result.scalars().all()


@router.post("/educations", response_model=EducationResponse, status_code=status.HTTP_201_CREATED)
async def create_education(
    data: EducationCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new education."""
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    education = Education(
        user_id=user_id,
        **data.model_dump(exclude={"is_current"}),
        is_current=1 if data.is_current else 0
    )
    db.add(education)
    await db.flush()
    await db.refresh(education)
    return education


@router.get("/educations/{id}", response_model=EducationResponse)
async def get_education(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific education by ID."""
    result = await db.execute(
        select(Education).where(Education.id == id, Education.user_id == user_id)
    )
    education = result.scalar_one_or_none()
    if not education:
        raise HTTPException(status_code=404, detail="Education not found")
    return education


@router.put("/educations/{id}", response_model=EducationResponse)
async def update_education(
    id: int,
    data: EducationUpdate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Update an education."""
    result = await db.execute(
        select(Education).where(Education.id == id, Education.user_id == user_id)
    )
    education = result.scalar_one_or_none()
    if not education:
        raise HTTPException(status_code=404, detail="Education not found")

    update_data = data.model_dump(exclude_unset=True)

    # Handle is_current conversion to SQLite integer
    if "is_current" in update_data:
        update_data["is_current"] = 1 if update_data["is_current"] else 0

    for field, value in update_data.items():
        setattr(education, field, value)

    await db.flush()
    await db.refresh(education)
    return education


@router.delete("/educations/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_education(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Delete an education."""
    result = await db.execute(
        select(Education).where(Education.id == id, Education.user_id == user_id)
    )
    education = result.scalar_one_or_none()
    if not education:
        raise HTTPException(status_code=404, detail="Education not found")

    await db.delete(education)


@router.put("/educations/reorder", response_model=List[EducationResponse])
async def reorder_educations(
    data: ReorderRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Reorder educations by providing list of IDs in desired order."""
    result = await db.execute(
        select(Education).where(Education.user_id == user_id)
    )
    educations = {e.id: e for e in result.scalars().all()}

    for order, item_id in enumerate(data.item_ids):
        if item_id in educations:
            educations[item_id].display_order = order

    await db.flush()

    result = await db.execute(
        select(Education)
        .where(Education.user_id == user_id)
        .order_by(Education.display_order)
    )
    return result.scalars().all()


# ============================================================
# Publications CRUD
# ============================================================

@router.get("/publications", response_model=List[PublicationResponse])
async def get_publications(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all publications for a user."""
    result = await db.execute(
        select(Publication)
        .where(Publication.user_id == user_id)
        .order_by(Publication.display_order, Publication.publication_date.desc())
    )
    return result.scalars().all()


@router.post("/publications", response_model=PublicationResponse, status_code=status.HTTP_201_CREATED)
async def create_publication(
    data: PublicationCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new publication."""
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    publication = Publication(user_id=user_id, **data.model_dump())
    db.add(publication)
    await db.flush()
    await db.refresh(publication)
    return publication


@router.get("/publications/{id}", response_model=PublicationResponse)
async def get_publication(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific publication by ID."""
    result = await db.execute(
        select(Publication).where(Publication.id == id, Publication.user_id == user_id)
    )
    publication = result.scalar_one_or_none()
    if not publication:
        raise HTTPException(status_code=404, detail="Publication not found")
    return publication


@router.put("/publications/{id}", response_model=PublicationResponse)
async def update_publication(
    id: int,
    data: PublicationUpdate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Update a publication."""
    result = await db.execute(
        select(Publication).where(Publication.id == id, Publication.user_id == user_id)
    )
    publication = result.scalar_one_or_none()
    if not publication:
        raise HTTPException(status_code=404, detail="Publication not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(publication, field, value)

    await db.flush()
    await db.refresh(publication)
    return publication


@router.delete("/publications/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_publication(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Delete a publication."""
    result = await db.execute(
        select(Publication).where(Publication.id == id, Publication.user_id == user_id)
    )
    publication = result.scalar_one_or_none()
    if not publication:
        raise HTTPException(status_code=404, detail="Publication not found")

    await db.delete(publication)


@router.put("/publications/reorder", response_model=List[PublicationResponse])
async def reorder_publications(
    data: ReorderRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Reorder publications by providing list of IDs in desired order."""
    result = await db.execute(
        select(Publication).where(Publication.user_id == user_id)
    )
    publications = {p.id: p for p in result.scalars().all()}

    for order, item_id in enumerate(data.item_ids):
        if item_id in publications:
            publications[item_id].display_order = order

    await db.flush()

    result = await db.execute(
        select(Publication)
        .where(Publication.user_id == user_id)
        .order_by(Publication.display_order)
    )
    return result.scalars().all()


# ============================================================
# Volunteer Activities CRUD
# ============================================================

@router.get("/volunteer_activities", response_model=List[VolunteerActivityResponse])
async def get_volunteer_activities(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all volunteer activities for a user."""
    result = await db.execute(
        select(VolunteerActivity)
        .where(VolunteerActivity.user_id == user_id)
        .order_by(VolunteerActivity.display_order, VolunteerActivity.start_date.desc())
    )
    return result.scalars().all()


@router.post("/volunteer_activities", response_model=VolunteerActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_volunteer_activity(
    data: VolunteerActivityCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new volunteer activity."""
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    activity = VolunteerActivity(
        user_id=user_id,
        **data.model_dump(exclude={"is_current"}),
        is_current=1 if data.is_current else 0
    )
    db.add(activity)
    await db.flush()
    await db.refresh(activity)
    return activity


@router.get("/volunteer_activities/{id}", response_model=VolunteerActivityResponse)
async def get_volunteer_activity(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific volunteer activity by ID."""
    result = await db.execute(
        select(VolunteerActivity).where(VolunteerActivity.id == id, VolunteerActivity.user_id == user_id)
    )
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Volunteer activity not found")
    return activity


@router.put("/volunteer_activities/{id}", response_model=VolunteerActivityResponse)
async def update_volunteer_activity(
    id: int,
    data: VolunteerActivityUpdate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Update a volunteer activity."""
    result = await db.execute(
        select(VolunteerActivity).where(VolunteerActivity.id == id, VolunteerActivity.user_id == user_id)
    )
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Volunteer activity not found")

    update_data = data.model_dump(exclude_unset=True)

    # Handle is_current conversion to SQLite integer
    if "is_current" in update_data:
        update_data["is_current"] = 1 if update_data["is_current"] else 0

    for field, value in update_data.items():
        setattr(activity, field, value)

    await db.flush()
    await db.refresh(activity)
    return activity


@router.delete("/volunteer_activities/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_volunteer_activity(
    id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Delete a volunteer activity."""
    result = await db.execute(
        select(VolunteerActivity).where(VolunteerActivity.id == id, VolunteerActivity.user_id == user_id)
    )
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Volunteer activity not found")

    await db.delete(activity)


@router.put("/volunteer_activities/reorder", response_model=List[VolunteerActivityResponse])
async def reorder_volunteer_activities(
    data: ReorderRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Reorder volunteer activities by providing list of IDs in desired order."""
    result = await db.execute(
        select(VolunteerActivity).where(VolunteerActivity.user_id == user_id)
    )
    activities = {a.id: a for a in result.scalars().all()}

    for order, item_id in enumerate(data.item_ids):
        if item_id in activities:
            activities[item_id].display_order = order

    await db.flush()

    result = await db.execute(
        select(VolunteerActivity)
        .where(VolunteerActivity.user_id == user_id)
        .order_by(VolunteerActivity.display_order)
    )
    return result.scalars().all()


# ============================================================
# Attachment Endpoints (for all credential types)
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
        raise HTTPException(status_code=404, detail=f"{credential_type[:-1].title()} not found")

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
        raise HTTPException(status_code=404, detail=f"{credential_type[:-1].title()} not found")

    if not credential.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found")

    full_path = attachment_service.get_full_path(credential.attachment_path)
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file not found")

    content_type = attachment_service.get_content_type(credential.attachment_name or "file")

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
        raise HTTPException(status_code=404, detail=f"{credential_type[:-1].title()} not found")

    if not credential.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found")

    # Delete the file
    await attachment_service.delete_attachment(credential.attachment_path)

    # Update credential
    credential.attachment_path = None
    credential.attachment_name = None
    credential.attachment_size = None

    await db.flush()
