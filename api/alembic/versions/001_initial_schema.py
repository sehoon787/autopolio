"""Initial schema — all tables from models

Revision ID: 001
Revises:
Create Date: 2026-02-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), unique=True),
        sa.Column("github_username", sa.String(100), unique=True),
        sa.Column("github_token_encrypted", sa.Text()),
        sa.Column("github_avatar_url", sa.String(500)),
        sa.Column("display_name", sa.String(100)),
        sa.Column("profile_email", sa.String(255)),
        sa.Column("phone", sa.String(50)),
        sa.Column("address", sa.String(500)),
        sa.Column("birthdate", sa.Date()),
        sa.Column("profile_photo_url", sa.String(500)),
        sa.Column("preferred_llm", sa.String(50), server_default="openai"),
        sa.Column("preferred_language", sa.String(10), server_default="ko"),
        sa.Column(
            "default_summary_style", sa.String(50), server_default="professional"
        ),
        sa.Column("default_output_format", sa.String(10), server_default="docx"),
        sa.Column("default_include_achievements", sa.String(5), server_default="true"),
        sa.Column("default_include_tech_stack", sa.String(5), server_default="true"),
        sa.Column("default_skip_llm_summary", sa.String(5), server_default="false"),
        sa.Column("default_regenerate_summaries", sa.String(5), server_default="false"),
        sa.Column("openai_model", sa.String(100), server_default="gpt-4-turbo-preview"),
        sa.Column(
            "anthropic_model",
            sa.String(100),
            server_default="claude-3-5-sonnet-20241022",
        ),
        sa.Column("gemini_model", sa.String(100), server_default="gemini-2.0-flash"),
        sa.Column("openai_api_key_encrypted", sa.Text()),
        sa.Column("anthropic_api_key_encrypted", sa.Text()),
        sa.Column("gemini_api_key_encrypted", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index(
        "ix_users_github_username", "users", ["github_username"], unique=True
    )

    # --- oauth_identities ---
    op.create_table(
        "oauth_identities",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("provider_user_id", sa.String(255), nullable=False),
        sa.Column("username", sa.String(255)),
        sa.Column("email", sa.String(255)),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("access_token_encrypted", sa.Text()),
        sa.Column("refresh_token_encrypted", sa.Text()),
        sa.Column("token_expires_at", sa.DateTime()),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("raw_data", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime()),
        sa.UniqueConstraint(
            "provider", "provider_user_id", name="uq_oauth_provider_user"
        ),
    )
    op.create_index("ix_oauth_identities_user_id", "oauth_identities", ["user_id"])
    op.create_index(
        "ix_oauth_user_provider", "oauth_identities", ["user_id", "provider"]
    )

    # --- companies ---
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("position", sa.String(200)),
        sa.Column("department", sa.String(200)),
        sa.Column("employment_type", sa.String(50)),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("is_current", sa.Integer(), server_default=sa.text("0")),
        sa.Column("description", sa.Text()),
        sa.Column("location", sa.String(200)),
        sa.Column("company_url", sa.String(500)),
        sa.Column("logo_path", sa.String(500)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_companies_id", "companies", ["id"])

    # --- technologies ---
    op.create_table(
        "technologies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("category", sa.String(50)),
        sa.Column("icon", sa.String(200)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_technologies_id", "technologies", ["id"])

    # --- projects ---
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "company_id",
            sa.Integer(),
            sa.ForeignKey("companies.id"),
            nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_description", sa.String(500)),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("team_size", sa.Integer()),
        sa.Column("role", sa.String(200)),
        sa.Column("contribution_percent", sa.Integer()),
        sa.Column("git_url", sa.String(500)),
        sa.Column("is_analyzed", sa.Integer(), server_default=sa.text("0")),
        sa.Column("project_type", sa.String(50)),
        sa.Column("status", sa.String(50)),
        sa.Column("links", sa.JSON()),
        sa.Column("images", sa.JSON()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("ai_key_features", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_projects_id", "projects", ["id"])
    op.create_index("ix_projects_user_id", "projects", ["user_id"])
    op.create_index("ix_projects_company_id", "projects", ["company_id"])
    op.create_index("ix_projects_is_analyzed", "projects", ["is_analyzed"])

    # --- project_technologies ---
    op.create_table(
        "project_technologies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "technology_id",
            sa.Integer(),
            sa.ForeignKey("technologies.id"),
            nullable=False,
        ),
        sa.Column("is_primary", sa.Integer(), server_default=sa.text("0")),
    )
    op.create_index("ix_project_technologies_id", "project_technologies", ["id"])
    op.create_index(
        "ix_project_technologies_project_id", "project_technologies", ["project_id"]
    )
    op.create_index(
        "ix_project_technologies_technology_id",
        "project_technologies",
        ["technology_id"],
    )
    op.create_index(
        "ix_project_technologies_project_tech",
        "project_technologies",
        ["project_id", "technology_id"],
    )

    # --- project_repositories ---
    op.create_table(
        "project_repositories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("git_url", sa.String(500), nullable=False),
        sa.Column("label", sa.String(100)),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("is_primary", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_project_repositories_id", "project_repositories", ["id"])
    op.create_index(
        "ix_project_repositories_project_id",
        "project_repositories",
        ["project_id"],
    )

    # --- project_achievements ---
    op.create_table(
        "project_achievements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("metric_name", sa.String(200), nullable=False),
        sa.Column("metric_value", sa.String(100)),
        sa.Column("description", sa.Text()),
        sa.Column("before_value", sa.String(200)),
        sa.Column("after_value", sa.String(200)),
        sa.Column("category", sa.String(50)),
        sa.Column("evidence", sa.Text()),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_project_achievements_id", "project_achievements", ["id"])
    op.create_index(
        "ix_project_achievements_project_id",
        "project_achievements",
        ["project_id"],
    )

    # --- repo_analyses ---
    op.create_table(
        "repo_analyses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "project_repository_id",
            sa.Integer(),
            sa.ForeignKey("project_repositories.id"),
            nullable=True,
        ),
        sa.Column("git_url", sa.String(500), nullable=False),
        sa.Column("default_branch", sa.String(100), server_default="main"),
        sa.Column("repo_technologies", sa.JSON()),
        sa.Column("all_contributors", sa.JSON()),
        sa.Column("total_commits", sa.Integer(), server_default=sa.text("0")),
        sa.Column("user_commits", sa.Integer(), server_default=sa.text("0")),
        sa.Column("first_commit_date", sa.DateTime()),
        sa.Column("last_commit_date", sa.DateTime()),
        sa.Column("lines_added", sa.Integer(), server_default=sa.text("0")),
        sa.Column("lines_deleted", sa.Integer(), server_default=sa.text("0")),
        sa.Column("files_changed", sa.Integer(), server_default=sa.text("0")),
        sa.Column("languages", sa.JSON()),
        sa.Column("primary_language", sa.String(50)),
        sa.Column("detected_technologies", sa.JSON()),
        sa.Column("package_files", sa.JSON()),
        sa.Column("commit_messages_summary", sa.Text()),
        sa.Column("commit_categories", sa.JSON()),
        sa.Column("key_tasks", sa.JSON()),
        sa.Column("architecture_patterns", sa.JSON()),
        sa.Column("code_quality_metrics", sa.JSON()),
        sa.Column("implementation_details", sa.JSON()),
        sa.Column("development_timeline", sa.JSON()),
        sa.Column("tech_stack_versions", sa.JSON()),
        sa.Column("detailed_achievements", sa.JSON()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("ai_key_features", sa.JSON()),
        sa.Column("user_code_contributions", sa.JSON()),
        sa.Column("suggested_contribution_percent", sa.Integer()),
        sa.Column("ai_tools_detected", sa.JSON()),
        sa.Column("analysis_language", sa.String(10), server_default="ko"),
        sa.Column("analyzed_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("analysis_version", sa.String(20), server_default="1.0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_repo_analyses_id", "repo_analyses", ["id"])
    op.create_index("ix_repo_analyses_project_id", "repo_analyses", ["project_id"])
    op.create_index(
        "ix_repo_analyses_project_repository_id",
        "repo_analyses",
        ["project_repository_id"],
    )

    # --- repo_analysis_edits ---
    op.create_table(
        "repo_analysis_edits",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "repo_analysis_id",
            sa.Integer(),
            sa.ForeignKey("repo_analyses.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("key_tasks", sa.JSON()),
        sa.Column("implementation_details", sa.JSON()),
        sa.Column("detailed_achievements", sa.JSON()),
        sa.Column("key_tasks_modified", sa.Boolean(), server_default=sa.text("false")),
        sa.Column(
            "implementation_details_modified",
            sa.Boolean(),
            server_default=sa.text("false"),
        ),
        sa.Column(
            "detailed_achievements_modified",
            sa.Boolean(),
            server_default=sa.text("false"),
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_repo_analysis_edits_id", "repo_analysis_edits", ["id"])

    # --- contributor_analyses ---
    op.create_table(
        "contributor_analyses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "repo_analysis_id",
            sa.Integer(),
            sa.ForeignKey("repo_analyses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("total_commits", sa.Integer(), server_default=sa.text("0")),
        sa.Column("first_commit_date", sa.DateTime()),
        sa.Column("last_commit_date", sa.DateTime()),
        sa.Column("lines_added", sa.Integer(), server_default=sa.text("0")),
        sa.Column("lines_deleted", sa.Integer(), server_default=sa.text("0")),
        sa.Column("file_extensions", sa.JSON()),
        sa.Column("work_areas", sa.JSON()),
        sa.Column("detected_technologies", sa.JSON()),
        sa.Column("detailed_commits", sa.JSON()),
        sa.Column("commit_types", sa.JSON()),
        sa.Column("analyzed_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_contributor_analyses_id", "contributor_analyses", ["id"])
    op.create_index(
        "ix_contributor_analyses_repo_analysis_id",
        "contributor_analyses",
        ["repo_analysis_id"],
    )
    op.create_index(
        "ix_contributor_analyses_username", "contributor_analyses", ["username"]
    )
    op.create_index(
        "ix_contributor_repo_username",
        "contributor_analyses",
        ["repo_analysis_id", "username"],
    )

    # --- templates ---
    op.create_table(
        "templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("platform", sa.String(50)),
        sa.Column("is_system", sa.Integer(), server_default=sa.text("0")),
        sa.Column("output_format", sa.String(20), server_default="docx"),
        sa.Column("template_content", sa.Text()),
        sa.Column("template_file_path", sa.String(500)),
        sa.Column("field_mappings", sa.JSON()),
        sa.Column("sections", sa.JSON()),
        sa.Column("style_settings", sa.JSON()),
        sa.Column("max_projects", sa.Integer()),
        sa.Column("max_characters", sa.Integer()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_templates_id", "templates", ["id"])

    # --- platform_templates ---
    op.create_table(
        "platform_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("platform_key", sa.String(50), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("page_url", sa.String(500)),
        sa.Column("html_content", sa.Text()),
        sa.Column("css_content", sa.Text()),
        sa.Column("original_html", sa.Text()),
        sa.Column("screenshot_path", sa.String(500)),
        sa.Column("field_mappings", sa.JSON()),
        sa.Column("selectors", sa.JSON()),
        sa.Column("is_system", sa.Integer(), server_default=sa.text("0")),
        sa.Column("requires_login", sa.Integer(), server_default=sa.text("0")),
        sa.Column("scrape_status", sa.String(20)),
        sa.Column("platform_color", sa.String(20)),
        sa.Column("platform_logo_url", sa.String(500)),
        sa.Column("features", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_platform_templates_id", "platform_templates", ["id"])

    # --- jobs (before generated_documents, which references jobs.id) ---
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(36), unique=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "target_project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id"),
            nullable=True,
        ),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("progress", sa.Integer(), server_default=sa.text("0")),
        sa.Column("current_step", sa.Integer(), server_default=sa.text("0")),
        sa.Column("total_steps", sa.Integer(), server_default=sa.text("6")),
        sa.Column("step_name", sa.String(100)),
        sa.Column("step_results", sa.JSON()),
        sa.Column("partial_results", sa.JSON()),
        sa.Column("input_data", sa.JSON()),
        sa.Column("output_data", sa.JSON()),
        sa.Column("error_message", sa.Text()),
        sa.Column("error_details", sa.JSON()),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("completed_at", sa.DateTime()),
        sa.Column("estimated_completion", sa.DateTime()),
        sa.Column("job_metadata", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_jobs_id", "jobs", ["id"])
    op.create_index("ix_jobs_task_id", "jobs", ["task_id"], unique=True)
    op.create_index("ix_jobs_target_project_id", "jobs", ["target_project_id"])

    # --- generated_documents ---
    op.create_table(
        "generated_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            sa.Integer(),
            sa.ForeignKey("templates.id"),
            nullable=True,
        ),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=True),
        sa.Column("document_name", sa.String(300), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_format", sa.String(20)),
        sa.Column("file_size", sa.Integer()),
        sa.Column("included_projects", sa.JSON()),
        sa.Column("included_companies", sa.JSON()),
        sa.Column("generation_settings", sa.JSON()),
        sa.Column("version", sa.Integer(), server_default=sa.text("1")),
        sa.Column(
            "parent_document_id",
            sa.Integer(),
            sa.ForeignKey("generated_documents.id"),
            nullable=True,
        ),
        sa.Column("status", sa.String(50), server_default="completed"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_generated_documents_id", "generated_documents", ["id"])

    # --- certifications ---
    op.create_table(
        "certifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("issuer", sa.String(200)),
        sa.Column("issue_date", sa.Date()),
        sa.Column("expiry_date", sa.Date()),
        sa.Column("credential_id", sa.String(100)),
        sa.Column("credential_url", sa.String(500)),
        sa.Column("description", sa.Text()),
        sa.Column("attachment_path", sa.String(500)),
        sa.Column("attachment_name", sa.String(300)),
        sa.Column("attachment_size", sa.Integer()),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_certifications_id", "certifications", ["id"])
    op.create_index("ix_certifications_user_id", "certifications", ["user_id"])

    # --- awards ---
    op.create_table(
        "awards",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("issuer", sa.String(200)),
        sa.Column("award_date", sa.Date()),
        sa.Column("description", sa.Text()),
        sa.Column("award_url", sa.String(500)),
        sa.Column("attachment_path", sa.String(500)),
        sa.Column("attachment_name", sa.String(300)),
        sa.Column("attachment_size", sa.Integer()),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_awards_id", "awards", ["id"])
    op.create_index("ix_awards_user_id", "awards", ["user_id"])

    # --- educations ---
    op.create_table(
        "educations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("school_name", sa.String(200), nullable=False),
        sa.Column("major", sa.String(200)),
        sa.Column("degree", sa.String(50)),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("is_current", sa.Integer(), server_default=sa.text("0")),
        sa.Column("graduation_status", sa.String(20)),
        sa.Column("gpa", sa.String(20)),
        sa.Column("description", sa.Text()),
        sa.Column("school_country", sa.String(100)),
        sa.Column("school_country_code", sa.String(10)),
        sa.Column("school_state", sa.String(100)),
        sa.Column("school_domain", sa.String(200)),
        sa.Column("school_web_page", sa.String(500)),
        sa.Column("attachment_path", sa.String(500)),
        sa.Column("attachment_name", sa.String(300)),
        sa.Column("attachment_size", sa.Integer()),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_educations_id", "educations", ["id"])
    op.create_index("ix_educations_user_id", "educations", ["user_id"])

    # --- publications ---
    op.create_table(
        "publications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("authors", sa.String(500)),
        sa.Column("publication_type", sa.String(50)),
        sa.Column("publisher", sa.String(200)),
        sa.Column("publication_date", sa.String(100)),
        sa.Column("doi", sa.String(200)),
        sa.Column("url", sa.String(500)),
        sa.Column("description", sa.Text()),
        sa.Column("attachment_path", sa.String(500)),
        sa.Column("attachment_name", sa.String(300)),
        sa.Column("attachment_size", sa.Integer()),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_publications_id", "publications", ["id"])
    op.create_index("ix_publications_user_id", "publications", ["user_id"])

    # --- volunteer_activities ---
    op.create_table(
        "volunteer_activities",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("organization", sa.String(200)),
        sa.Column("activity_type", sa.String(50)),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("is_current", sa.Integer(), server_default=sa.text("0")),
        sa.Column("hours", sa.Integer()),
        sa.Column("role", sa.String(100)),
        sa.Column("description", sa.Text()),
        sa.Column("certificate_url", sa.String(500)),
        sa.Column("attachment_path", sa.String(500)),
        sa.Column("attachment_name", sa.String(300)),
        sa.Column("attachment_size", sa.Integer()),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_volunteer_activities_id", "volunteer_activities", ["id"])
    op.create_index(
        "ix_volunteer_activities_user_id", "volunteer_activities", ["user_id"]
    )


def downgrade() -> None:
    op.drop_table("volunteer_activities")
    op.drop_table("publications")
    op.drop_table("educations")
    op.drop_table("awards")
    op.drop_table("certifications")
    op.drop_table("generated_documents")
    op.drop_table("jobs")
    op.drop_table("platform_templates")
    op.drop_table("templates")
    op.drop_table("contributor_analyses")
    op.drop_table("repo_analysis_edits")
    op.drop_table("repo_analyses")
    op.drop_table("project_achievements")
    op.drop_table("project_repositories")
    op.drop_table("project_technologies")
    op.drop_table("projects")
    op.drop_table("technologies")
    op.drop_table("companies")
    op.drop_table("oauth_identities")
    op.drop_table("users")
