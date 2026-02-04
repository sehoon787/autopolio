import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Tuple, List, Dict, Any
from urllib.parse import quote
import httpx

from api.database import get_db

logger = logging.getLogger(__name__)
from api.config import get_settings
from api.models.user import User
from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from api.schemas.github import (
    GitHubConnectRequest, GitHubCallbackResponse,
    RepoAnalysisRequest, RepoAnalysisResponse,
    GitHubRepoListResponse, GitHubRepoInfo,
    ImportReposRequest, ImportReposResponse, ImportRepoResult,
    BatchAnalysisRequest, BatchAnalysisResponse, BatchAnalysisResult,
    AnalysisContentUpdate, EffectiveAnalysisResponse, EditStatus,
    # Extended analysis schemas (v1.10)
    ContributorAnalysisResponse, ContributorsListResponse, ContributorSummary,
    CodeQualityMetrics, DetailedCommit, ExtendedRepoAnalysisResponse,
    # Background analysis schemas (v1.12)
    AnalysisJobStatus, AnalysisJobListResponse, StartAnalysisResponse, CancelAnalysisResponse,
)
from api.services.github_service import (
    GitHubService,
    GitHubServiceError,
    GitHubRateLimitError,
    GitHubNotFoundError,
    GitHubTimeoutError,
    GitHubAuthError,
)
from api.services.encryption_service import EncryptionService
from api.services.role_service import RoleService
from api.services.achievement_service import AchievementService
from api.services.analysis_job_service import AnalysisJobService, run_background_analysis
from api.models.achievement import ProjectAchievement
from api.models.contributor_analysis import ContributorAnalysis
from api.models.job import Job

router = APIRouter()
settings = get_settings()
encryption = EncryptionService()


async def _auto_detect_achievements(
    db: AsyncSession,
    project: Project,
    repo_analysis: RepoAnalysis,
    language: str = "ko"
) -> int:
    """
    Auto-detect achievements from analysis data and save to DB.
    Returns the number of saved achievements.

    Args:
        language: Output language ("ko" for Korean, "en" for English)
    """
    # Build project data for achievement detection
    project_data = {
        "name": project.name,
        "description": project.description or "",
        "role": project.role or "",
        "total_commits": repo_analysis.total_commits or 0,
        "lines_added": repo_analysis.lines_added or 0,
        "lines_deleted": repo_analysis.lines_deleted or 0,
        "files_changed": repo_analysis.files_changed or 0,
        "commit_categories": repo_analysis.commit_categories or {},
    }

    # Get commit messages from summary
    commit_messages = []
    if repo_analysis.commit_messages_summary:
        commit_messages = repo_analysis.commit_messages_summary.split("\n")

    # Detect achievements using pattern matching (no LLM for speed)
    service = AchievementService(llm_provider=None)
    achievements, stats = await service.detect_all(
        project_data=project_data,
        commit_messages=commit_messages,
        use_llm=False,
        language=language
    )

    if not achievements:
        return 0

    # Delete existing achievements to avoid language mixing
    # (re-analysis should replace all achievements with current language)
    await db.execute(
        ProjectAchievement.__table__.delete().where(
            ProjectAchievement.project_id == project.id
        )
    )

    # Save new achievements
    saved_count = 0
    for achievement in achievements:
        new_achievement = ProjectAchievement(
            project_id=project.id,
            metric_name=achievement.get("metric_name", ""),
            metric_value=achievement.get("metric_value", ""),
            description=achievement.get("description"),
            category=achievement.get("category"),
            evidence=achievement.get("evidence"),
            display_order=achievement.get("display_order", saved_count),
        )
        db.add(new_achievement)
        saved_count += 1
        existing_names.add(achievement.get("metric_name"))

    return saved_count


async def _generate_key_tasks(
    project: Project,
    repo_analysis: RepoAnalysis,
    llm_service=None,
    cli_mode: str = None,
    cli_model: str = None,
    language: str = "ko",
    user_context: Optional[str] = None,
    code_contributions: Optional[Dict[str, Any]] = None
) -> Tuple[List[str], int]:
    """
    Generate key tasks using LLM based on project analysis.
    Returns a tuple of (list of key tasks, token count).
    Supports both API mode (LLMService) and CLI mode (CLILLMService).

    Args:
        project: Project model
        repo_analysis: Repository analysis model
        llm_service: Optional pre-initialized LLM service
        cli_mode: CLI mode ("claude_code" or "gemini_cli")
        cli_model: CLI model name
        language: Output language ("ko" or "en")
        user_context: Optional user-edited content to reference for re-analysis
        code_contributions: Optional user's code contributions with patches for context
    """
    from api.services.llm_service import LLMService
    from api.services.cli_llm_service import CLILLMService

    try:
        if llm_service is None:
            if cli_mode:
                logger.info("[KeyTasks] Using CLI mode: %s, model: %s", cli_mode, cli_model)
                llm_service = CLILLMService(cli_mode, model=cli_model)
            else:
                llm_service = LLMService()

        logger.debug("[KeyTasks] LLM service type: %s, language: %s", type(llm_service).__name__, language)
        if hasattr(llm_service, 'provider_name'):
            logger.debug("[KeyTasks] Provider name: %s", llm_service.provider_name)

        # Build project data for LLM service
        project_data = {
            "name": project.name,
            "description": project.description or "",
            "role": project.role or ("Developer" if language == "en" else "개발자"),
            "technologies": repo_analysis.detected_technologies or [],
            "total_commits": repo_analysis.total_commits or 0,
            "lines_added": repo_analysis.lines_added or 0,
        }

        commit_summary = repo_analysis.commit_messages_summary or ""

        # Build code context from contributions
        code_context = None
        if code_contributions and code_contributions.get("contributions"):
            # Format significant code changes for LLM context
            code_snippets = []
            for contrib in code_contributions["contributions"][:10]:  # Top 10 commits
                commit_info = f"Commit: {contrib['message']}"
                for file_info in contrib.get("files", [])[:3]:  # Top 3 files per commit
                    if file_info.get("patch"):
                        code_snippets.append(f"{commit_info}\nFile: {file_info['filename']}\n{file_info['patch'][:500]}")
            if code_snippets:
                code_context = "\n\n---\n\n".join(code_snippets[:5])  # Limit to 5 snippets
                logger.info("[KeyTasks] Including %d code snippets in context", len(code_snippets[:5]))

        # Use LLMService's generate_key_tasks method with language support
        tasks = await llm_service.generate_key_tasks(
            project_data=project_data,
            commit_summary=commit_summary,
            language=language,
            user_context=user_context,
            code_context=code_context  # New: pass code context
        )

        tokens = llm_service.total_tokens_used if hasattr(llm_service, 'total_tokens_used') else 0
        return tasks, tokens

    except Exception as e:
        # Log error but don't fail the analysis
        import traceback
        logger.warning("Failed to generate key tasks: %s: %s", type(e).__name__, e)
        logger.debug("[KeyTasks] Traceback: %s", traceback.format_exc())
        return [], 0


@router.get("/connect")
async def github_connect(
    redirect_url: Optional[str] = None,
    frontend_origin: Optional[str] = None,
    is_electron: bool = False,
    user_id: Optional[int] = None
):
    """Initiate GitHub OAuth flow."""
    import json
    import base64
    import logging

    logger.info("[GitHub Connect] Called with redirect_url=%s, frontend_origin=%s, is_electron=%s, user_id=%s", redirect_url, frontend_origin, is_electron, user_id)
    logger.debug("[GitHub Connect] settings.github_client_id=%s", settings.github_client_id)

    if not settings.github_client_id:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth not configured. Set GITHUB_CLIENT_ID in environment."
        )

    # Build authorization URL
    # Scopes:
    # - repo: Full control of private repositories (includes public repos)
    # - user:email: Access user email addresses
    # - read:org: Read organization membership, team membership
    scope = "repo,user:email,read:org"

    # Encode origin, redirect_path, electron flag, and user_id in state
    state_data = {
        "path": redirect_url or "/",
        "origin": frontend_origin,  # Can be None, will use settings.frontend_url as fallback
        "is_electron": is_electron,  # Flag to use custom protocol for callback
        "user_id": user_id  # Existing user to link GitHub to (instead of creating new)
    }
    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    # URL encode the redirect_uri to prevent parsing issues
    encoded_redirect_uri = quote(settings.github_redirect_uri, safe='')

    auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={encoded_redirect_uri}"
        f"&scope={scope}"
        f"&state={state}"
    )

    return {"auth_url": auth_url}


@router.get("/callback")
async def github_callback(
    code: str,
    state: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Handle GitHub OAuth callback.

    Uses OAuthService to properly manage user identities and prevent duplicate user creation.
    The OAuthService looks up users by GitHub's unique provider_user_id (not just username),
    which ensures the same GitHub account always maps to the same user.
    """
    import json
    import base64
    from api.services.oauth_service import OAuthService
    from api.services.oauth.base import OAuthUserInfo

    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    # Exchange code for access token
    async with httpx.AsyncClient(timeout=30.0) as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"}
        )

    if token_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange code for token")

    token_data = token_response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="No access token received")

    # Get user info from GitHub
    github_service = GitHubService(access_token)
    github_user = await github_service.get_user_info()

    # Parse state to get user_id, origin, redirect path, and electron flag
    redirect_path = "/"
    frontend_origin = settings.frontend_url  # Default fallback
    is_electron = False
    existing_user_id = None  # User ID to link GitHub to (if provided)

    if state:
        try:
            # Try to decode as JSON (new format)
            state_data = json.loads(base64.urlsafe_b64decode(state).decode())
            redirect_path = state_data.get("path", "/")
            if state_data.get("origin"):
                frontend_origin = state_data["origin"]
            is_electron = state_data.get("is_electron", False)
            existing_user_id = state_data.get("user_id")  # Existing user to link GitHub to
        except Exception:
            # Fallback: old format (plain redirect path)
            redirect_path = state

    # Use OAuthService to find or create user (prevents duplicate user creation)
    # This uses provider_user_id (GitHub's unique user ID) for reliable lookup
    oauth_service = OAuthService(db)

    oauth_user_info = OAuthUserInfo(
        provider_user_id=str(github_user["id"]),  # GitHub's unique user ID (numeric)
        username=github_user["login"],
        email=github_user.get("email"),
        avatar_url=github_user.get("avatar_url"),
        access_token=access_token,
        raw_data=github_user
    )

    identity, is_new_user = await oauth_service.create_or_update_identity(
        provider="github",
        user_info=oauth_user_info,
        user_id=existing_user_id  # Link to existing user if provided
    )

    # Get the user from the identity
    user = identity.user
    if not user:
        # Fallback: load user if relationship wasn't loaded
        result = await db.execute(select(User).where(User.id == identity.user_id))
        user = result.scalar_one_or_none()

    if is_new_user:
        logger.info("[GitHub Callback] Created new user id=%s for GitHub username=%s (provider_user_id=%s)",
                    user.id, github_user["login"], github_user["id"])
    elif existing_user_id:
        logger.info("[GitHub Callback] Linked GitHub to existing user id=%s, username=%s (provider_user_id=%s)",
                    existing_user_id, github_user["login"], github_user["id"])
    else:
        logger.info("[GitHub Callback] Updated existing user id=%s, username=%s (provider_user_id=%s)",
                    user.id, github_user["login"], github_user["id"])

    await db.commit()

    # Build redirect URL
    if is_electron:
        # Electron: use custom protocol so browser opens Electron app
        # Format: autopolio://oauth-callback?user_id=...&github_connected=...&path=...
        from urllib.parse import quote
        frontend_url = f"autopolio://oauth-callback?user_id={user.id}&github_connected=true&path={quote(redirect_path)}"
    else:
        # Web: redirect to frontend origin
        frontend_url = f"{frontend_origin}{redirect_path}?user_id={user.id}&github_connected=true"

    return RedirectResponse(url=frontend_url)


@router.get("/status")
async def get_github_status(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Check if GitHub is connected for a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_connected = bool(user.github_token_encrypted)

    # If connected, verify the token is still valid
    if is_connected:
        try:
            token = encryption.decrypt(user.github_token_encrypted)
            github_service = GitHubService(token)
            user_info = await github_service.get_user_info()
            return {
                "connected": True,
                "github_username": user_info.get("login"),
                "avatar_url": user_info.get("avatar_url"),
                "valid": True
            }
        except Exception:
            # Token is invalid or expired
            return {
                "connected": True,
                "github_username": user.github_username,
                "avatar_url": user.github_avatar_url,
                "valid": False,
                "message": "GitHub token has expired or is invalid. Please reconnect."
            }

    return {
        "connected": False,
        "github_username": None,
        "avatar_url": None,
        "valid": False
    }


@router.get("/repos", response_model=GitHubRepoListResponse)
async def get_user_repos(
    user_id: int = Query(..., description="User ID"),
    page: int = Query(1, description="Page number (ignored if fetch_all=true)"),
    per_page: int = Query(100, description="Items per page (ignored if fetch_all=true)"),
    fetch_all: bool = Query(True, description="Fetch all repositories"),
    db: AsyncSession = Depends(get_db)
):
    """Get user's GitHub repositories."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    if fetch_all:
        repos = await github_service.get_all_user_repos()
    else:
        repos = await github_service.get_user_repos(page=page, per_page=per_page)

    return {
        "repos": repos,
        "total": len(repos),
        "page": page if not fetch_all else 1,
        "per_page": per_page if not fetch_all else len(repos),
        "has_more": False if fetch_all else len(repos) == per_page
    }


@router.get("/repo-info")
async def get_repo_quick_info(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    db: AsyncSession = Depends(get_db)
):
    """Get quick repository info for auto-fill (without full analysis)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        info = await github_service.get_quick_repo_info(git_url, user.github_username)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch repo info: {str(e)}")


@router.post("/analyze", response_model=RepoAnalysisResponse)
async def analyze_repository(
    request: RepoAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    provider: Optional[str] = Query(None, description="LLM provider to use"),
    cli_mode: Optional[str] = Query(None, description="CLI mode: 'claude_code' or 'gemini_cli'"),
    cli_model: Optional[str] = Query(None, description="CLI model name"),
    language: Optional[str] = Query(None, description="Analysis output language: 'ko' or 'en'"),
):
    """Analyze a GitHub repository.

    Uses separate sessions for each phase to prevent SQLite lock issues during long operations.
    Does NOT use Depends(get_db) to avoid session lifecycle issues.

    Args:
        request: Analysis request with git_url and optional project_id
        user_id: User ID
        provider: LLM provider ("openai", "anthropic", "gemini")
        cli_mode: CLI mode ("claude_code", "gemini_cli")
        cli_model: CLI model name
        language: Output language for analysis ("ko" or "en"). Defaults to user's preferred_language.
    """
    from api.services.llm_service import LLMService
    from api.services.cli_llm_service import CLILLMService
    from api.database import AsyncSessionLocal

    # ===== PHASE 1: Get user and project info =====
    analysis_language = language  # Use provided language or fallback to user's preference
    existing_edits = None  # User's previous edits for context

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user or not user.github_token_encrypted:
            raise HTTPException(status_code=400, detail="GitHub is not connected. Please connect GitHub first.")

        try:
            token = encryption.decrypt(user.github_token_encrypted)
            github_username = user.github_username
        except Exception:
            raise HTTPException(status_code=400, detail="GitHub token is corrupted. Please reconnect.")

        # Use user's preferred language if not specified
        if not analysis_language:
            analysis_language = getattr(user, 'preferred_language', 'ko') or 'ko'

        project_id = request.project_id
        if project_id:
            proj_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = proj_result.scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")

            # Get existing analysis and user edits for re-analysis context
            existing_analysis_result = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
            )
            existing_analysis = existing_analysis_result.scalar_one_or_none()
            if existing_analysis:
                edits_result = await db.execute(
                    select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == existing_analysis.id)
                )
                existing_edits = edits_result.scalar_one_or_none()
        else:
            # Need to create project, but first get repo info
            project_id = None  # Will create after getting repo info

        await db.commit()
    logger.info("[Analyze] Phase 1 complete: user validated, project_id=%s, language=%s", project_id, analysis_language)

    # Initialize services (outside of DB session)
    github_service = GitHubService(token)
    total_tokens = 0
    used_provider = None
    llm_service = None
    llm_init_error = None
    try:
        if cli_mode:
            logger.info("[Analyze] Using CLI mode: %s, model: %s", cli_mode, cli_model)
            llm_service = CLILLMService(cli_mode, model=cli_model)
            used_provider = f"cli:{cli_mode}"
        elif provider:
            logger.info("[Analyze] Using API mode: %s", provider)
            llm_service = LLMService(provider)
            used_provider = llm_service.provider_name
        else:
            # Try default provider from settings
            logger.info("[Analyze] Using default LLM provider from settings")
            llm_service = LLMService()
            used_provider = llm_service.provider_name
    except ValueError as e:
        # API key not configured - continue without LLM
        llm_init_error = str(e)
        logger.warning("[Analyze] LLM service not available: %s", e)
    except Exception as e:
        llm_init_error = str(e)
        logger.warning("[Analyze] Failed to initialize LLM service: %s", e)

    try:
        # ===== PHASE 2: Create project if needed =====
        if not project_id:
            repo_info = await github_service.get_repo_info(request.git_url)
            async with AsyncSessionLocal() as db:
                project = Project(
                    user_id=user_id,
                    name=repo_info["name"],
                    description=repo_info.get("description"),
                    git_url=request.git_url,
                    project_type="personal"
                )
                db.add(project)
                await db.commit()
                await db.refresh(project)
                project_id = project.id
            logger.info("[Analyze] Phase 2 complete: created project_id=%s", project_id)

        # ===== PHASE 3: Run GitHub analysis (long HTTP operation - no DB connection) =====
        logger.info("[Analyze] Starting analyze_repository for %s", request.git_url)
        analysis_result = await github_service.analyze_repository(
            request.git_url,
            github_username
        )
        logger.info("[Analyze] Phase 3 complete: detected %d technologies", len(analysis_result.get('detected_technologies', [])))

        # ===== PHASE 4: Save analysis results =====
        analysis_id = None
        async with AsyncSessionLocal() as db:
            # Re-fetch project
            proj_result = await db.execute(select(Project).where(Project.id == project_id))
            project = proj_result.scalar_one_or_none()

            # Check for existing analysis
            existing = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
            )
            repo_analysis = existing.scalar_one_or_none()

            if repo_analysis:
                for key, value in analysis_result.items():
                    setattr(repo_analysis, key, value)
            else:
                repo_analysis = RepoAnalysis(
                    project_id=project_id,
                    git_url=request.git_url,
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
            project.git_url = request.git_url

            # Save detected technologies
            detected_techs = analysis_result.get('detected_technologies', [])
            if detected_techs:
                await db.execute(
                    ProjectTechnology.__table__.delete().where(
                        ProjectTechnology.project_id == project_id
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
                        project_id=project_id,
                        technology_id=tech.id,
                        is_primary=1 if tech_name == analysis_result.get('primary_language') else 0
                    )
                    db.add(project_tech)

            await db.flush()

            # Auto-detect achievements (with language support)
            try:
                await _auto_detect_achievements(db, project, repo_analysis, language=analysis_language)
            except Exception as e:
                logger.warning("Failed to auto-detect achievements: %s", e)

            # Calculate and save suggested contribution percent
            try:
                user_commits = repo_analysis.user_commits or 0
                total_commits = repo_analysis.total_commits or 0
                user_lines = repo_analysis.lines_added or 0  # Approximation: user lines ≈ total lines for now
                total_lines = repo_analysis.lines_added or 0

                # For more accurate calculation, we would need ContributorAnalysis data
                # For now, use simple commit-based calculation
                if total_commits > 0:
                    suggested = github_service.calculate_contribution_percent(
                        user_commits=user_commits,
                        total_commits=total_commits,
                        user_lines_added=user_lines,
                        total_lines_added=total_lines,
                        work_areas=None  # Will be populated from ContributorAnalysis if available
                    )
                    repo_analysis.suggested_contribution_percent = suggested
                    logger.info("[Analyze] Suggested contribution: %d%% (commits: %d/%d)", suggested, user_commits, total_commits)
            except Exception as e:
                logger.warning("Failed to calculate suggested contribution: %s", e)

            await db.commit()
            await db.refresh(repo_analysis)
            analysis_id = repo_analysis.id
        logger.info("[Analyze] Phase 4 complete: analysis saved, id=%s", analysis_id)

        # ===== PHASE 5: LLM operations (long operation - no DB connection during LLM calls) =====
        if llm_service:
            # First, read current state
            async with AsyncSessionLocal() as db:
                proj_result = await db.execute(select(Project).where(Project.id == project_id))
                project = proj_result.scalar_one_or_none()
                analysis_result_db = await db.execute(
                    select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
                )
                repo_analysis = analysis_result_db.scalar_one_or_none()

                # Copy data we need for LLM calls
                project_name = project.name
                project_description = project.description
                project_role = project.role
                project_team_size = project.team_size
                project_contribution_percent = project.contribution_percent
                project_start_date = str(project.start_date) if project.start_date else None
                project_end_date = str(project.end_date) if project.end_date else None
                commit_messages_summary = repo_analysis.commit_messages_summary
                detected_technologies = repo_analysis.detected_technologies
                commit_categories = repo_analysis.commit_categories
                total_commits = repo_analysis.total_commits
                lines_added = repo_analysis.lines_added
                lines_deleted = repo_analysis.lines_deleted
                files_changed = repo_analysis.files_changed

            # ===== PHASE 5.1: Collect user code contributions for LLM context =====
            user_code_contributions = None
            try:
                logger.info("[Analyze] Collecting user code contributions for LLM context")
                user_code_contributions = await github_service.get_user_code_contributions(
                    request.git_url,
                    github_username,
                    max_commits=30,
                    max_total_patch_size=50000  # ~50KB of code diffs
                )
                logger.info("[Analyze] Collected %d commits with code diffs",
                           len(user_code_contributions.get("contributions", [])))
            except Exception as e:
                logger.warning("[Analyze] Failed to collect code contributions: %s", e)

            # ===== PHASE 5.2: Generate key tasks using LLM (with code contributions) =====
            key_tasks = None
            try:
                logger.info("[Analyze] Generating key tasks with %s, language=%s", type(llm_service).__name__, analysis_language)
                # Create minimal project/analysis objects for _generate_key_tasks
                class MinimalProject:
                    def __init__(self):
                        self.name = project_name
                        self.description = project_description
                        self.role = project_role
                class MinimalAnalysis:
                    def __init__(self):
                        self.detected_technologies = detected_technologies
                        self.commit_messages_summary = commit_messages_summary
                        self.commit_categories = commit_categories
                        self.total_commits = total_commits
                        self.lines_added = lines_added

                # Get user context from previous edits if available
                key_tasks_user_context = None
                if existing_edits and existing_edits.key_tasks_modified and existing_edits.key_tasks:
                    import json
                    key_tasks_user_context = json.dumps(existing_edits.key_tasks, ensure_ascii=False)
                    logger.info("[Analyze] Using user's previous key_tasks edits as context")

                key_tasks, tokens = await _generate_key_tasks(
                    MinimalProject(), MinimalAnalysis(), llm_service,
                    language=analysis_language,
                    user_context=key_tasks_user_context,
                    code_contributions=user_code_contributions  # New: pass code contributions
                )
                total_tokens += tokens
            except Exception as e:
                import traceback
                logger.warning("[Analyze] Failed to generate key tasks: %s: %s", type(e).__name__, e)
                logger.debug("[Analyze] Traceback: %s", traceback.format_exc())

            # ===== PHASE 5.3: Generate detailed content (with code contributions) =====
            detailed_content = None
            try:
                project_data = {
                    "name": project_name,
                    "description": project_description,
                    "role": project_role,
                    "start_date": project_start_date,
                    "end_date": project_end_date,
                }
                detailed_content, content_tokens = await github_service.generate_detailed_content(
                    project_data=project_data,
                    analysis_data={
                        "commit_messages_summary": commit_messages_summary,
                        "detected_technologies": detected_technologies,
                        "commit_categories": commit_categories,
                        "total_commits": total_commits,
                        "lines_added": lines_added,
                        "lines_deleted": lines_deleted,
                        "files_changed": files_changed,
                    },
                    llm_service=llm_service,
                    language=analysis_language,
                    code_contributions=user_code_contributions  # New: pass code contributions
                )
                total_tokens += content_tokens
            except Exception as e:
                logger.warning("Failed to generate detailed content: %s", e)

            # ===== PHASE 5.4: Generate AI summary (NEW - previously in Pipeline Step 5) =====
            ai_summary = None
            ai_key_features = None
            try:
                logger.info("[Analyze] Generating AI summary with code contributions context")
                summary_project_data = {
                    "name": project_name,
                    "description": project_description,
                    "role": project_role,
                    "team_size": project_team_size,
                    "contribution_percent": project_contribution_percent,
                    "technologies": detected_technologies or [],
                    "start_date": project_start_date,
                    "end_date": project_end_date,
                    "total_commits": total_commits,
                    "commit_summary": commit_messages_summary,
                    # Include code contribution summary for better context
                    "code_contributions_summary": {
                        "analyzed_commits": user_code_contributions.get("summary", {}).get("analyzed_commits", 0) if user_code_contributions else 0,
                        "lines_added": user_code_contributions.get("summary", {}).get("lines_added", 0) if user_code_contributions else 0,
                        "work_areas": user_code_contributions.get("work_areas", []) if user_code_contributions else [],
                    } if user_code_contributions else None,
                }
                summary_result = await llm_service.generate_project_summary(
                    summary_project_data,
                    style="professional",
                    language=analysis_language
                )
                if summary_result:
                    ai_summary = summary_result.get("summary", "")
                    ai_key_features = summary_result.get("key_features", [])
                    total_tokens += llm_service.total_tokens_used if hasattr(llm_service, 'total_tokens_used') else 0
                logger.info("[Analyze] AI summary generated successfully")
            except Exception as e:
                logger.warning("[Analyze] Failed to generate AI summary: %s", e)

            # ===== PHASE 5.5: Save LLM results (new session) =====
            async with AsyncSessionLocal() as db:
                analysis_result_db = await db.execute(
                    select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
                )
                repo_analysis = analysis_result_db.scalar_one_or_none()

                if key_tasks:
                    repo_analysis.key_tasks = key_tasks
                if detailed_content:
                    if detailed_content.get("implementation_details"):
                        repo_analysis.implementation_details = detailed_content["implementation_details"]
                    if detailed_content.get("development_timeline"):
                        repo_analysis.development_timeline = detailed_content["development_timeline"]
                    if detailed_content.get("detailed_achievements"):
                        repo_analysis.detailed_achievements = detailed_content["detailed_achievements"]

                # Save AI summary (NEW)
                if ai_summary:
                    repo_analysis.ai_summary = ai_summary
                if ai_key_features:
                    repo_analysis.ai_key_features = ai_key_features

                # Save user code contributions summary
                if user_code_contributions:
                    repo_analysis.user_code_contributions = {
                        "summary": user_code_contributions.get("summary", {}),
                        "technologies": user_code_contributions.get("technologies", []),
                        "work_areas": user_code_contributions.get("work_areas", []),
                        # Don't save full contributions with patches to DB - too large
                    }

                # Save analysis language
                repo_analysis.analysis_language = analysis_language

                await db.commit()

                # Also copy ai_summary and ai_key_features to Project (for report_service compatibility)
                if ai_summary or ai_key_features:
                    proj_result = await db.execute(
                        select(Project).where(Project.id == project_id)
                    )
                    project_obj = proj_result.scalar_one_or_none()
                    if project_obj:
                        if ai_summary:
                            project_obj.ai_summary = ai_summary
                        if ai_key_features:
                            project_obj.ai_key_features = ai_key_features
                        await db.commit()
                        logger.info("[Analyze] Copied ai_summary to Project %d", project_id)
            logger.info("[Analyze] Phase 5 complete: LLM content saved, language=%s", analysis_language)

        # ===== PHASE 6: Extract tech versions =====
        try:
            tech_versions = await github_service.extract_tech_versions(request.git_url)
            if tech_versions:
                async with AsyncSessionLocal() as db:
                    analysis_result_db = await db.execute(
                        select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
                    )
                    repo_analysis = analysis_result_db.scalar_one_or_none()
                    repo_analysis.tech_stack_versions = tech_versions
                    await db.commit()
        except Exception as e:
            logger.warning("Failed to extract tech versions: %s", e)

        # ===== Final: Build and return response =====
        async with AsyncSessionLocal() as db:
            analysis_result_db = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
            )
            repo_analysis = analysis_result_db.scalar_one_or_none()

            response = RepoAnalysisResponse(
                id=repo_analysis.id,
                project_id=repo_analysis.project_id,
                git_url=repo_analysis.git_url,
                total_commits=repo_analysis.total_commits,
                user_commits=repo_analysis.user_commits,
                lines_added=repo_analysis.lines_added,
                lines_deleted=repo_analysis.lines_deleted,
                files_changed=repo_analysis.files_changed,
                languages=repo_analysis.languages or {},
                primary_language=repo_analysis.primary_language,
                detected_technologies=repo_analysis.detected_technologies or [],
                commit_messages_summary=repo_analysis.commit_messages_summary,
                commit_categories=repo_analysis.commit_categories,
                architecture_patterns=repo_analysis.architecture_patterns,
                key_tasks=repo_analysis.key_tasks,
                implementation_details=repo_analysis.implementation_details,
                development_timeline=repo_analysis.development_timeline,
                tech_stack_versions=repo_analysis.tech_stack_versions,
                detailed_achievements=repo_analysis.detailed_achievements,
                # AI summary (NEW - generated during analysis)
                ai_summary=repo_analysis.ai_summary,
                ai_key_features=repo_analysis.ai_key_features,
                user_code_contributions=repo_analysis.user_code_contributions,
                analyzed_at=repo_analysis.analyzed_at,
                provider=used_provider,
                token_usage=total_tokens if total_tokens > 0 else None,
                suggested_contribution_percent=repo_analysis.suggested_contribution_percent,
                analysis_language=repo_analysis.analysis_language or "ko"
            )
            return response

    except GitHubTimeoutError as e:
        raise HTTPException(status_code=504, detail=e.message)
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=e.message)
    except GitHubNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Repository not found: {request.git_url}")
    except GitHubAuthError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid GitHub URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/analysis/{project_id}", response_model=RepoAnalysisResponse)
async def get_repo_analysis(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get repository analysis for a project."""
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Explicitly construct response with all fields
    return RepoAnalysisResponse(
        id=analysis.id,
        project_id=analysis.project_id,
        git_url=analysis.git_url,
        total_commits=analysis.total_commits,
        user_commits=analysis.user_commits,
        lines_added=analysis.lines_added,
        lines_deleted=analysis.lines_deleted,
        files_changed=analysis.files_changed,
        languages=analysis.languages or {},
        primary_language=analysis.primary_language,
        detected_technologies=analysis.detected_technologies or [],
        commit_messages_summary=analysis.commit_messages_summary,
        commit_categories=analysis.commit_categories,
        architecture_patterns=analysis.architecture_patterns,
        key_tasks=analysis.key_tasks,
        implementation_details=analysis.implementation_details,
        development_timeline=analysis.development_timeline,
        tech_stack_versions=analysis.tech_stack_versions,
        detailed_achievements=analysis.detailed_achievements,
        analyzed_at=analysis.analyzed_at,
        # AI summary fields (v1.12)
        ai_summary=analysis.ai_summary,
        ai_key_features=analysis.ai_key_features,
        analysis_language=analysis.analysis_language or "ko"
    )


@router.delete("/disconnect")
async def disconnect_github(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Disconnect GitHub account from user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.github_token_encrypted = None
    await db.commit()

    return {"message": "GitHub disconnected successfully"}


@router.get("/test-llm")
async def test_llm():
    """Test LLM provider connection."""
    from api.services.llm_service import LLMService

    try:
        llm_service = LLMService()
        response, tokens = await llm_service.provider.generate(
            "Say 'Hello! LLM is working.' in one short sentence.",
            max_tokens=50,
            temperature=0.1
        )
        return {
            "provider": llm_service.provider_name,
            "status": "success",
            "response": response,
            "token_usage": tokens
        }
    except Exception as e:
        return {
            "provider": settings.llm_provider,
            "status": "error",
            "error": str(e)
        }


@router.get("/test-cli")
async def test_cli(
    cli_mode: str = Query("claude_code", description="CLI mode: 'claude_code' or 'gemini_cli'"),
    cli_model: Optional[str] = Query(None, description="CLI model name"),
):
    """Test CLI LLM provider connection."""
    from api.services.cli_llm_service import CLILLMService

    logger.info("[TestCLI] Starting test with cli_mode=%s, cli_model=%s", cli_mode, cli_model)
    try:
        cli_service = CLILLMService(cli_mode, model=cli_model)
        logger.debug("[TestCLI] Created CLILLMService")
        response, tokens = await cli_service.provider.generate(
            "Say 'Hello! CLI is working.' in one short sentence.",
            max_tokens=50,
            temperature=0.1
        )
        logger.debug("[TestCLI] Got response, tokens=%d", tokens)
        return {
            "provider": cli_service.provider_name,
            "status": "success",
            "response": response,
            "token_usage": tokens
        }
    except Exception as e:
        import traceback
        logger.error("[TestCLI] Error: %s: %s", type(e).__name__, e)
        logger.debug("[TestCLI] Traceback: %s", traceback.format_exc())
        return {
            "provider": f"cli:{cli_mode}",
            "status": "error",
            "error": str(e)
        }


@router.get("/detect-technologies")
async def detect_technologies(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    db: AsyncSession = Depends(get_db)
):
    """Detect technologies used in a repository (no LLM, fast)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub is not connected")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub token is corrupted. Please reconnect.")

    github_service = GitHubService(token)

    try:
        technologies = await github_service.detect_technologies(git_url)
        return {"technologies": technologies}
    except GitHubTimeoutError as e:
        raise HTTPException(status_code=504, detail=e.message)
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=e.message)
    except GitHubNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Repository not found: {git_url}")
    except GitHubAuthError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid GitHub URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Technology detection failed: {str(e)}")


@router.get("/file-tree")
async def get_file_tree(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    path: str = Query("", description="Path within repository"),
    ref: Optional[str] = Query(None, description="Branch, tag, or commit SHA"),
    recursive: bool = Query(False, description="Get full tree recursively"),
    db: AsyncSession = Depends(get_db)
):
    """Get file tree for a GitHub repository."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        files = await github_service.get_file_tree(git_url, path, ref, recursive)
        return {"files": files, "path": path, "git_url": git_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get file tree: {str(e)}")


@router.get("/file-content")
async def get_file_content(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    file_path: str = Query(..., description="Path to file within repository"),
    ref: Optional[str] = Query(None, description="Branch, tag, or commit SHA"),
    db: AsyncSession = Depends(get_db)
):
    """Get content of a specific file from a GitHub repository."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        content = await github_service.get_file_content(git_url, file_path, ref)
        return content
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get file content: {str(e)}")


@router.post("/generate-description")
async def generate_description(
    request: RepoAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Generate AI-powered description for a repository using README and detected technologies."""
    from api.services.llm_service import LLMService
    import base64

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        # Parse repo URL
        owner, repo = github_service._parse_repo_url(request.git_url)

        # Get repo info
        repo_info = await github_service.get_repo_info(request.git_url)

        # Try to fetch README
        readme_content = ""
        for readme_file in ["README.md", "readme.md", "README.rst", "README"]:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo}/contents/{readme_file}",
                        headers=github_service.headers
                    )
                    if response.status_code == 200:
                        data = response.json()
                        if "content" in data:
                            readme_content = base64.b64decode(data["content"]).decode("utf-8")
                            break
            except Exception:
                continue

        # Detect technologies
        technologies = await github_service.detect_technologies(request.git_url)

        # Generate description using LLM
        llm_service = LLMService()

        prompt = f"""다음 GitHub 레포지토리 정보를 바탕으로 포트폴리오용 설명을 작성해주세요.

레포지토리 이름: {repo_info.get('name', repo)}
GitHub 설명: {repo_info.get('description', '없음')}
주요 언어: {repo_info.get('language', '없음')}
감지된 기술: {', '.join(technologies[:15]) if technologies else '없음'}

README 내용 (일부):
{readme_content[:3000] if readme_content else '없음'}

다음 형식으로 응답해주세요:
1. 간단 설명 (1-2문장, 50자 이내)
2. 상세 설명 (3-5문장, 프로젝트의 목적, 주요 기능, 기술적 특징을 포함)

응답 형식:
간단 설명: [간단 설명 내용]
상세 설명: [상세 설명 내용]"""

        response, tokens = await llm_service.provider.generate(
            prompt,
            max_tokens=500,
            temperature=0.7
        )

        # Parse response
        short_desc = ""
        long_desc = ""

        lines = response.strip().split("\n")
        for line in lines:
            if line.startswith("간단 설명:"):
                short_desc = line.replace("간단 설명:", "").strip()
            elif line.startswith("상세 설명:"):
                long_desc = line.replace("상세 설명:", "").strip()

        # If parsing failed, use the whole response
        if not short_desc and not long_desc:
            parts = response.split("\n\n")
            if len(parts) >= 2:
                short_desc = parts[0].strip()
                long_desc = parts[1].strip()
            else:
                short_desc = response[:100].strip()
                long_desc = response.strip()

        return {
            "short_description": short_desc,
            "description": long_desc,
            "technologies": technologies[:20],
            "token_usage": tokens,
            "provider": llm_service.provider_name
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate description: {str(e)}")


@router.post("/import-repos", response_model=ImportReposResponse)
async def import_repos_as_projects(
    request: ImportReposRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Import multiple GitHub repositories as projects in bulk."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub is not connected")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub token is corrupted")

    github_service = GitHubService(token)
    results: list[ImportRepoResult] = []
    imported = 0
    failed = 0

    for repo_url in request.repo_urls:
        try:
            # Check if project with this URL already exists
            existing = await db.execute(
                select(Project).where(
                    Project.user_id == user_id,
                    Project.git_url == repo_url
                )
            )
            if existing.scalar_one_or_none():
                results.append(ImportRepoResult(
                    repo_url=repo_url,
                    project_name="",
                    success=False,
                    message="Repository already registered."
                ))
                failed += 1
                continue

            # Fetch repo info
            repo_info = await github_service.get_repo_info(repo_url)

            # Create project
            project = Project(
                user_id=user_id,
                name=repo_info.get("name", "Unknown"),
                short_description=repo_info.get("description"),
                git_url=repo_url,
                project_type="personal",
                status="pending",  # Set initial status to pending
            )

            # Set dates if available
            if repo_info.get("created_at"):
                try:
                    from datetime import datetime
                    created = datetime.fromisoformat(repo_info["created_at"].replace("Z", "+00:00"))
                    project.start_date = created.date()
                except Exception:
                    pass

            db.add(project)
            await db.flush()

            results.append(ImportRepoResult(
                repo_url=repo_url,
                project_id=project.id,
                project_name=project.name,
                success=True,
                message="Registered as project."
            ))
            imported += 1

        except GitHubNotFoundError:
            results.append(ImportRepoResult(
                repo_url=repo_url,
                project_name="",
                success=False,
                message="Repository not found."
            ))
            failed += 1
        except GitHubServiceError as e:
            results.append(ImportRepoResult(
                repo_url=repo_url,
                project_name="",
                success=False,
                message=e.message
            ))
            failed += 1
        except Exception as e:
            results.append(ImportRepoResult(
                repo_url=repo_url,
                project_name="",
                success=False,
                message=f"Error: {str(e)}"
            ))
            failed += 1

    await db.commit()

    return ImportReposResponse(
        imported=imported,
        failed=failed,
        results=results
    )


@router.post("/analyze-batch", response_model=BatchAnalysisResponse)
async def analyze_batch(
    request: BatchAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Analyze multiple projects in batch (synchronous).

    Supports both API mode (LLMService) and CLI mode (CLILLMService) for LLM operations.
    """
    from api.services.cli_llm_service import CLILLMService
    from api.services.llm_service import LLMService

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub is not connected")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub token is corrupted")

    github_service = GitHubService(token)
    role_service = RoleService()
    results: list[BatchAnalysisResult] = []
    completed = 0
    failed = 0

    # Create LLM service based on request parameters
    llm_service = None
    used_provider = None
    llm_init_error = None
    try:
        if request.cli_mode:
            logger.info("[AnalyzeBatch] Using CLI mode: %s, model: %s", request.cli_mode, request.cli_model)
            llm_service = CLILLMService(request.cli_mode, model=request.cli_model)
            used_provider = f"cli:{request.cli_mode}"
        elif request.llm_provider:
            logger.info("[AnalyzeBatch] Using API mode: %s", request.llm_provider)
            llm_service = LLMService(request.llm_provider)
            used_provider = request.llm_provider
    except ValueError as e:
        # API key not configured - continue without LLM
        llm_init_error = str(e)
        logger.warning("[AnalyzeBatch] LLM service not available: %s", e)
    except Exception as e:
        llm_init_error = str(e)
        logger.warning("[AnalyzeBatch] Failed to initialize LLM service: %s", e)

    for project_id in request.project_ids:
        try:
            # Get project
            proj_result = await db.execute(
                select(Project).where(
                    Project.id == project_id,
                    Project.user_id == user_id
                )
            )
            project = proj_result.scalar_one_or_none()

            if not project:
                results.append(BatchAnalysisResult(
                    project_id=project_id,
                    project_name="Unknown",
                    success=False,
                    message="Project not found."
                ))
                failed += 1
                continue

            if not project.git_url:
                results.append(BatchAnalysisResult(
                    project_id=project_id,
                    project_name=project.name,
                    success=False,
                    message="GitHub URL not set."
                ))
                failed += 1
                continue

            # Run analysis
            analysis_result = await github_service.analyze_repository(
                project.git_url,
                user.github_username
            )

            # Check for existing analysis
            existing = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.project_id == project.id)
            )
            repo_analysis = existing.scalar_one_or_none()

            if repo_analysis:
                for key, value in analysis_result.items():
                    setattr(repo_analysis, key, value)
            else:
                repo_analysis = RepoAnalysis(
                    project_id=project.id,
                    git_url=project.git_url,
                    **analysis_result
                )
                db.add(repo_analysis)

            # Auto-detect role
            detected_role = None
            if not project.role:
                detected_role, _ = role_service.detect_role(
                    technologies=analysis_result.get('detected_technologies', []),
                    commit_messages=analysis_result.get('commit_messages', [])[:100],
                )
                project.role = detected_role

            # Mark as analyzed and update status
            project.is_analyzed = 1
            project.status = "completed"

            # Save detected technologies to project
            detected_techs = analysis_result.get('detected_technologies', [])
            if detected_techs:
                # Clear existing technologies for this project
                await db.execute(
                    ProjectTechnology.__table__.delete().where(
                        ProjectTechnology.project_id == project.id
                    )
                )

                # Add detected technologies
                for tech_name in detected_techs:
                    # Get or create technology
                    tech_result = await db.execute(
                        select(Technology).where(Technology.name == tech_name)
                    )
                    tech = tech_result.scalar_one_or_none()

                    if not tech:
                        tech = Technology(name=tech_name)
                        db.add(tech)
                        await db.flush()

                    # Create project-technology association
                    project_tech = ProjectTechnology(
                        project_id=project.id,
                        technology_id=tech.id,
                        is_primary=1 if tech_name == analysis_result.get('primary_language') else 0
                    )
                    db.add(project_tech)

            await db.flush()

            # Generate LLM-based content if LLM service is available
            if llm_service:
                try:
                    # Generate key tasks
                    logger.info("[AnalyzeBatch] Generating key tasks for %s", project.name)
                    key_tasks, tokens = await _generate_key_tasks(project, repo_analysis, llm_service)
                    if key_tasks:
                        repo_analysis.key_tasks = key_tasks
                        await db.flush()

                    # Generate detailed content
                    project_data = {
                        "name": project.name,
                        "description": project.description,
                        "role": project.role,
                        "start_date": str(project.start_date) if project.start_date else None,
                        "end_date": str(project.end_date) if project.end_date else None,
                    }
                    detailed_content, content_tokens = await github_service.generate_detailed_content(
                        project_data=project_data,
                        analysis_data={
                            "commit_messages_summary": repo_analysis.commit_messages_summary,
                            "detected_technologies": repo_analysis.detected_technologies,
                            "commit_categories": repo_analysis.commit_categories,
                            "total_commits": repo_analysis.total_commits,
                            "lines_added": repo_analysis.lines_added,
                            "lines_deleted": repo_analysis.lines_deleted,
                            "files_changed": repo_analysis.files_changed,
                        },
                        llm_service=llm_service
                    )
                    if detailed_content:
                        if detailed_content.get("implementation_details"):
                            repo_analysis.implementation_details = detailed_content["implementation_details"]
                        if detailed_content.get("development_timeline"):
                            repo_analysis.development_timeline = detailed_content["development_timeline"]
                        if detailed_content.get("detailed_achievements"):
                            repo_analysis.detailed_achievements = detailed_content["detailed_achievements"]
                        await db.flush()
                except Exception as e:
                    logger.warning("[AnalyzeBatch] Failed to generate LLM content for %s: %s", project.name, e)

            results.append(BatchAnalysisResult(
                project_id=project.id,
                project_name=project.name,
                success=True,
                message="Analysis complete" + (f" (LLM: {used_provider})" if used_provider else ""),
                detected_technologies=analysis_result.get('detected_technologies', [])[:10],
                detected_role=detected_role
            ))
            completed += 1

        except GitHubTimeoutError:
            results.append(BatchAnalysisResult(
                project_id=project_id,
                project_name=project.name if project else "Unknown",
                success=False,
                message="GitHub API timeout"
            ))
            failed += 1
        except GitHubRateLimitError:
            results.append(BatchAnalysisResult(
                project_id=project_id,
                project_name=project.name if project else "Unknown",
                success=False,
                message="GitHub API rate limit exceeded"
            ))
            failed += 1
            # Stop processing on rate limit
            break
        except GitHubServiceError as e:
            results.append(BatchAnalysisResult(
                project_id=project_id,
                project_name=project.name if project else "Unknown",
                success=False,
                message=e.message
            ))
            failed += 1
        except Exception as e:
            results.append(BatchAnalysisResult(
                project_id=project_id,
                project_name=project.name if project else "Unknown",
                success=False,
                message=f"Analysis error: {str(e)}"
            ))
            failed += 1

    await db.commit()

    return BatchAnalysisResponse(
        total=len(request.project_ids),
        completed=completed,
        failed=failed,
        results=results
    )


# ============ Inline Editing Endpoints ============

@router.get("/analysis/{project_id}/effective", response_model=EffectiveAnalysisResponse)
async def get_effective_analysis(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get repository analysis with user edits applied."""
    # Get analysis
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get user edits if any
    edits_result = await db.execute(
        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
    )
    edits = edits_result.scalar_one_or_none()

    # Build edit status
    edit_status = EditStatus(
        key_tasks_modified=edits.key_tasks_modified if edits else False,
        implementation_details_modified=edits.implementation_details_modified if edits else False,
        detailed_achievements_modified=edits.detailed_achievements_modified if edits else False,
    )

    # Apply edits to get effective content
    effective_key_tasks = (
        edits.key_tasks if edits and edits.key_tasks_modified and edits.key_tasks is not None
        else analysis.key_tasks
    )
    effective_implementation_details = (
        edits.implementation_details if edits and edits.implementation_details_modified and edits.implementation_details is not None
        else analysis.implementation_details
    )
    effective_detailed_achievements = (
        edits.detailed_achievements if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None
        else analysis.detailed_achievements
    )

    return EffectiveAnalysisResponse(
        id=analysis.id,
        project_id=analysis.project_id,
        git_url=analysis.git_url,
        total_commits=analysis.total_commits,
        user_commits=analysis.user_commits,
        lines_added=analysis.lines_added,
        lines_deleted=analysis.lines_deleted,
        files_changed=analysis.files_changed,
        languages=analysis.languages or {},
        primary_language=analysis.primary_language,
        detected_technologies=analysis.detected_technologies or [],
        commit_messages_summary=analysis.commit_messages_summary,
        commit_categories=analysis.commit_categories,
        architecture_patterns=analysis.architecture_patterns,
        key_tasks=effective_key_tasks,
        implementation_details=effective_implementation_details,
        development_timeline=analysis.development_timeline,
        tech_stack_versions=analysis.tech_stack_versions,
        detailed_achievements=effective_detailed_achievements,
        analyzed_at=analysis.analyzed_at,
        edit_status=edit_status
    )


@router.patch("/analysis/{project_id}/content")
async def update_analysis_content(
    project_id: int,
    update: AnalysisContentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update specific analysis content field."""
    # Validate field name
    valid_fields = ['key_tasks', 'implementation_details', 'detailed_achievements']
    if update.field not in valid_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field. Must be one of: {', '.join(valid_fields)}"
        )

    # Get analysis
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get or create edits record
    edits_result = await db.execute(
        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
    )
    edits = edits_result.scalar_one_or_none()

    if not edits:
        edits = RepoAnalysisEdits(repo_analysis_id=analysis.id)
        db.add(edits)

    # Update the specific field
    if update.field == 'key_tasks':
        edits.key_tasks = update.content
        edits.key_tasks_modified = True
    elif update.field == 'implementation_details':
        edits.implementation_details = update.content
        edits.implementation_details_modified = True
    elif update.field == 'detailed_achievements':
        edits.detailed_achievements = update.content
        edits.detailed_achievements_modified = True

    await db.commit()

    return {
        "success": True,
        "field": update.field,
        "message": f"{update.field} content has been saved."
    }


@router.post("/analysis/{project_id}/reset/{field}")
async def reset_analysis_field(
    project_id: int,
    field: str,
    db: AsyncSession = Depends(get_db)
):
    """Reset a specific field to original analysis content."""
    # Validate field name
    valid_fields = ['key_tasks', 'implementation_details', 'detailed_achievements']
    if field not in valid_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field. Must be one of: {', '.join(valid_fields)}"
        )

    # Get analysis
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get edits record
    edits_result = await db.execute(
        select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
    )
    edits = edits_result.scalar_one_or_none()

    if not edits:
        return {
            "success": True,
            "field": field,
            "message": "No modifications exist."
        }

    # Reset the specific field
    if field == 'key_tasks':
        edits.key_tasks = None
        edits.key_tasks_modified = False
    elif field == 'implementation_details':
        edits.implementation_details = None
        edits.implementation_details_modified = False
    elif field == 'detailed_achievements':
        edits.detailed_achievements = None
        edits.detailed_achievements_modified = False

    await db.commit()

    return {
        "success": True,
        "field": field,
        "message": f"{field} content has been reset to original."
    }


# ============ Extended Analysis Endpoints (v1.10) ============

@router.get("/contributors/{project_id}", response_model=ContributorsListResponse)
async def get_contributors(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all contributors for a project's repository."""
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        contributors = await github_service.get_all_contributors(project.git_url)
        return ContributorsListResponse(
            contributors=[ContributorSummary(**c) for c in contributors],
            total=len(contributors)
        )
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch contributors: {str(e)}")


@router.get("/contributor-analysis/{project_id}", response_model=ContributorAnalysisResponse)
async def get_contributor_analysis(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    username: Optional[str] = Query(
        None,
        description="Username to analyze (defaults to logged-in user)",
        max_length=39,
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$"
    ),
    refresh: bool = Query(False, description="Force refresh analysis"),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed contributor analysis for a project.

    If username is not provided, analyzes the logged-in user's contributions.
    """
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    # Get repo analysis
    analysis_result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    repo_analysis = analysis_result.scalar_one_or_none()

    if not repo_analysis:
        raise HTTPException(status_code=404, detail="Repository analysis not found. Run analysis first.")

    # Determine target username
    target_username = username or user.github_username
    if not target_username:
        raise HTTPException(status_code=400, detail="No username specified and user has no GitHub username")

    # Check for cached analysis
    if not refresh:
        cached_result = await db.execute(
            select(ContributorAnalysis).where(
                ContributorAnalysis.repo_analysis_id == repo_analysis.id,
                ContributorAnalysis.username == target_username
            )
        )
        cached = cached_result.scalar_one_or_none()
        if cached:
            return ContributorAnalysisResponse(
                username=cached.username,
                email=cached.email,
                is_primary=cached.is_primary,
                total_commits=cached.total_commits,
                first_commit_date=cached.first_commit_date,
                last_commit_date=cached.last_commit_date,
                lines_added=cached.lines_added,
                lines_deleted=cached.lines_deleted,
                file_extensions=cached.file_extensions or {},
                work_areas=cached.work_areas or [],
                detected_technologies=cached.detected_technologies or [],
                detailed_commits=[DetailedCommit(**c) for c in (cached.detailed_commits or [])],
                commit_types=cached.commit_types or {},
            )

    # Run fresh analysis
    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        analysis = await github_service.analyze_contributor(
            project.git_url,
            target_username,
            commit_limit=100
        )

        # Save to database
        existing = await db.execute(
            select(ContributorAnalysis).where(
                ContributorAnalysis.repo_analysis_id == repo_analysis.id,
                ContributorAnalysis.username == target_username
            )
        )
        contributor = existing.scalar_one_or_none()

        is_primary = target_username == user.github_username

        if contributor:
            # Update existing
            contributor.total_commits = analysis["total_commits"]
            contributor.first_commit_date = analysis["first_commit_date"]
            contributor.last_commit_date = analysis["last_commit_date"]
            contributor.lines_added = analysis["lines_added"]
            contributor.lines_deleted = analysis["lines_deleted"]
            contributor.file_extensions = analysis["file_extensions"]
            contributor.work_areas = analysis["work_areas"]
            contributor.detected_technologies = analysis["detected_technologies"]
            contributor.detailed_commits = analysis["detailed_commits"]
            contributor.commit_types = analysis["commit_types"]
            contributor.is_primary = is_primary
        else:
            # Create new
            contributor = ContributorAnalysis(
                repo_analysis_id=repo_analysis.id,
                username=target_username,
                is_primary=is_primary,
                total_commits=analysis["total_commits"],
                first_commit_date=analysis["first_commit_date"],
                last_commit_date=analysis["last_commit_date"],
                lines_added=analysis["lines_added"],
                lines_deleted=analysis["lines_deleted"],
                file_extensions=analysis["file_extensions"],
                work_areas=analysis["work_areas"],
                detected_technologies=analysis["detected_technologies"],
                detailed_commits=analysis["detailed_commits"],
                commit_types=analysis["commit_types"],
            )
            db.add(contributor)

        await db.commit()

        return ContributorAnalysisResponse(
            username=target_username,
            is_primary=is_primary,
            total_commits=analysis["total_commits"],
            first_commit_date=analysis["first_commit_date"],
            last_commit_date=analysis["last_commit_date"],
            lines_added=analysis["lines_added"],
            lines_deleted=analysis["lines_deleted"],
            file_extensions=analysis["file_extensions"],
            work_areas=analysis["work_areas"],
            detected_technologies=analysis["detected_technologies"],
            detailed_commits=[DetailedCommit(**c) for c in analysis["detailed_commits"]],
            commit_types=analysis["commit_types"],
        )

    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.exception("Failed to analyze contributor: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze contributor: {str(e)}")


@router.get("/code-quality/{project_id}", response_model=CodeQualityMetrics)
async def get_code_quality(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get code quality metrics for a project's repository."""
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        metrics = await github_service.analyze_code_quality(project.git_url)

        # Update repo analysis with metrics if exists
        analysis_result = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        )
        repo_analysis = analysis_result.scalar_one_or_none()

        if repo_analysis:
            repo_analysis.code_quality_metrics = metrics
            await db.commit()

        return CodeQualityMetrics(**metrics)

    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.exception("Failed to analyze code quality: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze code quality: {str(e)}")


@router.get("/detailed-commits/{project_id}")
async def get_detailed_commits(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    author: Optional[str] = Query(
        None,
        description="Filter by author username",
        max_length=39,
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$"
    ),
    limit: int = Query(50, description="Maximum commits to return", le=100),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed commit history with Conventional Commit parsing."""
    # Get user and project
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.git_url:
        raise HTTPException(status_code=400, detail="Project has no GitHub URL")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        commits = await github_service.get_detailed_commits(
            project.git_url,
            author=author,
            limit=limit
        )

        return {
            "commits": commits,
            "total": len(commits),
            "author": author,
        }

    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.exception("Failed to get detailed commits: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get detailed commits: {str(e)}")


# ============ Background Analysis Endpoints (v1.12) ============

@router.post("/analyze-background", response_model=StartAnalysisResponse)
async def start_background_analysis(
    request: RepoAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    provider: Optional[str] = Query(None, description="LLM provider to use"),
    cli_mode: Optional[str] = Query(None, description="CLI mode: 'claude_code' or 'gemini_cli'"),
    cli_model: Optional[str] = Query(None, description="CLI model name"),
    language: Optional[str] = Query(None, description="Analysis language: 'ko' or 'en'"),
    db: AsyncSession = Depends(get_db)
):
    """Start a background analysis job for a GitHub repository.

    Returns immediately with a task_id that can be used to track progress.
    """
    import asyncio

    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub is not connected. Please connect GitHub first.")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
        github_username = user.github_username
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub token is corrupted. Please reconnect.")

    # Get or create project
    project_id = request.project_id
    if project_id:
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    else:
        # Create project
        github_service = GitHubService(token)
        repo_info = await github_service.get_repo_info(request.git_url)
        project = Project(
            user_id=user_id,
            name=repo_info["name"],
            description=repo_info.get("description"),
            git_url=request.git_url,
            project_type="personal",
            status="pending"
        )
        db.add(project)
        await db.flush()
        await db.refresh(project)
        project_id = project.id

    # Check if there's already an active job for this project
    service = AnalysisJobService(db)
    existing_job = await service.get_job_by_project(project_id)
    if existing_job:
        return StartAnalysisResponse(
            task_id=existing_job.task_id,
            project_id=project_id,
            message="Analysis already in progress"
        )

    # Build options
    options = {}
    if cli_mode:
        options["cli_mode"] = cli_mode
        options["cli_model"] = cli_model
    elif provider:
        options["provider"] = provider
    if language:
        options["language"] = language

    # Create job
    job = await service.create_analysis_job(
        user_id=user_id,
        project_id=project_id,
        git_url=request.git_url,
        options=options
    )

    await db.commit()

    # Start background analysis task
    asyncio.create_task(run_background_analysis(
        task_id=job.task_id,
        user_id=user_id,
        project_id=project_id,
        git_url=request.git_url,
        github_username=github_username,
        github_token=token,
        options=options
    ))

    return StartAnalysisResponse(
        task_id=job.task_id,
        project_id=project_id,
        message="Analysis started in background"
    )


@router.get("/active-analyses", response_model=AnalysisJobListResponse)
async def get_active_analyses(
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all active analysis jobs for a user."""
    service = AnalysisJobService(db)
    jobs = await service.get_active_jobs_for_user(user_id)

    def _extract_job_status(job):
        """Extract AnalysisJobStatus from Job model."""
        # Extract token usage from output_data
        token_usage = None
        if job.output_data and isinstance(job.output_data, dict):
            token_usage = job.output_data.get("total_tokens")

        # Extract LLM provider from input_data
        llm_provider = None
        if job.input_data and isinstance(job.input_data, dict):
            options = job.input_data.get("options", {})
            llm_provider = options.get("provider") or options.get("cli_mode")

        return AnalysisJobStatus(
            task_id=job.task_id,
            project_id=job.target_project_id,
            status=job.status,
            progress=job.progress,
            current_step=job.current_step,
            total_steps=job.total_steps,
            step_name=job.step_name,
            error_message=job.error_message,
            partial_results=job.partial_results,
            started_at=job.started_at,
            completed_at=job.completed_at,
            created_at=job.created_at,
            token_usage=token_usage,
            llm_provider=llm_provider,
        )

    return AnalysisJobListResponse(
        jobs=[_extract_job_status(job) for job in jobs],
        total=len(jobs)
    )


@router.get("/analysis-status/{project_id}", response_model=Optional[AnalysisJobStatus])
async def get_analysis_status(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get the status of an active analysis job for a project."""
    service = AnalysisJobService(db)
    job = await service.get_job_by_project(project_id)

    if not job:
        return None

    # Verify user owns this job
    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this job")

    # Extract token usage from output_data
    token_usage = None
    if job.output_data and isinstance(job.output_data, dict):
        token_usage = job.output_data.get("total_tokens")

    # Extract LLM provider from input_data
    llm_provider = None
    if job.input_data and isinstance(job.input_data, dict):
        options = job.input_data.get("options", {})
        llm_provider = options.get("provider") or options.get("cli_mode")

    return AnalysisJobStatus(
        task_id=job.task_id,
        project_id=job.target_project_id,
        status=job.status,
        progress=job.progress,
        current_step=job.current_step,
        total_steps=job.total_steps,
        step_name=job.step_name,
        error_message=job.error_message,
        partial_results=job.partial_results,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
        token_usage=token_usage,
        llm_provider=llm_provider,
    )


@router.post("/analysis/{project_id}/cancel", response_model=CancelAnalysisResponse)
async def cancel_analysis(
    project_id: int,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Cancel an in-progress analysis for a project.

    Partial results will be saved if any steps completed.
    """
    service = AnalysisJobService(db)
    job = await service.get_job_by_project(project_id)

    if not job:
        raise HTTPException(status_code=404, detail="No active analysis found for this project")

    # Verify user owns this job
    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this job")

    # Cancel the job
    cancelled_job = await service.cancel_job(job.task_id)
    await db.commit()

    partial_saved = bool(cancelled_job.partial_results)

    return CancelAnalysisResponse(
        task_id=cancelled_job.task_id,
        project_id=project_id,
        status=cancelled_job.status,
        message="Analysis cancelled" + (" with partial results saved" if partial_saved else ""),
        partial_saved=partial_saved
    )


@router.get("/job/{task_id}", response_model=AnalysisJobStatus)
async def get_job_status(
    task_id: str,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get the status of a specific analysis job by task_id."""
    service = AnalysisJobService(db)
    job = await service.get_job(task_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Verify user owns this job
    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this job")

    return AnalysisJobStatus(
        task_id=job.task_id,
        project_id=job.target_project_id,
        status=job.status,
        progress=job.progress,
        current_step=job.current_step,
        total_steps=job.total_steps,
        step_name=job.step_name,
        error_message=job.error_message,
        partial_results=job.partial_results,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
    )
