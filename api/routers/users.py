from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from api.database import get_db
from api.models.user import User
from api.schemas.user import UserCreate, UserUpdate, UserResponse

router = APIRouter()


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
