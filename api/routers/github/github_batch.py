"""GitHub batch operation endpoints.

Handles bulk import and batch analysis of repositories.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from api.database import get_db
from api.models.user import User
from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.schemas.github import (
    ImportReposRequest,
    ImportReposResponse,
    ImportRepoResult,
    BatchAnalysisRequest,
    BatchAnalysisResponse,
    BatchAnalysisResult,
)
from api.services.github import GitHubService
from api.services.github.github_exceptions import (
    GitHubServiceError,
    GitHubRateLimitError,
    GitHubNotFoundError,
    GitHubTimeoutError,
)
from api.services.core import EncryptionService
from api.services.analysis import RoleService
from api.services.core.key_tasks_generator import (
    generate_key_tasks as _generate_key_tasks,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
encryption = EncryptionService()


@router.post("/import-repos", response_model=ImportReposResponse)
async def import_repos_as_projects(
    request: ImportReposRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
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
                    created = datetime.fromisoformat(
                        repo_info["created_at"].replace("Z", "+00:00")
                    )
                    project.start_date = created.date()
                except Exception:
                    pass

            db.add(project)
            await db.flush()

            results.append(
                ImportRepoResult(
                    repo_url=repo_url,
                    project_id=project.id,
                    project_name=project.name,
                    success=True,
                    message="Registered as project.",
                )
            )
            imported += 1

        except GitHubNotFoundError:
            results.append(
                ImportRepoResult(
                    repo_url=repo_url,
                    project_name="",
                    success=False,
                    message="Repository not found.",
                )
            )
            failed += 1
        except GitHubServiceError as e:
            results.append(
                ImportRepoResult(
                    repo_url=repo_url, project_name="", success=False, message=e.message
                )
            )
            failed += 1
        except Exception as e:
            results.append(
                ImportRepoResult(
                    repo_url=repo_url,
                    project_name="",
                    success=False,
                    message=f"Error: {str(e)}",
                )
            )
            failed += 1

    await db.commit()

    return ImportReposResponse(imported=imported, failed=failed, results=results)


@router.post("/analyze-batch", response_model=BatchAnalysisResponse)
async def analyze_batch(
    request: BatchAnalysisRequest,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db),
):
    """Analyze multiple projects in batch (synchronous).

    Supports both API mode (LLMService) and CLI mode (CLILLMService) for LLM operations.
    """
    from api.services.llm import CLILLMService
    from api.services.llm import LLMService

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
    try:
        if request.cli_mode:
            logger.info(
                "[AnalyzeBatch] Using CLI mode: %s, model: %s",
                request.cli_mode,
                request.cli_model,
            )
            llm_service = CLILLMService(request.cli_mode, model=request.cli_model)
            used_provider = f"cli:{request.cli_mode}"
        elif request.llm_provider:
            logger.info("[AnalyzeBatch] Using API mode: %s", request.llm_provider)
            llm_service = LLMService(request.llm_provider)
            used_provider = request.llm_provider
    except ValueError as e:
        # API key not configured - continue without LLM
        logger.warning("[AnalyzeBatch] LLM service not available: %s", e)
    except Exception as e:
        logger.warning("[AnalyzeBatch] Failed to initialize LLM service: %s", e)

    for project_id in request.project_ids:
        project = None
        try:
            # Get project
            proj_result = await db.execute(
                select(Project).where(
                    Project.id == project_id, Project.user_id == user_id
                )
            )
            project = proj_result.scalar_one_or_none()

            if not project:
                results.append(
                    BatchAnalysisResult(
                        project_id=project_id,
                        project_name="Unknown",
                        success=False,
                        message="Project not found.",
                    )
                )
                failed += 1
                continue

            if not project.git_url:
                results.append(
                    BatchAnalysisResult(
                        project_id=project_id,
                        project_name=project.name,
                        success=False,
                        message="GitHub URL not set.",
                    )
                )
                failed += 1
                continue

            # Run analysis
            analysis_result = await github_service.analyze_repository(
                project.git_url, user.github_username
            )

            # Check for existing analysis
            existing = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.project_id == project.id)
            )
            repo_analysis = existing.scalars().first()

            if repo_analysis:
                for key, value in analysis_result.items():
                    setattr(repo_analysis, key, value)
            else:
                repo_analysis = RepoAnalysis(
                    project_id=project.id, git_url=project.git_url, **analysis_result
                )
                db.add(repo_analysis)

            # Auto-detect role
            detected_role = None
            if not project.role:
                detected_role, _ = role_service.detect_role(
                    technologies=analysis_result.get("detected_technologies", []),
                    commit_messages=analysis_result.get("commit_messages", [])[:100],
                )
                project.role = detected_role

            # Mark as analyzed and update status
            project.is_analyzed = 1
            project.status = "completed"

            # Save detected technologies to project
            detected_techs = analysis_result.get("detected_technologies", [])
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
                        is_primary=1
                        if tech_name == analysis_result.get("primary_language")
                        else 0,
                    )
                    db.add(project_tech)

            await db.flush()

            # Generate LLM-based content if LLM service is available
            if llm_service:
                try:
                    # Generate key tasks
                    logger.info(
                        "[AnalyzeBatch] Generating key tasks for %s", project.name
                    )
                    key_tasks, tokens = await _generate_key_tasks(
                        project, repo_analysis, llm_service
                    )
                    if key_tasks:
                        repo_analysis.key_tasks = key_tasks
                        await db.flush()

                    # Generate detailed content
                    project_data = {
                        "name": project.name,
                        "description": project.description,
                        "role": project.role,
                        "start_date": str(project.start_date)
                        if project.start_date
                        else None,
                        "end_date": str(project.end_date) if project.end_date else None,
                    }
                    (
                        detailed_content,
                        content_tokens,
                    ) = await github_service.generate_detailed_content(
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
                        llm_service=llm_service,
                    )
                    if detailed_content:
                        if detailed_content.get("implementation_details"):
                            repo_analysis.implementation_details = detailed_content[
                                "implementation_details"
                            ]
                        if detailed_content.get("development_timeline"):
                            repo_analysis.development_timeline = detailed_content[
                                "development_timeline"
                            ]
                        if detailed_content.get("detailed_achievements"):
                            repo_analysis.detailed_achievements = detailed_content[
                                "detailed_achievements"
                            ]
                        await db.flush()
                except Exception as e:
                    logger.warning(
                        "[AnalyzeBatch] Failed to generate LLM content for %s: %s",
                        project.name,
                        e,
                    )

            results.append(
                BatchAnalysisResult(
                    project_id=project.id,
                    project_name=project.name,
                    success=True,
                    message="Analysis complete"
                    + (f" (LLM: {used_provider})" if used_provider else ""),
                    detected_technologies=analysis_result.get(
                        "detected_technologies", []
                    )[:10],
                    detected_role=detected_role,
                )
            )
            completed += 1

        except GitHubTimeoutError:
            results.append(
                BatchAnalysisResult(
                    project_id=project_id,
                    project_name=project.name if project else "Unknown",
                    success=False,
                    message="GitHub API timeout",
                )
            )
            failed += 1
        except GitHubRateLimitError:
            results.append(
                BatchAnalysisResult(
                    project_id=project_id,
                    project_name=project.name if project else "Unknown",
                    success=False,
                    message="GitHub API rate limit exceeded",
                )
            )
            failed += 1
            # Stop processing on rate limit
            break
        except GitHubServiceError as e:
            results.append(
                BatchAnalysisResult(
                    project_id=project_id,
                    project_name=project.name if project else "Unknown",
                    success=False,
                    message=e.message,
                )
            )
            failed += 1
        except Exception as e:
            results.append(
                BatchAnalysisResult(
                    project_id=project_id,
                    project_name=project.name if project else "Unknown",
                    success=False,
                    message=f"Analysis error: {str(e)}",
                )
            )
            failed += 1

    await db.commit()

    return BatchAnalysisResponse(
        total=len(request.project_ids),
        completed=completed,
        failed=failed,
        results=results,
    )
