"""
Generic CRUD Factory for Credential Endpoints

Eliminates duplicate CRUD code across credential types.
Each credential type (certifications, awards, etc.) has identical
CRUD operations that only differ in model class and field names.

Usage:
    from .crud_factory import create_credential_crud_endpoints

    certifications_router = create_credential_crud_endpoints(
        model_class=Certification,
        create_schema=CertificationCreate,
        update_schema=CertificationUpdate,
        response_schema=CertificationResponse,
        name="certifications",
        singular_name="Certification",
        date_field="issue_date",
    )
"""

from typing import Type, TypeVar, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from api.database import get_db
from api.models.user import User
from api.schemas.credentials import ReorderRequest

# Type variables for generic typing
TModel = TypeVar("TModel")
TCreate = TypeVar("TCreate", bound=BaseModel)
TUpdate = TypeVar("TUpdate", bound=BaseModel)
TResponse = TypeVar("TResponse", bound=BaseModel)


def create_credential_crud_endpoints(
    model_class: Type[TModel],
    create_schema: Type[TCreate],
    update_schema: Type[TUpdate],
    response_schema: Type[TResponse],
    name: str,
    singular_name: str,
    date_field: Optional[str] = None,
    bool_fields: Optional[List[str]] = None,
) -> APIRouter:
    """
    Create a complete set of CRUD endpoints for a credential model.

    Args:
        model_class: SQLAlchemy model class (e.g., Certification)
        create_schema: Pydantic schema for create operations
        update_schema: Pydantic schema for update operations
        response_schema: Pydantic schema for responses
        name: Plural name for URLs (e.g., "certifications")
        singular_name: Singular name for error messages (e.g., "Certification")
        date_field: Optional field name for secondary ordering (e.g., "issue_date")
        bool_fields: Optional list of boolean fields that need SQLite int conversion

    Returns:
        APIRouter with 6 endpoints: list, create, get, update, delete, reorder
    """
    router = APIRouter()
    bool_fields = bool_fields or []

    def _convert_bool_fields(data: dict) -> dict:
        """Convert boolean fields to SQLite integers (0/1)."""
        for field in bool_fields:
            if field in data:
                data[field] = 1 if data[field] else 0
        return data

    @router.get(f"/{name}", response_model=List[response_schema])
    async def get_all(
        user_id: int = Query(..., description="User ID"),
        db: AsyncSession = Depends(get_db),
    ):
        """Get all items for a user."""
        query = select(model_class).where(model_class.user_id == user_id)

        # Order by display_order first, then by date field if specified
        order_clauses = [model_class.display_order]
        if date_field:
            order_clauses.append(getattr(model_class, date_field).desc())

        query = query.order_by(*order_clauses)
        result = await db.execute(query)
        return result.scalars().all()

    @router.post(
        f"/{name}", response_model=response_schema, status_code=status.HTTP_201_CREATED
    )
    async def create(
        data: create_schema,
        user_id: int = Query(..., description="User ID"),
        db: AsyncSession = Depends(get_db),
    ):
        """Create a new item."""
        # Verify user exists
        result = await db.execute(select(User).where(User.id == user_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="User not found")

        # Prepare data with boolean conversion
        create_data = data.model_dump()
        if bool_fields:
            # Exclude bool fields from initial dump, then add converted values
            create_data = data.model_dump(exclude=set(bool_fields))
            create_data = _convert_bool_fields(
                {
                    **create_data,
                    **{f: getattr(data, f) for f in bool_fields if hasattr(data, f)},
                }
            )

        item = model_class(user_id=user_id, **create_data)
        db.add(item)
        await db.flush()
        await db.refresh(item)
        return item

    @router.get(f"/{name}/{{id}}", response_model=response_schema)
    async def get_one(
        id: int,
        user_id: int = Query(..., description="User ID"),
        db: AsyncSession = Depends(get_db),
    ):
        """Get a specific item by ID."""
        result = await db.execute(
            select(model_class).where(
                model_class.id == id, model_class.user_id == user_id
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail=f"{singular_name} not found")
        return item

    @router.put(f"/{name}/{{id}}", response_model=response_schema)
    async def update(
        id: int,
        data: update_schema,
        user_id: int = Query(..., description="User ID"),
        db: AsyncSession = Depends(get_db),
    ):
        """Update an item."""
        result = await db.execute(
            select(model_class).where(
                model_class.id == id, model_class.user_id == user_id
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail=f"{singular_name} not found")

        update_data = data.model_dump(exclude_unset=True)

        # Convert boolean fields to SQLite integers
        if bool_fields:
            update_data = _convert_bool_fields(update_data)

        for field, value in update_data.items():
            setattr(item, field, value)

        await db.flush()
        await db.refresh(item)
        return item

    @router.delete(f"/{name}/{{id}}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete(
        id: int,
        user_id: int = Query(..., description="User ID"),
        db: AsyncSession = Depends(get_db),
    ):
        """Delete an item."""
        result = await db.execute(
            select(model_class).where(
                model_class.id == id, model_class.user_id == user_id
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail=f"{singular_name} not found")

        await db.delete(item)

    @router.put(f"/{name}/reorder", response_model=List[response_schema])
    async def reorder(
        data: ReorderRequest,
        user_id: int = Query(..., description="User ID"),
        db: AsyncSession = Depends(get_db),
    ):
        """Reorder items by providing list of IDs in desired order."""
        result = await db.execute(
            select(model_class).where(model_class.user_id == user_id)
        )
        items = {item.id: item for item in result.scalars().all()}

        for order, item_id in enumerate(data.item_ids):
            if item_id in items:
                items[item_id].display_order = order

        await db.flush()

        # Return reordered list
        result = await db.execute(
            select(model_class)
            .where(model_class.user_id == user_id)
            .order_by(model_class.display_order)
        )
        return result.scalars().all()

    return router
