import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from api.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
    pool_pre_ping=True,
    # pool_size/max_overflow/pool_timeout not supported with SQLite NullPool
    # Only use these with PostgreSQL or similar databases
    **(
        {"pool_size": 10, "max_overflow": 0, "pool_timeout": 30, "pool_recycle": 600}
        if "sqlite" not in settings.database_url
        else {}
    ),
)


# Enable WAL mode and busy timeout for SQLite to prevent lock contention
# when multiple sessions are used concurrently (e.g., pipeline background tasks)
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

        if "openai_api_key_encrypted" not in columns:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN openai_api_key_encrypted TEXT")
            )
        if "anthropic_api_key_encrypted" not in columns:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN anthropic_api_key_encrypted TEXT")
            )
        if "gemini_api_key_encrypted" not in columns:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN gemini_api_key_encrypted TEXT")
            )

        # Add model preference columns (v1.4)
        if "openai_model" not in columns:
            await conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN openai_model VARCHAR(100) DEFAULT 'gpt-4-turbo-preview'"
                )
            )
        if "anthropic_model" not in columns:
            await conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN anthropic_model VARCHAR(100) DEFAULT 'claude-3-5-sonnet-20241022'"
                )
            )
        if "gemini_model" not in columns:
            await conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN gemini_model VARCHAR(100) DEFAULT 'gemini-2.0-flash'"
                )
            )

        # Add personal info columns (v1.12)
        if "display_name" not in columns:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN display_name VARCHAR(100)")
            )
        if "profile_email" not in columns:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN profile_email VARCHAR(255)")
            )
        if "phone" not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50)"))
        if "address" not in columns:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN address VARCHAR(500)")
            )
        if "birthdate" not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN birthdate DATE"))
        if "profile_photo_url" not in columns:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN profile_photo_url VARCHAR(500)")
            )

        # Add AI analysis settings columns (v1.12)
        if "default_analysis_language" not in columns:
            await conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN default_analysis_language VARCHAR(10) DEFAULT 'ko'"
                )
            )
        if "default_analysis_scope" not in columns:
            await conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN default_analysis_scope VARCHAR(20) DEFAULT 'standard'"
                )
            )

        # Add missing columns to repo_analyses
        ra_result = await conn.execute(text("PRAGMA table_info(repo_analyses)"))
        ra_columns = [row[1] for row in ra_result.fetchall()]

        # Add ai_tools_detected column (v1.17)
        if "ai_tools_detected" not in ra_columns:
            await conn.execute(
                text("ALTER TABLE repo_analyses ADD COLUMN ai_tools_detected JSON")
            )

        # Add project_repository_id (v1.17 multi-repo)
        if "project_repository_id" not in ra_columns:
            await conn.execute(
                text(
                    "ALTER TABLE repo_analyses ADD COLUMN project_repository_id INTEGER"
                    " REFERENCES project_repositories(id)"
                )
            )

        # Remove UNIQUE constraint on repo_analyses.project_id (v1.17 multi-repo)
        # SQLite cannot ALTER TABLE DROP CONSTRAINT, so we recreate the table
        idx_result = await conn.execute(text("PRAGMA index_list(repo_analyses)"))
        indexes = idx_result.fetchall()
        has_unique_project_id = any(
            row[2] == 1 and "project_id" in str(row[1]) for row in indexes
        )
        if has_unique_project_id:
            await conn.execute(
                text("CREATE TABLE repo_analyses_new AS SELECT * FROM repo_analyses")
            )
            await conn.execute(text("DROP TABLE repo_analyses"))
            await conn.execute(
                text("""
                CREATE TABLE repo_analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    project_repository_id INTEGER REFERENCES project_repositories(id),
                    git_url VARCHAR(500) NOT NULL,
                    default_branch VARCHAR(100) DEFAULT 'main',
                    repo_technologies JSON, all_contributors JSON,
                    total_commits INTEGER DEFAULT 0, user_commits INTEGER DEFAULT 0,
                    first_commit_date DATETIME, last_commit_date DATETIME,
                    lines_added INTEGER DEFAULT 0, lines_deleted INTEGER DEFAULT 0,
                    files_changed INTEGER DEFAULT 0,
                    languages JSON, primary_language VARCHAR(50),
                    detected_technologies JSON, package_files JSON,
                    commit_messages_summary TEXT, commit_categories JSON,
                    key_tasks JSON, architecture_patterns JSON, code_quality_metrics JSON,
                    implementation_details JSON, development_timeline JSON,
                    tech_stack_versions JSON, detailed_achievements JSON,
                    ai_summary TEXT, ai_key_features JSON,
                    user_code_contributions JSON, suggested_contribution_percent INTEGER,
                    ai_tools_detected JSON,
                    analysis_language VARCHAR(10) DEFAULT 'ko',
                    analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    analysis_version VARCHAR(20) DEFAULT '1.0',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            )
            await conn.execute(
                text("""
                INSERT INTO repo_analyses (
                    id, project_id, project_repository_id, git_url, default_branch,
                    repo_technologies, all_contributors,
                    total_commits, user_commits, first_commit_date, last_commit_date,
                    lines_added, lines_deleted, files_changed,
                    languages, primary_language, detected_technologies, package_files,
                    commit_messages_summary, commit_categories, key_tasks,
                    architecture_patterns, code_quality_metrics,
                    implementation_details, development_timeline,
                    tech_stack_versions, detailed_achievements,
                    ai_summary, ai_key_features, user_code_contributions,
                    suggested_contribution_percent, ai_tools_detected,
                    analysis_language,
                    analyzed_at, analysis_version, created_at, updated_at
                )
                SELECT
                    id, project_id, project_repository_id, git_url, default_branch,
                    repo_technologies, all_contributors,
                    total_commits, user_commits, first_commit_date, last_commit_date,
                    lines_added, lines_deleted, files_changed,
                    languages, primary_language, detected_technologies, package_files,
                    commit_messages_summary, commit_categories, key_tasks,
                    architecture_patterns, code_quality_metrics,
                    implementation_details, development_timeline,
                    tech_stack_versions, detailed_achievements,
                    ai_summary, ai_key_features, user_code_contributions,
                    suggested_contribution_percent, ai_tools_detected,
                    analysis_language,
                    analyzed_at, analysis_version, created_at, updated_at
                FROM repo_analyses_new
            """)
            )
            await conn.execute(text("DROP TABLE repo_analyses_new"))

        # Create indexes for foreign keys if they don't exist (v1.9)
        # SQLite automatically creates indexes for PRIMARY KEY but not for FOREIGN KEY
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects (user_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_projects_company_id ON projects (company_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_projects_is_analyzed ON projects (is_analyzed)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_repo_analyses_project_id ON repo_analyses (project_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_repo_analyses_project_repository_id ON repo_analyses (project_repository_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_project_achievements_project_id ON project_achievements (project_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_project_technologies_project_id ON project_technologies (project_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_project_technologies_technology_id ON project_technologies (technology_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_project_repositories_project_id ON project_repositories (project_id)
        """)
        )


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
            text("SELECT COUNT(*) FROM jobs WHERE status IN ('running', 'pending')")
        )
        count = result.scalar()
        if count:
            await db.execute(
                text("""
                    UPDATE jobs
                    SET status = 'failed',
                        error_message = 'Server restarted while job was in progress',
                        completed_at = CURRENT_TIMESTAMP
                    WHERE status IN ('running', 'pending')
                """)
            )
            await db.commit()
            logger.info("Cleaned up %d stale jobs (running/pending → failed)", count)


async def close_db():
    """Close database connection."""
    await engine.dispose()
