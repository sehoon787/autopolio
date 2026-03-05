import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from api.config import get_settings
from api.constants import JobStatus

settings = get_settings()

# Build engine kwargs based on database type
_engine_kwargs: dict = {
    "echo": settings.debug,
    "future": True,
    "pool_pre_ping": True,
}

if settings.is_sqlite:
    # SQLite: NullPool doesn't support pool_size/max_overflow
    pass
else:
    # PostgreSQL: connection pool settings
    _engine_kwargs.update(
        pool_size=10,
        max_overflow=5,
        pool_timeout=30,
        pool_recycle=600,
    )

engine = create_async_engine(settings.database_url, **_engine_kwargs)


# Enable WAL mode and busy timeout for SQLite only
if settings.is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,  # Disable autoflush to prevent SQLite lock issues
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency for getting async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables.

    When ENABLE_MIGRATIONS=true, runs Alembic migrations (versioned schema management).
    Otherwise, falls back to create_all (creates missing tables, no column migrations).
    """
    if settings.enable_migrations:
        _run_alembic_upgrade()
    else:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    # Manual column migration: add 'tier' to users table if missing
    await _migrate_add_tier_column()


def _run_alembic_upgrade():
    """Run alembic upgrade head (synchronous — called once at startup)."""
    from alembic.config import Config
    from alembic import command

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


async def _migrate_add_tier_column():
    """Add 'tier' column to users table if it doesn't exist."""
    from sqlalchemy import text

    logger = logging.getLogger("api.database")

    async with AsyncSessionLocal() as db:
        try:
            if settings.is_sqlite:
                result = await db.execute(text("PRAGMA table_info(users)"))
                columns = [row[1] for row in result.fetchall()]
                has_tier = "tier" in columns
            else:
                # PostgreSQL
                result = await db.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'users' AND column_name = 'tier'"
                    )
                )
                has_tier = result.scalar_one_or_none() is not None

            if not has_tier:
                await db.execute(
                    text("ALTER TABLE users ADD COLUMN tier VARCHAR(20) DEFAULT 'free'")
                )
                await db.commit()
                logger.info("Migration: added 'tier' column to users table")
        except Exception as e:
            await db.rollback()
            logger.warning("Tier column migration skipped: %s", e)


async def cleanup_stale_jobs():
    """Mark stale running/pending jobs as failed on startup.

    When the server restarts, any jobs left in 'running' or 'pending' state
    are orphaned (their background tasks are gone). Mark them as failed
    so the UI doesn't show perpetually stuck jobs.
    """
    from sqlalchemy import text

    logger = logging.getLogger("api.database")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                f"SELECT COUNT(*) FROM jobs WHERE status IN ('{JobStatus.RUNNING}', '{JobStatus.PENDING}')"
            )
        )
        count = result.scalar()
        if count:
            await db.execute(
                text(f"""
                    UPDATE jobs
                    SET status = '{JobStatus.FAILED}',
                        error_message = 'Server restarted while job was in progress',
                        completed_at = CURRENT_TIMESTAMP
                    WHERE status IN ('{JobStatus.RUNNING}', '{JobStatus.PENDING}')
                """)
            )
            await db.commit()
            logger.info("Cleaned up %d stale jobs (running/pending → failed)", count)


async def close_db():
    """Close database connection."""
    await engine.dispose()
