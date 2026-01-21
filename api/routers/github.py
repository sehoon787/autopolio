from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import httpx

from api.database import get_db
from api.config import get_settings
from api.models.user import User
from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.schemas.github import (
    GitHubConnectRequest, GitHubCallbackResponse,
    RepoAnalysisRequest, RepoAnalysisResponse,
    GitHubRepoListResponse, GitHubRepoInfo,
    ImportReposRequest, ImportReposResponse, ImportRepoResult,
    BatchAnalysisRequest, BatchAnalysisResponse, BatchAnalysisResult
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
    repo_analysis: RepoAnalysis
) -> list:
    """
    Generate key tasks using LLM based on project analysis.
    Returns a list of key tasks.
    """
    from api.services.llm_service import LLMService

    try:
        llm_service = LLMService()

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

        response = await llm_service.provider.generate(
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
            return tasks[:5]  # Limit to 5 tasks

        return []

    except Exception as e:
        # Log error but don't fail the analysis
        print(f"Failed to generate key tasks: {e}")
        return []


@router.get("/connect")
async def github_connect(redirect_url: Optional[str] = None):
    """Initiate GitHub OAuth flow."""
    if not settings.github_client_id:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth not configured. Set GITHUB_CLIENT_ID in environment."
        )

    # Build authorization URL
    scope = "repo,user:email"
    state = redirect_url or "/"  # Use state to pass redirect URL

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

    # Redirect to frontend with user info
    redirect_path = state or "/"
    frontend_url = f"{settings.frontend_url}{redirect_path}?user_id={user.id}&github_connected=true"

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
    db: AsyncSession = Depends(get_db)
):
    """Analyze a GitHub repository."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub이 연결되지 않았습니다. 먼저 GitHub 연동을 해주세요.")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub 토큰이 손상되었습니다. 다시 연동해주세요.")

    github_service = GitHubService(token)

    try:
        # Get or create project
        if request.project_id:
            proj_result = await db.execute(
                select(Project).where(Project.id == request.project_id)
            )
            project = proj_result.scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
        else:
            # Create new project from repo
            repo_info = await github_service.get_repo_info(request.git_url)
            project = Project(
                user_id=user_id,
                name=repo_info["name"],
                description=repo_info.get("description"),
                git_url=request.git_url,
                project_type="personal"
            )
            db.add(project)
            await db.flush()

        # Run analysis
        analysis_result = await github_service.analyze_repository(
            request.git_url,
            user.github_username
        )

        # Check for existing analysis
        existing = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == project.id)
        )
        repo_analysis = existing.scalar_one_or_none()

        if repo_analysis:
            # Update existing
            for key, value in analysis_result.items():
                setattr(repo_analysis, key, value)
        else:
            # Create new
            repo_analysis = RepoAnalysis(
                project_id=project.id,
                git_url=request.git_url,
                **analysis_result
            )
            db.add(repo_analysis)

        # Auto-detect role if not already set
        if not project.role:
            role_service = RoleService()
            detected_role, _ = role_service.detect_role(
                technologies=analysis_result.get('detected_technologies', []),
                commit_messages=analysis_result.get('commit_messages', [])[:100],  # Limit to 100 messages
            )
            project.role = detected_role

        # Mark project as analyzed
        project.is_analyzed = 1
        project.git_url = request.git_url

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
        await db.refresh(repo_analysis)

        # Auto-detect achievements from analysis data
        try:
            await _auto_detect_achievements(db, project, repo_analysis)
        except Exception as e:
            # Log but don't fail the analysis
            print(f"Failed to auto-detect achievements: {e}")

        # Generate key tasks using LLM
        try:
            key_tasks = await _generate_key_tasks(project, repo_analysis)
            if key_tasks:
                repo_analysis.key_tasks = key_tasks
                await db.flush()
                await db.refresh(repo_analysis)
        except Exception as e:
            # Log but don't fail the analysis
            print(f"Failed to generate key tasks: {e}")

        # Extract technology versions from package files
        try:
            tech_versions = await github_service.extract_tech_versions(request.git_url)
            if tech_versions:
                repo_analysis.tech_stack_versions = tech_versions
        except Exception as e:
            print(f"Failed to extract tech versions: {e}")

        # Generate LLM-based detailed content (implementation_details, timeline, achievements)
        try:
            project_data = {
                "name": project.name,
                "description": project.description,
                "role": project.role,
                "start_date": str(project.start_date) if project.start_date else None,
                "end_date": str(project.end_date) if project.end_date else None,
            }
            detailed_content = await github_service.generate_detailed_content(
                project_data=project_data,
                analysis_data={
                    "commit_messages_summary": repo_analysis.commit_messages_summary,
                    "detected_technologies": repo_analysis.detected_technologies,
                    "commit_categories": repo_analysis.commit_categories,
                    "total_commits": repo_analysis.total_commits,
                    "lines_added": repo_analysis.lines_added,
                    "lines_deleted": repo_analysis.lines_deleted,
                    "files_changed": repo_analysis.files_changed,
                }
            )
            if detailed_content:
                if detailed_content.get("implementation_details"):
                    repo_analysis.implementation_details = detailed_content["implementation_details"]
                if detailed_content.get("development_timeline"):
                    repo_analysis.development_timeline = detailed_content["development_timeline"]
                if detailed_content.get("detailed_achievements"):
                    repo_analysis.detailed_achievements = detailed_content["detailed_achievements"]
        except Exception as e:
            print(f"Failed to generate detailed content: {e}")

        await db.flush()
        await db.refresh(repo_analysis)

        return repo_analysis

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

    return {"message": "GitHub disconnected successfully"}


@router.get("/test-llm")
async def test_llm():
    """Test LLM provider connection."""
    from api.services.llm_service import LLMService

    try:
        llm_service = LLMService()
        response = await llm_service.provider.generate(
            "Say 'Hello! LLM is working.' in one short sentence.",
            max_tokens=50,
            temperature=0.1
        )
        return {
            "provider": llm_service.provider_name,
            "status": "success",
            "response": response
        }
    except Exception as e:
        return {
            "provider": settings.llm_provider,
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

        response = await llm_service.provider.generate(
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
            "technologies": technologies[:20]
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
    """Analyze multiple projects in batch (synchronous)."""
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

            results.append(BatchAnalysisResult(
                project_id=project.id,
                project_name=project.name,
                success=True,
                message="분석 완료",
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
