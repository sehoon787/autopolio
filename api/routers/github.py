from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import httpx

from api.database import get_db
from api.config import get_settings
from api.models.user import User
from api.models.project import Project
from api.models.repo_analysis import RepoAnalysis
from api.schemas.github import (
    GitHubConnectRequest, GitHubCallbackResponse,
    RepoAnalysisRequest, RepoAnalysisResponse,
    GitHubRepoListResponse, GitHubRepoInfo
)
from api.services.github_service import GitHubService
from api.services.encryption_service import EncryptionService

router = APIRouter()
settings = get_settings()
encryption = EncryptionService()


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
    async with httpx.AsyncClient() as client:
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
    redirect_url = state or "/"
    frontend_url = f"http://localhost:5173{redirect_url}?user_id={user.id}&github_connected=true"

    return RedirectResponse(url=frontend_url)


@router.get("/repos", response_model=GitHubRepoListResponse)
async def get_user_repos(
    user_id: int = Query(..., description="User ID"),
    page: int = 1,
    per_page: int = 30,
    db: AsyncSession = Depends(get_db)
):
    """Get user's GitHub repositories."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    repos = await github_service.get_user_repos(page=page, per_page=per_page)

    return {
        "repos": repos,
        "total": len(repos)
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
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    # Get or create project
    if request.project_id:
        proj_result = await db.execute(
            select(Project).where(Project.id == request.project_id)
        )
        project = proj_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
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

    # Mark project as analyzed
    project.is_analyzed = 1
    project.git_url = request.git_url

    await db.flush()
    await db.refresh(repo_analysis)

    return repo_analysis


@router.get("/analysis/{project_id}", response_model=RepoAnalysisResponse)
async def get_repo_analysis(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get repository analysis for a project."""
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return analysis


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
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        technologies = await github_service.detect_technologies(git_url)
        return {"technologies": technologies}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to detect technologies: {str(e)}")


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
