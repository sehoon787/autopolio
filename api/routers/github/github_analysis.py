"""GitHub analysis endpoints.

Handles repository analysis, AI description generation, and LLM testing.
"""

import asyncio
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import httpx

from api.database import get_db, AsyncSessionLocal
from api.config import get_settings
from api.models.user import User
from api.models.project import Project
from api.models.repo_analysis import RepoAnalysis
from api.schemas.github import RepoAnalysisRequest, RepoAnalysisResponse
from api.services.github import GitHubService
from api.services.github.github_exceptions import (
    GitHubServiceError,
    GitHubRateLimitError,
    GitHubNotFoundError,
    GitHubTimeoutError,
    GitHubAuthError,
)
from api.services.core import EncryptionService
from api.constants import SummaryStyle
from api.services.analysis import (
    AnalysisWorkflowError,
    phase1_validate_user,
    phase2_create_project_if_needed,
    phase3_run_github_analysis,
    phase4_save_analysis,
    phase5_collect_code_contributions,
    phase5_generate_key_tasks,
    phase5_generate_detailed_content,
    phase5_generate_ai_summary,
    phase5_save_llm_results,
    phase6_extract_tech_versions,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
settings = get_settings()
encryption = EncryptionService()


@router.post("/analyze", response_model=RepoAnalysisResponse)
async def analyze_repository(
    request: RepoAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    provider: Optional[str] = Query(None, description="LLM provider to use"),
    cli_mode: Optional[str] = Query(
        None, description="CLI mode: 'claude_code', 'gemini_cli', or 'codex_cli'"
    ),
    cli_model: Optional[str] = Query(None, description="CLI model name"),
    language: Optional[str] = Query(
        None, description="Analysis output language: 'ko' or 'en'"
    ),
    project_repository_id: Optional[int] = Query(
        None, description="Specific ProjectRepository to analyze"
    ),
):
    """Analyze a GitHub repository.

    Uses the analysis_workflow service for multi-phase analysis.
    Supports both synchronous API providers and CLI-based LLM tools.

    Args:
        request: Analysis request with git_url and optional project_id
        user_id: User ID
        provider: LLM provider ("openai", "anthropic", "gemini")
        cli_mode: CLI mode ("claude_code", "gemini_cli")
        cli_model: CLI model name
        language: Output language for analysis ("ko" or "en"). Defaults to user's preferred_language.
    """
    from api.services.llm import LLMService
    from api.services.llm import CLILLMService

    try:
        # ===== PHASE 1: Validate user and get context =====
        async with AsyncSessionLocal() as db:
            ctx = await phase1_validate_user(db, user_id, request.project_id, language)
            await db.commit()

        # Get summary style from request or default
        ctx.summary_style = request.summary_style or SummaryStyle.PROFESSIONAL
        ctx.project_repository_id = project_repository_id

        # Initialize LLM service (prefer user's stored API key, then .env fallback)
        try:
            effective_provider = provider or settings.llm_provider
            user_key = ctx.user_api_keys.get(effective_provider)
            if cli_mode:
                logger.info(
                    "[Analyze] Using CLI mode: %s, model: %s", cli_mode, cli_model
                )
                ctx.llm_service = CLILLMService(cli_mode, model=cli_model)
                ctx.used_provider = f"cli:{cli_mode}"
            elif provider:
                logger.info(
                    "[Analyze] Using API mode: %s, has_user_key: %s",
                    provider,
                    bool(user_key),
                )
                ctx.llm_service = LLMService(provider, api_key=user_key)
                ctx.used_provider = ctx.llm_service.provider_name
            else:
                logger.info(
                    "[Analyze] Using default LLM provider from settings, has_user_key: %s",
                    bool(user_key),
                )
                ctx.llm_service = LLMService(api_key=user_key)
                ctx.used_provider = ctx.llm_service.provider_name
        except (ValueError, Exception) as e:
            logger.warning("[Analyze] LLM service not available: %s", e)
            ctx.llm_service = None

        # ===== PHASE 2: Create project if needed =====
        async with AsyncSessionLocal() as db:
            await phase2_create_project_if_needed(db, ctx, request.git_url)
            await db.commit()

        # ===== PHASE 3: Run GitHub analysis =====
        await phase3_run_github_analysis(ctx)

        # ===== PHASE 4: Save analysis results =====
        async with AsyncSessionLocal() as db:
            await phase4_save_analysis(db, ctx)
            await db.commit()

        # ===== PHASE 5: LLM operations =====
        if ctx.llm_service:
            # 5.1: Collect code contributions
            await phase5_collect_code_contributions(ctx)

            # Get project data for LLM calls
            async with AsyncSessionLocal() as db:
                proj_result = await db.execute(
                    select(Project).where(Project.id == ctx.project_id)
                )
                project = proj_result.scalar_one_or_none()
                project_name = project.name if project else ""
                project_description = project.description if project else None
                project_role = project.role if project else None
                project_team_size = project.team_size if project else None
                project_contribution_percent = (
                    project.contribution_percent if project else None
                )
                project_start_date = (
                    str(project.start_date) if project and project.start_date else None
                )
                project_end_date = (
                    str(project.end_date) if project and project.end_date else None
                )

            # 5.2 + 5.3: Generate key tasks AND detailed content in PARALLEL
            # These are independent — running concurrently saves ~15s on CLI mode
            project_data = {
                "name": project_name,
                "description": project_description,
                "role": project_role,
                "start_date": project_start_date,
                "end_date": project_end_date,
            }

            _parallel_start = time.time()
            await asyncio.gather(
                phase5_generate_key_tasks(
                    ctx, project_name, project_description, project_role
                ),
                phase5_generate_detailed_content(ctx, project_data),
            )
            _parallel_elapsed = time.time() - _parallel_start
            logger.info(
                "[Analyze] Steps 5.2+5.3 parallel completed in %.1fs", _parallel_elapsed
            )

            # 5.4: Generate AI summary (depends on key_tasks from 5.2)
            summary_project_data = {
                "name": project_name,
                "description": project_description,
                "role": project_role,
                "team_size": project_team_size,
                "contribution_percent": project_contribution_percent,
                "technologies": ctx.analysis_result.get("detected_technologies", []),
                "start_date": project_start_date,
                "end_date": project_end_date,
                "total_commits": ctx.analysis_result.get("total_commits", 0),
                "commit_summary": ctx.analysis_result.get("commit_messages_summary"),
            }
            await phase5_generate_ai_summary(ctx, summary_project_data)

            # 5.5: Save LLM results
            async with AsyncSessionLocal() as db:
                await phase5_save_llm_results(db, ctx)
                await db.commit()

        # ===== PHASE 6: Extract tech versions =====
        async with AsyncSessionLocal() as db:
            await phase6_extract_tech_versions(db, ctx)
            await db.commit()

        # ===== Build and return response =====
        async with AsyncSessionLocal() as db:
            analysis_result_db = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.id == ctx.analysis_id)
            )
            repo_analysis = analysis_result_db.scalar_one_or_none()

            return RepoAnalysisResponse(
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
                ai_summary=repo_analysis.ai_summary,
                ai_key_features=repo_analysis.ai_key_features,
                user_code_contributions=repo_analysis.user_code_contributions,
                analyzed_at=repo_analysis.analyzed_at,
                provider=ctx.used_provider,
                token_usage=ctx.total_tokens if ctx.total_tokens > 0 else None,
                suggested_contribution_percent=repo_analysis.suggested_contribution_percent,
                analysis_language=repo_analysis.analysis_language or "ko",
            )

    except AnalysisWorkflowError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except GitHubTimeoutError as e:
        raise HTTPException(status_code=504, detail=e.message)
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=e.message)
    except GitHubNotFoundError:
        raise HTTPException(
            status_code=404, detail=f"Repository not found: {request.git_url}"
        )
    except GitHubAuthError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid GitHub URL: {str(e)}")
    except Exception as e:
        logger.exception("[Analyze] Unexpected error")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


def _build_analysis_response(analysis: RepoAnalysis) -> RepoAnalysisResponse:
    """Build RepoAnalysisResponse from ORM object."""
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
        ai_summary=analysis.ai_summary,
        ai_key_features=analysis.ai_key_features,
        analysis_language=analysis.analysis_language or "ko",
        user_code_contributions=analysis.user_code_contributions,
        suggested_contribution_percent=analysis.suggested_contribution_percent,
    )


@router.get("/analysis/{project_id}", response_model=RepoAnalysisResponse)
async def get_repo_analysis(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get repository analysis for a project (returns the primary/first one)."""
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analysis = result.scalars().first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return _build_analysis_response(analysis)


@router.get("/analyses/{project_id}")
async def get_repo_analyses(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get all repository analyses for a project (multi-repo support)."""
    result = await db.execute(
        select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
    )
    analyses = result.scalars().all()

    return [_build_analysis_response(a) for a in analyses]


@router.post("/generate-description")
async def generate_description(
    request: RepoAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Generate AI-powered description for a repository using README and detected technologies."""
    from api.services.llm import LLMService
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
                        headers=github_service.headers,
                    )
                    if response.status_code == 200:
                        data = response.json()
                        if "content" in data:
                            readme_content = base64.b64decode(data["content"]).decode(
                                "utf-8"
                            )
                            break
            except Exception:
                continue

        # Detect technologies
        technologies = await github_service.detect_technologies(request.git_url)

        # Generate description using LLM
        llm_service = LLMService()

        prompt = f"""다음 GitHub 레포지토리 정보를 바탕으로 포트폴리오용 설명을 작성해주세요.

레포지토리 이름: {repo_info.get("name", repo)}
GitHub 설명: {repo_info.get("description", "없음")}
주요 언어: {repo_info.get("language", "없음")}
감지된 기술: {", ".join(technologies[:15]) if technologies else "없음"}

README 내용 (일부):
{readme_content[:3000] if readme_content else "없음"}

다음 형식으로 응답해주세요:
1. 간단 설명 (1-2문장, 50자 이내)
2. 상세 설명 (3-5문장, 프로젝트의 목적, 주요 기능, 기술적 특징을 포함)

응답 형식:
간단 설명: [간단 설명 내용]
상세 설명: [상세 설명 내용]"""

        response, tokens = await llm_service.provider.generate(
            prompt, max_tokens=500, temperature=0.7
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
            "provider": llm_service.provider_name,
        }

    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to generate description: {str(e)}"
        )


@router.get("/test-llm")
async def test_llm():
    """Test LLM provider connection."""
    from api.services.llm import LLMService

    try:
        llm_service = LLMService()
        response, tokens = await llm_service.provider.generate(
            "Say 'Hello! LLM is working.' in one short sentence.",
            max_tokens=50,
            temperature=0.1,
        )
        return {
            "provider": llm_service.provider_name,
            "status": "success",
            "response": response,
            "token_usage": tokens,
        }
    except Exception as e:
        return {"provider": settings.llm_provider, "status": "error", "error": str(e)}


@router.get("/test-cli")
async def test_cli(
    cli_mode: str = Query(
        "claude_code",
        description="CLI mode: 'claude_code', 'gemini_cli', or 'codex_cli'",
    ),
    cli_model: Optional[str] = Query(None, description="CLI model name"),
):
    """Test CLI LLM provider connection."""
    from api.services.llm import CLILLMService

    logger.info(
        "[TestCLI] Starting test with cli_mode=%s, cli_model=%s", cli_mode, cli_model
    )
    try:
        cli_service = CLILLMService(cli_mode, model=cli_model)
        logger.debug("[TestCLI] Created CLILLMService")
        response, tokens = await cli_service.provider.generate(
            "Say 'Hello! CLI is working.' in one short sentence.",
            max_tokens=50,
            temperature=0.1,
        )
        logger.debug("[TestCLI] Got response, tokens=%d", tokens)
        return {
            "provider": cli_service.provider_name,
            "status": "success",
            "response": response,
            "token_usage": tokens,
        }
    except Exception as e:
        import traceback

        logger.error("[TestCLI] Error: %s: %s", type(e).__name__, e)
        logger.debug("[TestCLI] Traceback: %s", traceback.format_exc())
        return {"provider": f"cli:{cli_mode}", "status": "error", "error": str(e)}
