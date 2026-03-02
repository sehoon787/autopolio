"""
Analysis Workflow Service - Shared analysis phases for sync and background analysis.

This module extracts common analysis logic to reduce code duplication between:
- github.py router's /analyze endpoint (synchronous)
- analysis_job_service.py's run_background_analysis (background)

Each phase is a standalone function that can be called independently,
enabling flexible composition of analysis workflows.
"""

import logging
from typing import Optional, Dict, Any, List, TYPE_CHECKING
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.models.user import User
from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from api.services.core import EncryptionService
from api.constants import ProjectType, SummaryStyle
from .role_service import RoleService

if TYPE_CHECKING:
    from api.services.github import GitHubService
    from api.services.achievement import AchievementService


def _get_github_service(token: str) -> "GitHubService":
    """Lazy import GitHubService to avoid circular imports."""
    from api.services.github import GitHubService

    return GitHubService(token)


def _get_achievement_service(
    llm_provider: Optional[str] = None,
) -> "AchievementService":
    """Lazy import AchievementService to avoid circular imports."""
    from api.services.achievement import AchievementService

    return AchievementService(llm_provider=llm_provider)


logger = logging.getLogger(__name__)


@dataclass
class AnalysisContext:
    """Context object holding state across analysis phases."""

    # User info
    user_id: int
    github_token: str
    github_username: str

    # Project info
    project_id: Optional[int] = None
    git_url: str = ""
    project_repository_id: Optional[int] = (
        None  # Which ProjectRepository we're analyzing
    )

    # Analysis settings
    language: str = "ko"
    summary_style: str = SummaryStyle.PROFESSIONAL

    # Services (initialized lazily)
    github_service: Optional["GitHubService"] = None
    llm_service: Any = None

    # Results
    analysis_result: Dict[str, Any] = field(default_factory=dict)
    analysis_id: Optional[int] = None
    total_tokens: int = 0
    used_provider: Optional[str] = None

    # LLM results
    key_tasks: Optional[List[str]] = None
    detailed_content: Optional[Dict[str, Any]] = None
    ai_summary: Optional[str] = None
    ai_key_features: Optional[List[str]] = None
    user_code_contributions: Optional[Dict[str, Any]] = None

    # Context from previous edits
    existing_edits: Optional[Any] = None

    # User's decrypted LLM API keys (provider -> key)
    user_api_keys: Dict[str, str] = field(default_factory=dict)


class AnalysisWorkflowError(Exception):
    """Base exception for analysis workflow errors."""

    def __init__(self, message: str, phase: str):
        self.message = message
        self.phase = phase
        super().__init__(f"[{phase}] {message}")


async def phase1_validate_user(
    db: AsyncSession,
    user_id: int,
    project_id: Optional[int] = None,
    language: Optional[str] = None,
) -> AnalysisContext:
    """
    Phase 1: Validate user and gather initial context.

    Returns an AnalysisContext with validated user info and settings.
    """
    encryption = EncryptionService()

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise AnalysisWorkflowError(
            "GitHub is not connected. Please connect GitHub first.", "validate_user"
        )

    try:
        token = encryption.decrypt(user.github_token_encrypted)
        github_username = user.github_username
    except Exception:
        raise AnalysisWorkflowError(
            "GitHub token is corrupted. Please reconnect.", "validate_user"
        )

    # Determine language
    analysis_language = language or getattr(user, "preferred_language", "ko") or "ko"

    # Extract user's decrypted LLM API keys
    user_api_keys: Dict[str, str] = {}
    for provider_name in ("openai", "anthropic", "gemini"):
        key_attr = f"{provider_name}_api_key_encrypted"
        encrypted = getattr(user, key_attr, None)
        if encrypted:
            try:
                user_api_keys[provider_name] = encryption.decrypt(encrypted)
            except Exception:
                pass

    # Create context
    ctx = AnalysisContext(
        user_id=user_id,
        github_token=token,
        github_username=github_username,
        project_id=project_id,
        language=analysis_language,
        user_api_keys=user_api_keys,
    )

    # If project exists, get existing edits for context
    if project_id:
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project:
            raise AnalysisWorkflowError("Project not found", "validate_user")

        # Get existing analysis and user edits (use first for multi-repo compat)
        existing_analysis_result = await db.execute(
            select(RepoAnalysis)
            .where(RepoAnalysis.project_id == project_id)
            .order_by(RepoAnalysis.id.asc())
        )
        existing_analysis = existing_analysis_result.scalars().first()
        if existing_analysis:
            edits_result = await db.execute(
                select(RepoAnalysisEdits).where(
                    RepoAnalysisEdits.repo_analysis_id == existing_analysis.id
                )
            )
            ctx.existing_edits = edits_result.scalar_one_or_none()

    logger.info(
        "[Phase1] User validated, project_id=%s, language=%s",
        project_id,
        analysis_language,
    )
    return ctx


async def phase2_create_project_if_needed(
    db: AsyncSession, ctx: AnalysisContext, git_url: str
) -> int:
    """
    Phase 2: Create project if not exists.

    Returns project_id.
    """
    ctx.git_url = git_url

    if ctx.project_id:
        return ctx.project_id

    # Initialize GitHub service if needed
    if not ctx.github_service:
        ctx.github_service = _get_github_service(ctx.github_token)

    repo_info = await ctx.github_service.get_repo_info(git_url)

    project = Project(
        user_id=ctx.user_id,
        name=repo_info["name"],
        description=repo_info.get("description"),
        git_url=git_url,
        project_type=ProjectType.PERSONAL,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    ctx.project_id = project.id
    logger.info("[Phase2] Created project_id=%s", project.id)
    return project.id


async def phase3_run_github_analysis(ctx: AnalysisContext) -> Dict[str, Any]:
    """
    Phase 3: Run GitHub repository analysis.

    This is the main HTTP operation - no DB connection during this phase.
    Returns the raw analysis result.
    """
    if not ctx.github_service:
        ctx.github_service = _get_github_service(ctx.github_token)

    logger.info("[Phase3] Starting analyze_repository for %s", ctx.git_url)
    analysis_result = await ctx.github_service.analyze_repository(
        ctx.git_url, ctx.github_username
    )

    ctx.analysis_result = analysis_result
    logger.info(
        "[Phase3] Detected %d technologies",
        len(analysis_result.get("detected_technologies", [])),
    )
    return analysis_result


async def phase4_save_analysis(
    db: AsyncSession, ctx: AnalysisContext, llm_provider: Optional[str] = None
) -> int:
    """
    Phase 4: Save analysis results to database.

    - Updates or creates RepoAnalysis
    - Saves detected technologies
    - Auto-detects role
    - Auto-detects achievements

    Returns analysis_id.
    """
    # Re-fetch project
    proj_result = await db.execute(select(Project).where(Project.id == ctx.project_id))
    project = proj_result.scalar_one_or_none()

    # Check for existing analysis — match by project_repository_id if available,
    # otherwise fall back to project_id + git_url match
    analysis_result = ctx.analysis_result

    if ctx.project_repository_id:
        existing = await db.execute(
            select(RepoAnalysis).where(
                RepoAnalysis.project_repository_id == ctx.project_repository_id
            )
        )
    else:
        existing = await db.execute(
            select(RepoAnalysis).where(
                RepoAnalysis.project_id == ctx.project_id,
                RepoAnalysis.git_url == ctx.git_url,
            )
        )
    repo_analysis = existing.scalar_one_or_none()

    if repo_analysis:
        for key, value in analysis_result.items():
            if hasattr(repo_analysis, key):
                setattr(repo_analysis, key, value)
    else:
        repo_analysis = RepoAnalysis(
            project_id=ctx.project_id,
            project_repository_id=ctx.project_repository_id,
            git_url=ctx.git_url,
            **analysis_result,
        )
        db.add(repo_analysis)

    # Auto-detect role if not already set
    if not project.role:
        role_service = RoleService()
        detected_role, _ = role_service.detect_role(
            technologies=analysis_result.get("detected_technologies", []),
            commit_messages=analysis_result.get("commit_messages", [])[:100],
        )
        project.role = detected_role

    # Mark project as analyzed
    project.is_analyzed = 1
    project.git_url = ctx.git_url

    # Save detected technologies
    detected_techs = analysis_result.get("detected_technologies", [])
    if detected_techs:
        await db.execute(
            ProjectTechnology.__table__.delete().where(
                ProjectTechnology.project_id == ctx.project_id
            )
        )
        for tech_name in detected_techs:
            tech_result = await db.execute(
                select(Technology).where(Technology.name == tech_name)
            )
            tech = tech_result.scalar_one_or_none()
            if not tech:
                tech = Technology(name=tech_name)
                db.add(tech)
                await db.flush()
            project_tech = ProjectTechnology(
                project_id=ctx.project_id,
                technology_id=tech.id,
                is_primary=1
                if tech_name == analysis_result.get("primary_language")
                else 0,
            )
            db.add(project_tech)

    await db.flush()

    # Auto-detect achievements
    try:
        achievement_service = _get_achievement_service(llm_provider=llm_provider)
        await achievement_service.auto_detect_and_save_achievements(
            db, project, repo_analysis, language=ctx.language
        )
    except Exception as e:
        logger.warning("Failed to auto-detect achievements: %s", e)

    # Calculate suggested contribution percent
    try:
        if not ctx.github_service:
            ctx.github_service = _get_github_service(ctx.github_token)

        user_commits = repo_analysis.user_commits or 0
        total_commits = repo_analysis.total_commits or 0
        user_lines = repo_analysis.lines_added or 0
        total_lines = repo_analysis.lines_added or 0

        if total_commits > 0:
            suggested = ctx.github_service.calculate_contribution_percent(
                user_commits=user_commits,
                total_commits=total_commits,
                user_lines_added=user_lines,
                total_lines_added=total_lines,
                work_areas=None,
            )
            repo_analysis.suggested_contribution_percent = suggested
            logger.info("[Phase4] Suggested contribution: %d%%", suggested)
    except Exception as e:
        logger.warning("Failed to calculate suggested contribution: %s", e)

    await db.commit()
    await db.refresh(repo_analysis)

    ctx.analysis_id = repo_analysis.id
    logger.info("[Phase4] Analysis saved, id=%s", repo_analysis.id)
    return repo_analysis.id


# --- Phase 5-6 functions live in analysis_workflow_llm.py ---
# Re-export for backward compatibility (importers of this module get all phases)
