"""
Migration: Add multi-repository support for projects.

Creates:
  - project_repositories table
  - project_repository_id column on repo_analyses
  - Migrates existing projects.git_url -> project_repositories records
  - Links existing repo_analyses to their project_repositories

Also handles SQLite limitation: cannot DROP CONSTRAINT on existing tables,
so we recreate repo_analyses without the UNIQUE constraint on project_id.

Usage:
    python -m api.migrations.add_multi_repo
"""
import asyncio
import logging
import sys
import os

# Ensure the project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text
from api.database import engine, AsyncSessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_migration():
    logger.info("=== Starting multi-repo migration ===")

    async with engine.begin() as conn:
        # 1. Create project_repositories table if it doesn't exist
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS project_repositories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id),
                git_url VARCHAR(500) NOT NULL,
                label VARCHAR(100),
                display_order INTEGER DEFAULT 0,
                is_primary INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_project_repositories_project_id
            ON project_repositories (project_id)
        """))
        logger.info("Created project_repositories table")

        # 2. Add project_repository_id column to repo_analyses if missing
        result = await conn.execute(text("PRAGMA table_info(repo_analyses)"))
        columns = [row[1] for row in result.fetchall()]

        if 'project_repository_id' not in columns:
            await conn.execute(text(
                "ALTER TABLE repo_analyses ADD COLUMN project_repository_id INTEGER"
                " REFERENCES project_repositories(id)"
            ))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_repo_analyses_project_repository_id
                ON repo_analyses (project_repository_id)
            """))
            logger.info("Added project_repository_id column to repo_analyses")
        else:
            logger.info("project_repository_id already exists, skipping")

        # 3. Remove UNIQUE constraint on repo_analyses.project_id
        #    SQLite cannot ALTER TABLE DROP CONSTRAINT, so we check if it's unique
        #    by looking at the index list.
        result = await conn.execute(text("PRAGMA index_list(repo_analyses)"))
        indexes = result.fetchall()
        has_unique = any(
            row[2] == 1 and 'project_id' in str(row[1])
            for row in indexes
        )

        if has_unique:
            logger.info("Detected UNIQUE constraint on repo_analyses.project_id — recreating table")
            # SQLite: recreate table without UNIQUE constraint
            await conn.execute(text("""
                CREATE TABLE repo_analyses_new AS SELECT * FROM repo_analyses
            """))
            await conn.execute(text("DROP TABLE repo_analyses"))
            # Recreate with proper schema (no UNIQUE on project_id)
            await conn.execute(text("""
                CREATE TABLE repo_analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    project_repository_id INTEGER REFERENCES project_repositories(id),
                    git_url VARCHAR(500) NOT NULL,
                    default_branch VARCHAR(100) DEFAULT 'main',
                    repo_technologies JSON,
                    all_contributors JSON,
                    total_commits INTEGER DEFAULT 0,
                    user_commits INTEGER DEFAULT 0,
                    first_commit_date DATETIME,
                    last_commit_date DATETIME,
                    lines_added INTEGER DEFAULT 0,
                    lines_deleted INTEGER DEFAULT 0,
                    files_changed INTEGER DEFAULT 0,
                    languages JSON,
                    primary_language VARCHAR(50),
                    detected_technologies JSON,
                    package_files JSON,
                    commit_messages_summary TEXT,
                    commit_categories JSON,
                    key_tasks JSON,
                    architecture_patterns JSON,
                    code_quality_metrics JSON,
                    implementation_details JSON,
                    development_timeline JSON,
                    tech_stack_versions JSON,
                    detailed_achievements JSON,
                    ai_summary TEXT,
                    ai_key_features JSON,
                    user_code_contributions JSON,
                    suggested_contribution_percent INTEGER,
                    analysis_language VARCHAR(10) DEFAULT 'ko',
                    analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    analysis_version VARCHAR(20) DEFAULT '1.0',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            # Copy data back
            await conn.execute(text("""
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
                    suggested_contribution_percent, analysis_language,
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
                    suggested_contribution_percent, analysis_language,
                    analyzed_at, analysis_version, created_at, updated_at
                FROM repo_analyses_new
            """))
            await conn.execute(text("DROP TABLE repo_analyses_new"))
            # Recreate indexes
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_repo_analyses_project_id
                ON repo_analyses (project_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_repo_analyses_project_repository_id
                ON repo_analyses (project_repository_id)
            """))
            logger.info("Recreated repo_analyses table without UNIQUE constraint")
        else:
            logger.info("No UNIQUE constraint on project_id found, skipping table recreation")

    # 4. Migrate existing data: projects.git_url -> project_repositories
    async with AsyncSessionLocal() as session:
        # Find projects with git_url but no corresponding project_repository
        result = await session.execute(text("""
            SELECT p.id, p.git_url
            FROM projects p
            WHERE p.git_url IS NOT NULL
              AND p.git_url != ''
              AND NOT EXISTS (
                  SELECT 1 FROM project_repositories pr
                  WHERE pr.project_id = p.id
              )
        """))
        rows = result.fetchall()

        if rows:
            logger.info("Migrating %d projects to project_repositories", len(rows))
            for project_id, git_url in rows:
                await session.execute(text("""
                    INSERT INTO project_repositories (project_id, git_url, is_primary, display_order)
                    VALUES (:project_id, :git_url, 1, 0)
                """), {"project_id": project_id, "git_url": git_url})
            await session.commit()

            # 5. Link existing repo_analyses to their project_repositories
            await session.execute(text("""
                UPDATE repo_analyses
                SET project_repository_id = (
                    SELECT pr.id
                    FROM project_repositories pr
                    WHERE pr.project_id = repo_analyses.project_id
                      AND pr.is_primary = 1
                    LIMIT 1
                )
                WHERE project_repository_id IS NULL
            """))
            await session.commit()
            logger.info("Linked existing repo_analyses to project_repositories")
        else:
            logger.info("No projects to migrate (already migrated or no git_url)")

    logger.info("=== Multi-repo migration completed ===")


if __name__ == "__main__":
    asyncio.run(run_migration())
