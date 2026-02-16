"""
Migration: Add ai_tools_detected column to repo_analyses table.

Usage:
    python -m api.migrations.add_ai_tools_column
"""

import asyncio
import logging
from sqlalchemy import text
from api.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate():
    """Add ai_tools_detected JSON column to repo_analyses."""
    async with engine.begin() as conn:
        # Check if column already exists
        result = await conn.execute(text("PRAGMA table_info(repo_analyses)"))
        columns = [row[1] for row in result.fetchall()]

        if "ai_tools_detected" not in columns:
            await conn.execute(
                text("ALTER TABLE repo_analyses ADD COLUMN ai_tools_detected JSON")
            )
            logger.info("Added ai_tools_detected column to repo_analyses")
        else:
            logger.info("ai_tools_detected column already exists, skipping")


if __name__ == "__main__":
    asyncio.run(migrate())
