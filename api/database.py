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
    expire_on_commit=False,
    autoflush=False  # Disable autoflush to prevent SQLite lock issues
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

        # Add personal info columns (v1.12)
        if 'display_name' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(100)"))
        if 'profile_email' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN profile_email VARCHAR(255)"))
        if 'phone' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50)"))
        if 'address' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN address VARCHAR(500)"))
        if 'birthdate' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN birthdate DATE"))
        if 'profile_photo_url' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN profile_photo_url VARCHAR(500)"))

        # Add AI analysis settings columns (v1.12)
        if 'default_analysis_language' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN default_analysis_language VARCHAR(10) DEFAULT 'ko'"))
        if 'default_analysis_scope' not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN default_analysis_scope VARCHAR(20) DEFAULT 'standard'"))

        # Create indexes for foreign keys if they don't exist (v1.9)
        # SQLite automatically creates indexes for PRIMARY KEY but not for FOREIGN KEY
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects (user_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_projects_company_id ON projects (company_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_projects_is_analyzed ON projects (is_analyzed)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_repo_analyses_project_id ON repo_analyses (project_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_project_achievements_project_id ON project_achievements (project_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_project_technologies_project_id ON project_technologies (project_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_project_technologies_technology_id ON project_technologies (technology_id)
        """))


async def close_db():
    """Close database connection."""
    await engine.dispose()
