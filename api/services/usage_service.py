"""Usage tracking service for tier-based feature gating."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.usage_record import UsageRecord


async def increment_llm_usage(db: AsyncSession, user_id: int) -> None:
    """Increment the monthly LLM call count for a user."""
    year_month = datetime.utcnow().strftime("%Y-%m")
    result = await db.execute(
        select(UsageRecord).where(
            UsageRecord.user_id == user_id,
            UsageRecord.year_month == year_month,
        )
    )
    record = result.scalar_one_or_none()

    if record:
        record.llm_call_count += 1
    else:
        record = UsageRecord(
            user_id=user_id,
            year_month=year_month,
            llm_call_count=1,
        )
        db.add(record)

    await db.flush()


async def get_monthly_usage(db: AsyncSession, user_id: int) -> int:
    """Get the current month's LLM call count for a user."""
    year_month = datetime.utcnow().strftime("%Y-%m")
    result = await db.execute(
        select(UsageRecord).where(
            UsageRecord.user_id == user_id,
            UsageRecord.year_month == year_month,
        )
    )
    record = result.scalar_one_or_none()
    return record.llm_call_count if record else 0
