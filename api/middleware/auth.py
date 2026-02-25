"""Authentication middleware.

Resolves the current user via user_id query parameter.
"""

from typing import Optional

from fastapi import HTTPException, Query


async def get_current_user_id(
    user_id: Optional[int] = Query(None, description="User ID"),
) -> int:
    """Resolve the current user ID from query parameter."""
    if user_id is None or user_id <= 0:
        raise HTTPException(
            status_code=400, detail="user_id query parameter is required"
        )
    return user_id
