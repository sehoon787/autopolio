import os
import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from api.database import get_db
from api.models.user import User
from api.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserProfileUpdate,
    UserProfileResponse,
    GenerationOptionsUpdate,
    GenerationOptionsResponse,
)
from api.services.profile_service import ProfileService

router = APIRouter()

# Photo upload directory
PHOTO_UPLOAD_DIR = Path("data/photos")
PHOTO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Allowed file extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


@router.get("", response_model=List[UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all users."""
    result = await db.execute(
        select(User).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new user."""
    # Check if user with same email or github username exists
    if user_data.email:
        result = await db.execute(
            select(User).where(User.email == user_data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

    if user_data.github_username:
        result = await db.execute(
            select(User).where(User.github_username == user_data.github_username)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="GitHub username already registered")

    user = User(**user_data.model_dump())
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)


@router.get("/{user_id}/stats")
async def get_user_stats(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get statistics for a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Count related entities
    from api.models import Company, Project, GeneratedDocument

    companies_result = await db.execute(
        select(Company).where(Company.user_id == user_id)
    )
    companies_count = len(companies_result.scalars().all())

    projects_result = await db.execute(
        select(Project).where(Project.user_id == user_id)
    )
    projects = projects_result.scalars().all()
    projects_count = len(projects)
    analyzed_count = sum(1 for p in projects if p.is_analyzed)

    documents_result = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.user_id == user_id)
    )
    documents_count = len(documents_result.scalars().all())

    return {
        "user_id": user_id,
        "companies_count": companies_count,
        "projects_count": projects_count,
        "analyzed_projects_count": analyzed_count,
        "documents_count": documents_count,
        "github_connected": user.github_token_encrypted is not None,
    }


@router.get("/{user_id}/profile", response_model=UserProfileResponse)
async def get_user_profile(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get user profile with OAuth defaults and effective values.

    Returns:
    - User-entered values (can be None or "")
    - OAuth default values (from primary OAuth identity)
    - Effective values (user value if set, otherwise OAuth default)
    """
    service = ProfileService(db)
    try:
        return await service.get_profile(user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{user_id}/profile", response_model=UserProfileResponse)
async def update_user_profile(
    user_id: int,
    data: UserProfileUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update user profile.

    Field behavior:
    - Field not in request: keep current value
    - Field is "" (empty string): user intentionally cleared the field
    - Field has value: update to new value

    Note: Profile fields do NOT overwrite OAuth defaults.
    OAuth data is only stored in OAuthIdentity.raw_data.
    """
    service = ProfileService(db)
    try:
        return await service.update_profile(user_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{user_id}/generation-options", response_model=GenerationOptionsResponse)
async def get_generation_options(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get user's default generation options.

    These options are used as defaults when analyzing projects and generating documents.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Convert string booleans to actual booleans
    def str_to_bool(value: str, default: bool = True) -> bool:
        if value is None:
            return default
        return value.lower() == "true"

    return GenerationOptionsResponse(
        # AI Analysis settings
        default_summary_style=getattr(user, 'default_summary_style', None) or "professional",
        default_analysis_language=getattr(user, 'default_analysis_language', None) or "ko",
        default_analysis_scope=getattr(user, 'default_analysis_scope', None) or "standard",
        # Document generation settings
        default_output_format=getattr(user, 'default_output_format', None) or "docx",
        default_include_achievements=str_to_bool(getattr(user, 'default_include_achievements', None), True),
        default_include_tech_stack=str_to_bool(getattr(user, 'default_include_tech_stack', None), True),
    )


@router.put("/{user_id}/generation-options", response_model=GenerationOptionsResponse)
async def update_generation_options(
    user_id: int,
    data: GenerationOptionsUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update user's default generation options.

    These options will be used as defaults when analyzing projects and generating documents.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update only provided fields
    # AI Analysis settings
    if data.default_summary_style is not None:
        user.default_summary_style = data.default_summary_style
    if data.default_analysis_language is not None:
        user.default_analysis_language = data.default_analysis_language
    if data.default_analysis_scope is not None:
        user.default_analysis_scope = data.default_analysis_scope
    # Document generation settings (booleans to strings for SQLite)
    if data.default_output_format is not None:
        user.default_output_format = data.default_output_format
    if data.default_include_achievements is not None:
        user.default_include_achievements = "true" if data.default_include_achievements else "false"
    if data.default_include_tech_stack is not None:
        user.default_include_tech_stack = "true" if data.default_include_tech_stack else "false"

    await db.flush()
    await db.refresh(user)

    # Convert back to response
    def str_to_bool(value: str, default: bool = True) -> bool:
        if value is None:
            return default
        return value.lower() == "true"

    return GenerationOptionsResponse(
        # AI Analysis settings
        default_summary_style=getattr(user, 'default_summary_style', None) or "professional",
        default_analysis_language=getattr(user, 'default_analysis_language', None) or "ko",
        default_analysis_scope=getattr(user, 'default_analysis_scope', None) or "standard",
        # Document generation settings
        default_output_format=getattr(user, 'default_output_format', None) or "docx",
        default_include_achievements=str_to_bool(getattr(user, 'default_include_achievements', None), True),
        default_include_tech_stack=str_to_bool(getattr(user, 'default_include_tech_stack', None), True),
    )


@router.post("/{user_id}/photo")
async def upload_profile_photo(
    user_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload a profile photo for the user.

    Supports JPG, JPEG, PNG, GIF, WebP formats.
    Max file size: 5MB
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Photo upload request: user_id={user_id}, filename={file.filename}, content_type={file.content_type}")
    # Check user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Check file size (max 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max size: 5MB")

    # Generate unique filename
    unique_filename = f"{user_id}_{uuid.uuid4().hex}{ext}"
    file_path = PHOTO_UPLOAD_DIR / unique_filename

    # Delete old photo if exists
    if user.profile_photo_url:
        old_filename = user.profile_photo_url.split("/")[-1]
        old_path = PHOTO_UPLOAD_DIR / old_filename
        if old_path.exists():
            os.remove(old_path)

    # Save new photo
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(contents)

    # Update user record
    user.profile_photo_url = f"/api/users/{user_id}/photo/{unique_filename}"
    await db.flush()
    await db.refresh(user)

    return {
        "success": True,
        "photo_url": user.profile_photo_url,
        "filename": unique_filename
    }


@router.get("/{user_id}/photo/{filename}")
async def get_profile_photo(user_id: int, filename: str):
    """Get a user's profile photo."""
    # Security: ensure filename doesn't contain path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = PHOTO_UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Photo not found")

    # Determine content type
    ext = Path(filename).suffix.lower()
    content_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp"
    }
    content_type = content_types.get(ext, "application/octet-stream")

    return FileResponse(file_path, media_type=content_type)


@router.delete("/{user_id}/photo")
async def delete_profile_photo(user_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a user's profile photo."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.profile_photo_url:
        raise HTTPException(status_code=404, detail="No photo to delete")

    # Delete file
    filename = user.profile_photo_url.split("/")[-1]
    file_path = PHOTO_UPLOAD_DIR / filename
    if file_path.exists():
        os.remove(file_path)

    # Clear user record
    user.profile_photo_url = None
    await db.flush()

    return {"success": True, "message": "Photo deleted"}
