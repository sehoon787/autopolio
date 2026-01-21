from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from api.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
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
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add new columns to existing tables if they don't exist
    # SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we check first
    async with engine.begin() as conn:
        from sqlalchemy import text

        # Check and add API key columns to users table
        result = await conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in result.fetchall()]

        if 'openai_api_key_encrypted' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN openai_api_key_encrypted TEXT"))
        if 'anthropic_api_key_encrypted' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN anthropic_api_key_encrypted TEXT"))
        if 'gemini_api_key_encrypted' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN gemini_api_key_encrypted TEXT"))

        # Add model preference columns (v1.4)
        if 'openai_model' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN openai_model VARCHAR(100) DEFAULT 'gpt-4-turbo-preview'"))
        if 'anthropic_model' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN anthropic_model VARCHAR(100) DEFAULT 'claude-3-5-sonnet-20241022'"))
        if 'gemini_model' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN gemini_model VARCHAR(100) DEFAULT 'gemini-2.0-flash'"))


async def close_db():
    """Close database connection."""
    await engine.dispose()
