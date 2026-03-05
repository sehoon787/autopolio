"""Tier-based feature gating dependencies.

FastAPI Depends() guards that check user tier limits before allowing actions.
Local dev and Electron runtimes bypass all checks (unlimited).
"""

import os
from datetime import datetime

from fastapi import Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.models.user import User
from api.models.project import Project
from api.models.usage_record import UsageRecord
from api.constants import UserTier, RuntimeProfile, TIER_LIMITS


def _is_local_runtime() -> bool:
    """Local dev and Electron runtimes bypass all tier restrictions."""
    return os.environ.get("AUTOPOLIO_RUNTIME") in (
        RuntimeProfile.ELECTRON,
        RuntimeProfile.LOCAL,
    )


async def get_user_with_tier(
    user_id: int,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Fetch user with tier info. Raises 404 if not found."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Default tier for users created before tier system
    if not user.tier:
        user.tier = UserTier.FREE
    return user


async def _get_tier_limits(user_id: int, db: AsyncSession) -> dict | None:
    """Get user's tier limits. Returns None for local/electron (unlimited)."""
    if _is_local_runtime():
        return None
    user = await get_user_with_tier(user_id, db)
    return TIER_LIMITS.get(user.tier, TIER_LIMITS[UserTier.FREE])


async def check_project_limit(
    user_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Check if user can create another project. Raises 403 if over limit."""
    limits = await _get_tier_limits(user_id, db)
    if limits is None:
        return

    max_projects = limits["max_projects"]

    if max_projects is None:  # unlimited
        return

    count_result = await db.execute(
        select(func.count(Project.id)).where(Project.user_id == user_id)
    )
    current_count = count_result.scalar() or 0

    if current_count >= max_projects:
        user = await get_user_with_tier(user_id, db)
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PROJECT_LIMIT_REACHED",
                "message": f"Project limit reached ({current_count}/{max_projects})",
                "current": current_count,
                "max": max_projects,
                "tier": user.tier,
            },
        )


async def check_llm_call_limit(
    user_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Check if user can make another LLM call this month. Raises 403 if over limit."""
    limits = await _get_tier_limits(user_id, db)
    if limits is None:
        return

    max_calls = limits["max_llm_calls_per_month"]

    if max_calls is None:  # unlimited
        return

    year_month = datetime.utcnow().strftime("%Y-%m")
    result = await db.execute(
        select(UsageRecord).where(
            UsageRecord.user_id == user_id,
            UsageRecord.year_month == year_month,
        )
    )
    record = result.scalar_one_or_none()
    current_count = record.llm_call_count if record else 0

    if current_count >= max_calls:
        user = await get_user_with_tier(user_id, db)
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LLM_LIMIT_REACHED",
                "message": f"Monthly AI analysis limit reached ({current_count}/{max_calls})",
                "current": current_count,
                "max": max_calls,
                "tier": user.tier,
            },
        )


def check_export_format(format: str, user_id: int):
    """Return a dependency that checks if the export format is allowed for the user's tier."""

    async def _check(db: AsyncSession = Depends(get_db)) -> None:
        limits = await _get_tier_limits(user_id, db)
        if limits is None:
            return

        allowed = limits["allowed_export_formats"]

        if format.lower() not in allowed:
            user = await get_user_with_tier(user_id, db)
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "EXPORT_FORMAT_LOCKED",
                    "message": f"Export format '{format}' is not available in {user.tier} plan",
                    "format": format,
                    "allowed_formats": allowed,
                    "tier": user.tier,
                },
            )

    return _check


async def check_export_format_dep(
    format: str,
    user_id: int,
    db: AsyncSession,
) -> None:
    """Direct function (not dependency factory) to check export format.
    Call this inside endpoint handlers."""
    limits = await _get_tier_limits(user_id, db)
    if limits is None:
        return

    allowed = limits["allowed_export_formats"]

    if format.lower() not in allowed:
        user = await get_user_with_tier(user_id, db)
        raise HTTPException(
            status_code=403,
            detail={
                "code": "EXPORT_FORMAT_LOCKED",
                "message": f"Export format '{format}' is not available in {user.tier} plan",
                "format": format,
                "allowed_formats": allowed,
                "tier": user.tier,
            },
        )
