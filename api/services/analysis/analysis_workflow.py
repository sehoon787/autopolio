"""
Analysis Workflow Service - Shared analysis phases for sync and background analysis.

This module extracts common analysis logic to reduce code duplication between:
- github.py router's /analyze endpoint (synchronous)
- analysis_job_service.py's run_background_analysis (background)

Each phase is a standalone function that can be called independently,
enabling flexible composition of analysis workflows.
"""
import logging
from typing import Optional, Dict, Any, List, Tuple, TYPE_CHECKING
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.models.user import User
from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from api.services.core import EncryptionService
from .role_service import RoleService
from api.services.core.key_tasks_generator import generate_key_tasks as _generate_key_tasks

if TYPE_CHECKING:
    from api.services.github import GitHubService
    from api.services.achievement import AchievementService


def _get_github_service(token: str) -> "GitHubService":
    """Lazy import GitHubService to avoid circular imports."""
    from api.services.github import GitHubService
    return GitHubService(token)


def _get_achievement_service(llm_provider: Optional[str] = None) -> "AchievementService":
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
    
    # Analysis settings
    language: str = "ko"
    summary_style: str = "professional"
    
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
    language: Optional[str] = None
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
            "GitHub is not connected. Please connect GitHub first.",
            "validate_user"
        )
    
    try:
        token = encryption.decrypt(user.github_token_encrypted)
        github_username = user.github_username
    except Exception:
        raise AnalysisWorkflowError(
            "GitHub token is corrupted. Please reconnect.",
            "validate_user"
        )
    
    # Determine language
    analysis_language = language or getattr(user, 'preferred_language', 'ko') or 'ko'
    
    # Create context
    ctx = AnalysisContext(
        user_id=user_id,
        github_token=token,
        github_username=github_username,
        project_id=project_id,
        language=analysis_language,
    )
    
    # If project exists, get existing edits for context
    if project_id:
        proj_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = proj_result.scalar_one_or_none()
        if not project:
            raise AnalysisWorkflowError("Project not found", "validate_user")
        
        # Get existing analysis and user edits
        existing_analysis_result = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        )
        existing_analysis = existing_analysis_result.scalar_one_or_none()
        if existing_analysis:
            edits_result = await db.execute(
                select(RepoAnalysisEdits).where(
                    RepoAnalysisEdits.repo_analysis_id == existing_analysis.id
                )
            )
            ctx.existing_edits = edits_result.scalar_one_or_none()
    
    logger.info("[Phase1] User validated, project_id=%s, language=%s", 
                project_id, analysis_language)
    return ctx


async def phase2_create_project_if_needed(
    db: AsyncSession,
    ctx: AnalysisContext,
    git_url: str
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
        project_type="personal"
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
        ctx.git_url,
        ctx.github_username
    )
    
    ctx.analysis_result = analysis_result
    logger.info("[Phase3] Detected %d technologies", 
                len(analysis_result.get('detected_technologies', [])))
    return analysis_result


async def phase4_save_analysis(
    db: AsyncSession,
    ctx: AnalysisContext,
    llm_provider: Optional[str] = None
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
    proj_result = await db.execute(
        select(Project).where(Project.id == ctx.project_id)
    )
    project = proj_result.scalar_one_or_none()
    
    # Check for existing analysis
    existing = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == ctx.project_id)
    )
    repo_analysis = existing.scalar_one_or_none()
    
    analysis_result = ctx.analysis_result
    
    if repo_analysis:
        for key, value in analysis_result.items():
            if hasattr(repo_analysis, key):
                setattr(repo_analysis, key, value)
    else:
        repo_analysis = RepoAnalysis(
            project_id=ctx.project_id,
            git_url=ctx.git_url,
            **analysis_result
        )
        db.add(repo_analysis)
    
    # Auto-detect role if not already set
    if not project.role:
        role_service = RoleService()
        detected_role, _ = role_service.detect_role(
            technologies=analysis_result.get('detected_technologies', []),
            commit_messages=analysis_result.get('commit_messages', [])[:100],
        )
        project.role = detected_role
    
    # Mark project as analyzed
    project.is_analyzed = 1
    project.git_url = ctx.git_url
    
    # Save detected technologies
    detected_techs = analysis_result.get('detected_technologies', [])
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
                is_primary=1 if tech_name == analysis_result.get('primary_language') else 0
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
                work_areas=None
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


async def phase5_collect_code_contributions(ctx: AnalysisContext) -> Optional[Dict[str, Any]]:
    """
    Phase 5.1: Collect user code contributions for LLM context.
    
    Returns code contributions dict or None.
    """
    if not ctx.github_service:
        ctx.github_service = _get_github_service(ctx.github_token)
    
    try:
        logger.info("[Phase5.1] Collecting user code contributions")
        contributions = await ctx.github_service.get_user_code_contributions(
            ctx.git_url,
            ctx.github_username,
            max_commits=30,
            max_total_patch_size=50000  # ~50KB of code diffs
        )
        ctx.user_code_contributions = contributions
        logger.info("[Phase5.1] Collected %d commits with code diffs",
                   len(contributions.get("contributions", [])))
        return contributions
    except Exception as e:
        logger.warning("[Phase5.1] Failed to collect code contributions: %s", e)
        return None


async def phase5_generate_key_tasks(
    ctx: AnalysisContext,
    project_name: str,
    project_description: Optional[str],
    project_role: Optional[str]
) -> Optional[List[str]]:
    """
    Phase 5.2: Generate key tasks using LLM.
    
    Returns list of key tasks or None.
    """
    if not ctx.llm_service:
        return None
    
    try:
        logger.info("[Phase5.2] Generating key tasks with %s, language=%s",
                   type(ctx.llm_service).__name__, ctx.language)
        
        # Create minimal objects for _generate_key_tasks
        class MinimalProject:
            def __init__(self):
                self.name = project_name
                self.description = project_description
                self.role = project_role
        
        class MinimalAnalysis:
            def __init__(self):
                self.detected_technologies = ctx.analysis_result.get('detected_technologies', [])
                self.commit_messages_summary = ctx.analysis_result.get('commit_messages_summary')
                self.commit_categories = ctx.analysis_result.get('commit_categories')
                self.total_commits = ctx.analysis_result.get('total_commits', 0)
                self.lines_added = ctx.analysis_result.get('lines_added', 0)
        
        # Get user context from previous edits
        key_tasks_user_context = None
        if ctx.existing_edits and ctx.existing_edits.key_tasks_modified and ctx.existing_edits.key_tasks:
            import json
            key_tasks_user_context = json.dumps(ctx.existing_edits.key_tasks, ensure_ascii=False)
            logger.info("[Phase5.2] Using user's previous key_tasks edits as context")
        
        key_tasks, tokens = await _generate_key_tasks(
            MinimalProject(), MinimalAnalysis(), ctx.llm_service,
            language=ctx.language,
            user_context=key_tasks_user_context,
            code_contributions=ctx.user_code_contributions
        )
        ctx.key_tasks = key_tasks
        ctx.total_tokens += tokens
        return key_tasks
    except Exception as e:
        import traceback
        logger.warning("[Phase5.2] Failed to generate key tasks: %s: %s", type(e).__name__, e)
        logger.debug("[Phase5.2] Traceback: %s", traceback.format_exc())
        return None


async def phase5_generate_detailed_content(
    ctx: AnalysisContext,
    project_data: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Phase 5.3: Generate detailed content using LLM.
    
    Returns detailed content dict or None.
    """
    if not ctx.llm_service or not ctx.github_service:
        return None
    
    try:
        analysis_data = {
            "commit_messages_summary": ctx.analysis_result.get('commit_messages_summary'),
            "detected_technologies": ctx.analysis_result.get('detected_technologies', []),
            "commit_categories": ctx.analysis_result.get('commit_categories'),
            "total_commits": ctx.analysis_result.get('total_commits', 0),
            "lines_added": ctx.analysis_result.get('lines_added', 0),
            "lines_deleted": ctx.analysis_result.get('lines_deleted', 0),
            "files_changed": ctx.analysis_result.get('files_changed', 0),
        }
        
        detailed_content, content_tokens = await ctx.github_service.generate_detailed_content(
            project_data=project_data,
            analysis_data=analysis_data,
            llm_service=ctx.llm_service,
            language=ctx.language,
            code_contributions=ctx.user_code_contributions
        )
        ctx.detailed_content = detailed_content
        ctx.total_tokens += content_tokens
        return detailed_content
    except Exception as e:
        logger.warning("[Phase5.3] Failed to generate detailed content: %s", e)
        return None


async def phase5_generate_ai_summary(
    ctx: AnalysisContext,
    project_data: Dict[str, Any]
) -> Tuple[Optional[str], Optional[List[str]]]:
    """
    Phase 5.4: Generate AI summary using LLM.
    
    Returns (ai_summary, ai_key_features) tuple.
    """
    if not ctx.llm_service:
        return None, None
    
    try:
        logger.info("[Phase5.4] Generating AI summary")
        
        # Add code contributions summary for better context
        if ctx.user_code_contributions:
            project_data["code_contributions_summary"] = {
                "analyzed_commits": ctx.user_code_contributions.get("summary", {}).get("analyzed_commits", 0),
                "lines_added": ctx.user_code_contributions.get("summary", {}).get("lines_added", 0),
                "work_areas": ctx.user_code_contributions.get("work_areas", []),
            }
        
        summary_result = await ctx.llm_service.generate_project_summary(
            project_data,
            style=ctx.summary_style,
            language=ctx.language
        )
        
        if summary_result:
            ctx.ai_summary = summary_result.get("summary", "")
            ctx.ai_key_features = summary_result.get("key_features", [])
            if hasattr(ctx.llm_service, 'total_tokens_used'):
                ctx.total_tokens += ctx.llm_service.total_tokens_used
            logger.info("[Phase5.4] AI summary generated successfully")
            return ctx.ai_summary, ctx.ai_key_features
        
        return None, None
    except Exception as e:
        logger.warning("[Phase5.4] Failed to generate AI summary: %s", e)
        return None, None


async def phase5_save_llm_results(
    db: AsyncSession,
    ctx: AnalysisContext
) -> None:
    """
    Phase 5.5: Save LLM-generated content to database.
    """
    analysis_result_db = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.id == ctx.analysis_id)
    )
    repo_analysis = analysis_result_db.scalar_one_or_none()
    
    if not repo_analysis:
        logger.warning("[Phase5.5] RepoAnalysis not found: %s", ctx.analysis_id)
        return
    
    if ctx.key_tasks:
        repo_analysis.key_tasks = ctx.key_tasks
    
    if ctx.detailed_content:
        if ctx.detailed_content.get("implementation_details"):
            repo_analysis.implementation_details = ctx.detailed_content["implementation_details"]
        if ctx.detailed_content.get("development_timeline"):
            repo_analysis.development_timeline = ctx.detailed_content["development_timeline"]
        if ctx.detailed_content.get("detailed_achievements"):
            repo_analysis.detailed_achievements = ctx.detailed_content["detailed_achievements"]
    
    if ctx.ai_summary:
        repo_analysis.ai_summary = ctx.ai_summary
    if ctx.ai_key_features:
        repo_analysis.ai_key_features = ctx.ai_key_features
    
    if ctx.user_code_contributions:
        repo_analysis.user_code_contributions = {
            "summary": ctx.user_code_contributions.get("summary", {}),
            "technologies": ctx.user_code_contributions.get("technologies", []),
            "work_areas": ctx.user_code_contributions.get("work_areas", []),
        }
    
    repo_analysis.analysis_language = ctx.language
    
    await db.commit()
    
    # Also copy ai_summary to Project for report_service compatibility
    if ctx.ai_summary or ctx.ai_key_features:
        proj_result = await db.execute(
            select(Project).where(Project.id == ctx.project_id)
        )
        project = proj_result.scalar_one_or_none()
        if project:
            if ctx.ai_summary:
                project.ai_summary = ctx.ai_summary
            if ctx.ai_key_features:
                project.ai_key_features = ctx.ai_key_features
            await db.commit()
            logger.info("[Phase5.5] Copied ai_summary to Project %d", ctx.project_id)
    
    logger.info("[Phase5.5] LLM content saved, language=%s", ctx.language)


async def phase6_extract_tech_versions(
    db: AsyncSession,
    ctx: AnalysisContext
) -> Optional[Dict[str, List[str]]]:
    """
    Phase 6: Extract technology versions from repository.
    
    Returns tech versions dict or None.
    """
    if not ctx.github_service:
        ctx.github_service = _get_github_service(ctx.github_token)
    
    try:
        tech_versions = await ctx.github_service.extract_tech_versions(ctx.git_url)
        if tech_versions:
            analysis_result_db = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.id == ctx.analysis_id)
            )
            repo_analysis = analysis_result_db.scalar_one_or_none()
            if repo_analysis:
                repo_analysis.tech_stack_versions = tech_versions
                await db.commit()
        return tech_versions
    except Exception as e:
        logger.warning("[Phase6] Failed to extract tech versions: %s", e)
        return None
