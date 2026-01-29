from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Tuple, List, Dict, Any
import httpx

from api.database import get_db
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
    AnalysisContentUpdate, EffectiveAnalysisResponse, EditStatus
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
from api.models.achievement import ProjectAchievement

router = APIRouter()
settings = get_settings()
encryption = EncryptionService()


async def _auto_detect_achievements(
    db: AsyncSession,
    project: Project,
    repo_analysis: RepoAnalysis
) -> int:
    """
    Auto-detect achievements from analysis data and save to DB.
    Returns the number of saved achievements.
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
        use_llm=False
    )

    if not achievements:
        return 0

    # Get existing achievement metric_names for this project to avoid duplicates
    existing_result = await db.execute(
        select(ProjectAchievement.metric_name).where(
            ProjectAchievement.project_id == project.id
        )
    )
    existing_names = set(row[0] for row in existing_result.fetchall())

    # Save new achievements
    saved_count = 0
    for achievement in achievements:
        # Skip if already exists
        if achievement.get("metric_name") in existing_names:
            continue

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
    cli_model: str = None
) -> Tuple[List[str], int]:
    """
    Generate key tasks using LLM based on project analysis.
    Returns a tuple of (list of key tasks, token count).
    Supports both API mode (LLMService) and CLI mode (CLILLMService).
    """
    from api.services.llm_service import LLMService
    from api.services.cli_llm_service import CLILLMService

    try:
        if llm_service is None:
            if cli_mode:
                print(f"[KeyTasks] Using CLI mode: {cli_mode}, model: {cli_model}")
                llm_service = CLILLMService(cli_mode, model=cli_model)
            else:
                llm_service = LLMService()

        print(f"[KeyTasks] LLM service type: {type(llm_service).__name__}")
        if hasattr(llm_service, 'provider_name'):
            print(f"[KeyTasks] Provider name: {llm_service.provider_name}")

        # Build prompt with available information
        technologies = repo_analysis.detected_technologies or []
        commit_summary = repo_analysis.commit_messages_summary or ""
        commit_categories = repo_analysis.commit_categories or {}

        # Build context about what was done
        commit_context = ""
        if commit_categories:
            parts = []
            if commit_categories.get("feature", 0) > 0:
                parts.append(f"신규 기능 개발 {commit_categories['feature']}건")
            if commit_categories.get("fix", 0) > 0:
                parts.append(f"버그 수정 {commit_categories['fix']}건")
            if commit_categories.get("refactor", 0) > 0:
                parts.append(f"리팩토링 {commit_categories['refactor']}건")
            commit_context = ", ".join(parts)

        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 수행 업무 3-5개를 추출해주세요.

프로젝트: {project.name}
설명: {project.description or 'N/A'}
역할: {project.role or '개발자'}
기술 스택: {', '.join(technologies[:10]) if technologies else 'N/A'}
커밋 현황: {commit_context or 'N/A'}
커밋 메시지 요약:
{commit_summary[:500] if commit_summary else 'N/A'}

각 업무는 구체적이고 이력서에 적합한 형태로 작성해주세요.
예시:
- "RESTful API 설계 및 개발"
- "데이터베이스 모델링 및 쿼리 최적화"
- "Spring Security 기반 인증/인가 시스템 구현"
- "React 컴포넌트 설계 및 상태 관리"

JSON 배열 형식으로만 응답하세요:
["업무1", "업무2", "업무3"]
"""

        # Call LLM using unified provider.generate() interface
        # Both LLMService and CLILLMService now support this interface
        response, tokens = await llm_service.provider.generate(
            prompt,
            system_prompt="당신은 개발 프로젝트의 주요 업무를 추출하는 전문가입니다. JSON 배열 형식으로만 응답하세요.",
            max_tokens=500,
            temperature=0.3
        )

        # Parse JSON response
        import json
        json_str = response.strip()
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]

        tasks = json.loads(json_str.strip())

        # Validate that it's a list of strings
        if isinstance(tasks, list) and all(isinstance(t, str) for t in tasks):
            return tasks[:5], tokens  # Limit to 5 tasks

        return [], tokens

    except Exception as e:
        # Log error but don't fail the analysis
        import traceback
        print(f"Failed to generate key tasks: {type(e).__name__}: {e}")
        print(f"[KeyTasks] Traceback: {traceback.format_exc()}")
        return [], 0


@router.get("/connect")
async def github_connect(
    redirect_url: Optional[str] = None,
    frontend_origin: Optional[str] = None,
    is_electron: bool = False
):
    """Initiate GitHub OAuth flow."""
    import json
    import base64
    import logging

    logger = logging.getLogger(__name__)
    logger.info(f"[GitHub Connect] Called with redirect_url={redirect_url}, frontend_origin={frontend_origin}, is_electron={is_electron}")
    logger.info(f"[GitHub Connect] settings.github_client_id={settings.github_client_id}")
    print(f"[GitHub Connect] Called with redirect_url={redirect_url}, frontend_origin={frontend_origin}, is_electron={is_electron}")
    print(f"[GitHub Connect] settings.github_client_id={settings.github_client_id}")

    if not settings.github_client_id:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth not configured. Set GITHUB_CLIENT_ID in environment."
        )

    # Build authorization URL
    scope = "repo,user:email"

    # Encode origin, redirect_path, and electron flag in state
    state_data = {
        "path": redirect_url or "/",
        "origin": frontend_origin,  # Can be None, will use settings.frontend_url as fallback
        "is_electron": is_electron  # Flag to use custom protocol for callback
    }
    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={settings.github_redirect_uri}"
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
    """Handle GitHub OAuth callback."""
    import json
    import base64

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
    user_info = await github_service.get_user_info()

    # Find or create user
    result = await db.execute(
        select(User).where(User.github_username == user_info["login"])
    )
    user = result.scalar_one_or_none()

    if user:
        # Update token
        user.github_token_encrypted = encryption.encrypt(access_token)
        user.github_avatar_url = user_info.get("avatar_url")
        if user_info.get("email"):
            user.email = user_info["email"]
    else:
        # Create new user
        user = User(
            name=user_info.get("name") or user_info["login"],
            email=user_info.get("email"),
            github_username=user_info["login"],
            github_token_encrypted=encryption.encrypt(access_token),
            github_avatar_url=user_info.get("avatar_url")
        )
        db.add(user)

    await db.flush()
    await db.refresh(user)

    # Parse state to get origin, redirect path, and electron flag
    redirect_path = "/"
    frontend_origin = settings.frontend_url  # Default fallback
    is_electron = False

    if state:
        try:
            # Try to decode as JSON (new format)
            state_data = json.loads(base64.urlsafe_b64decode(state).decode())
            redirect_path = state_data.get("path", "/")
            if state_data.get("origin"):
                frontend_origin = state_data["origin"]
            is_electron = state_data.get("is_electron", False)
        except Exception:
            # Fallback: old format (plain redirect path)
            redirect_path = state

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
                "message": "GitHub 토큰이 만료되었거나 유효하지 않습니다. 다시 연동해주세요."
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
):
    """Analyze a GitHub repository.

    Uses separate sessions for each phase to prevent SQLite lock issues during long operations.
    Does NOT use Depends(get_db) to avoid session lifecycle issues.
    """
    from api.services.llm_service import LLMService
    from api.services.cli_llm_service import CLILLMService
    from api.database import AsyncSessionLocal

    # ===== PHASE 1: Get user and project info =====
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user or not user.github_token_encrypted:
            raise HTTPException(status_code=400, detail="GitHub이 연결되지 않았습니다. 먼저 GitHub 연동을 해주세요.")

        try:
            token = encryption.decrypt(user.github_token_encrypted)
            github_username = user.github_username
        except Exception:
            raise HTTPException(status_code=400, detail="GitHub 토큰이 손상되었습니다. 다시 연동해주세요.")

        project_id = request.project_id
        if project_id:
            proj_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = proj_result.scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
        else:
            # Need to create project, but first get repo info
            project_id = None  # Will create after getting repo info

        await db.commit()
    print(f"[Analyze] Phase 1 complete: user validated, project_id={project_id}")

    # Initialize services (outside of DB session)
    github_service = GitHubService(token)
    total_tokens = 0
    used_provider = None
    llm_service = None
    llm_init_error = None
    try:
        if cli_mode:
            print(f"[Analyze] Using CLI mode: {cli_mode}, model: {cli_model}")
            llm_service = CLILLMService(cli_mode, model=cli_model)
            used_provider = f"cli:{cli_mode}"
        elif provider:
            print(f"[Analyze] Using API mode: {provider}")
            llm_service = LLMService(provider)
            used_provider = llm_service.provider_name
        else:
            # Try default provider from settings
            print(f"[Analyze] Using default LLM provider from settings")
            llm_service = LLMService()
            used_provider = llm_service.provider_name
    except ValueError as e:
        # API key not configured - continue without LLM
        llm_init_error = str(e)
        print(f"[Analyze] LLM service not available: {e}")
    except Exception as e:
        llm_init_error = str(e)
        print(f"[Analyze] Failed to initialize LLM service: {e}")

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
            print(f"[Analyze] Phase 2 complete: created project_id={project_id}")

        # ===== PHASE 3: Run GitHub analysis (long HTTP operation - no DB connection) =====
        print(f"[Analyze] Starting analyze_repository for {request.git_url}...")
        analysis_result = await github_service.analyze_repository(
            request.git_url,
            github_username
        )
        print(f"[Analyze] Phase 3 complete: detected {len(analysis_result.get('detected_technologies', []))} technologies")

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

            # Auto-detect achievements
            try:
                await _auto_detect_achievements(db, project, repo_analysis)
            except Exception as e:
                print(f"Failed to auto-detect achievements: {e}")

            await db.commit()
            await db.refresh(repo_analysis)
            analysis_id = repo_analysis.id
        print(f"[Analyze] Phase 4 complete: analysis saved, id={analysis_id}")

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
                project_start_date = str(project.start_date) if project.start_date else None
                project_end_date = str(project.end_date) if project.end_date else None
                commit_messages_summary = repo_analysis.commit_messages_summary
                detected_technologies = repo_analysis.detected_technologies
                commit_categories = repo_analysis.commit_categories
                total_commits = repo_analysis.total_commits
                lines_added = repo_analysis.lines_added
                lines_deleted = repo_analysis.lines_deleted
                files_changed = repo_analysis.files_changed

            # Generate key tasks using LLM (outside DB session)
            key_tasks = None
            try:
                print(f"[Analyze] Generating key tasks with {type(llm_service).__name__}")
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

                key_tasks, tokens = await _generate_key_tasks(
                    MinimalProject(), MinimalAnalysis(), llm_service
                )
                total_tokens += tokens
            except Exception as e:
                import traceback
                print(f"[Analyze] Failed to generate key tasks: {type(e).__name__}: {e}")
                print(f"[Analyze] Traceback: {traceback.format_exc()}")

            # Generate detailed content (outside DB session)
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
                    llm_service=llm_service
                )
                total_tokens += content_tokens
            except Exception as e:
                print(f"Failed to generate detailed content: {e}")

            # Save LLM results (new session)
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

                await db.commit()
            print(f"[Analyze] Phase 5 complete: LLM content saved")

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
            print(f"Failed to extract tech versions: {e}")

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
                analyzed_at=repo_analysis.analyzed_at,
                provider=used_provider,
                token_usage=total_tokens if total_tokens > 0 else None
            )
            return response

    except GitHubTimeoutError as e:
        raise HTTPException(status_code=504, detail=e.message)
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=e.message)
    except GitHubNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"레포지토리를 찾을 수 없습니다: {request.git_url}")
    except GitHubAuthError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"잘못된 GitHub URL입니다: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류가 발생했습니다: {str(e)}")


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
        analyzed_at=analysis.analyzed_at
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

    print(f"[TestCLI] Starting test with cli_mode={cli_mode}, cli_model={cli_model}", flush=True)
    try:
        cli_service = CLILLMService(cli_mode, model=cli_model)
        print(f"[TestCLI] Created CLILLMService", flush=True)
        response, tokens = await cli_service.provider.generate(
            "Say 'Hello! CLI is working.' in one short sentence.",
            max_tokens=50,
            temperature=0.1
        )
        print(f"[TestCLI] Got response, tokens={tokens}", flush=True)
        return {
            "provider": cli_service.provider_name,
            "status": "success",
            "response": response,
            "token_usage": tokens
        }
    except Exception as e:
        import traceback
        print(f"[TestCLI] Error: {type(e).__name__}: {e}", flush=True)
        print(f"[TestCLI] Traceback: {traceback.format_exc()}", flush=True)
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
        raise HTTPException(status_code=400, detail="GitHub이 연결되지 않았습니다.")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub 토큰이 손상되었습니다. 다시 연동해주세요.")

    github_service = GitHubService(token)

    try:
        technologies = await github_service.detect_technologies(git_url)
        return {"technologies": technologies}
    except GitHubTimeoutError as e:
        raise HTTPException(status_code=504, detail=e.message)
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=e.message)
    except GitHubNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"레포지토리를 찾을 수 없습니다: {git_url}")
    except GitHubAuthError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"잘못된 GitHub URL입니다: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기술 스택 감지 중 오류: {str(e)}")


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
        raise HTTPException(status_code=400, detail="GitHub이 연결되지 않았습니다.")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub 토큰이 손상되었습니다.")

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
                    message="이미 등록된 레포지토리입니다."
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
                message="프로젝트로 등록되었습니다."
            ))
            imported += 1

        except GitHubNotFoundError:
            results.append(ImportRepoResult(
                repo_url=repo_url,
                project_name="",
                success=False,
                message="레포지토리를 찾을 수 없습니다."
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
                message=f"오류: {str(e)}"
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
        raise HTTPException(status_code=400, detail="GitHub이 연결되지 않았습니다.")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub 토큰이 손상되었습니다.")

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
            print(f"[AnalyzeBatch] Using CLI mode: {request.cli_mode}, model: {request.cli_model}")
            llm_service = CLILLMService(request.cli_mode, model=request.cli_model)
            used_provider = f"cli:{request.cli_mode}"
        elif request.llm_provider:
            print(f"[AnalyzeBatch] Using API mode: {request.llm_provider}")
            llm_service = LLMService(request.llm_provider)
            used_provider = request.llm_provider
    except ValueError as e:
        # API key not configured - continue without LLM
        llm_init_error = str(e)
        print(f"[AnalyzeBatch] LLM service not available: {e}")
    except Exception as e:
        llm_init_error = str(e)
        print(f"[AnalyzeBatch] Failed to initialize LLM service: {e}")

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
                    message="프로젝트를 찾을 수 없습니다."
                ))
                failed += 1
                continue

            if not project.git_url:
                results.append(BatchAnalysisResult(
                    project_id=project_id,
                    project_name=project.name,
                    success=False,
                    message="GitHub URL이 없습니다."
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
                    print(f"[AnalyzeBatch] Generating key tasks for {project.name}")
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
                    print(f"[AnalyzeBatch] Failed to generate LLM content for {project.name}: {e}")

            results.append(BatchAnalysisResult(
                project_id=project.id,
                project_name=project.name,
                success=True,
                message="분석 완료" + (f" (LLM: {used_provider})" if used_provider else ""),
                detected_technologies=analysis_result.get('detected_technologies', [])[:10],
                detected_role=detected_role
            ))
            completed += 1

        except GitHubTimeoutError:
            results.append(BatchAnalysisResult(
                project_id=project_id,
                project_name=project.name if project else "Unknown",
                success=False,
                message="GitHub API 응답 시간 초과"
            ))
            failed += 1
        except GitHubRateLimitError:
            results.append(BatchAnalysisResult(
                project_id=project_id,
                project_name=project.name if project else "Unknown",
                success=False,
                message="GitHub API 요청 한도 초과"
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
                message=f"분석 오류: {str(e)}"
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
        "message": f"{update.field} 내용이 저장되었습니다."
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
            "message": "수정된 내용이 없습니다."
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
        "message": f"{field} 내용이 원본으로 복원되었습니다."
    }
