"""
Analysis Job Runner - Background analysis execution.
"""
import json
import logging
import traceback
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime

from sqlalchemy import select

from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.achievement import ProjectAchievement
from api.models.contributor_analysis import ContributorAnalysis
from .role_service import RoleService
from api.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


class AnalysisCancelledException(Exception):
    """Raised when analysis is cancelled by user."""
    pass


async def run_background_analysis(
    task_id: str,
    user_id: int,
    project_id: int,
    git_url: str,
    github_username: str,
    github_token: str,
    options: Optional[Dict[str, Any]] = None
) -> None:
    """
    Run analysis in background with step-by-step progress tracking.
    This function is designed to be called via asyncio.create_task().
    """
    from api.services.llm import LLMService
    from api.services.llm import CLILLMService
    from api.services.github import GitHubService
    from api.services.achievement import AchievementService
    from .analysis_job_crud import AnalysisJobService

    logger.info("[BackgroundAnalysis] Starting for task_id=%s, project_id=%d", task_id, project_id)

    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)

        # Mark job as running
        job = await service.get_job(task_id)
        if not job:
            logger.error("[BackgroundAnalysis] Job not found: %s", task_id)
            return

        job.status = "running"
        job.started_at = datetime.utcnow()
        await db.commit()

    github_service = GitHubService(github_token)
    role_service = RoleService()
    options = options or {}
    total_tokens = 0
    language = options.get("language", "ko")  # Default to Korean
    summary_style = options.get("summary_style", "professional")  # Default to professional

    logger.info("[BackgroundAnalysis] language=%s, options=%s", language, options)

    # Initialize LLM service
    llm_service = None
    try:
        cli_mode = options.get("cli_mode")
        cli_model = options.get("cli_model")
        provider = options.get("provider")

        if cli_mode:
            llm_service = CLILLMService(cli_mode, model=cli_model)
        elif provider:
            llm_service = LLMService(provider)
        else:
            llm_service = LLMService()
        logger.info("[BackgroundAnalysis] LLM: cli_mode=%s, provider=%s", cli_mode, provider)
    except Exception as e:
        logger.warning("[BackgroundAnalysis] LLM service not available: %s", e)

    # Create a fresh service instance for step updates
    async with AsyncSessionLocal() as db:
        service = AnalysisJobService(db)

    try:
        # Step 1: Repository info
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 1, "running")
        logger.info("[BackgroundAnalysis] Step 1: Repository info")

        analysis_result = await github_service.analyze_repository(git_url, github_username)

        step1_result = {
            "total_commits": analysis_result.get("total_commits", 0),
            "user_commits": analysis_result.get("user_commits", 0),
            "lines_added": analysis_result.get("lines_added", 0),
            "lines_deleted": analysis_result.get("lines_deleted", 0),
            "files_changed": analysis_result.get("files_changed", 0),
            "languages": analysis_result.get("languages", {}),
            "primary_language": analysis_result.get("primary_language"),
        }
        await service.update_step_progress(task_id, 1, "completed", step1_result)

        # Step 2: Technology detection (already done in analyze_repository)
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 2, "running")
        logger.info("[BackgroundAnalysis] Step 2: Technology detection")

        step2_result = {
            "technologies": analysis_result.get("detected_technologies", []),
        }
        await service.update_step_progress(task_id, 2, "completed", step2_result)

        # Step 3: Commit analysis
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 3, "running")
        logger.info("[BackgroundAnalysis] Step 3: Commit analysis")

        step3_result = {
            "summary": analysis_result.get("commit_messages_summary"),
            "categories": analysis_result.get("commit_categories", {}),
        }
        await service.update_step_progress(task_id, 3, "completed", step3_result)

        # Step 4: Role detection
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        await service.update_step_progress(task_id, 4, "running")
        logger.info("[BackgroundAnalysis] Step 4: Role detection")

        detected_role, _ = role_service.detect_role(
            technologies=analysis_result.get("detected_technologies", []),
            commit_messages=analysis_result.get("commit_messages", [])[:100],
        )

        step4_result = {"detected_role": detected_role}
        await service.update_step_progress(task_id, 4, "completed", step4_result)

        # Save basic results to DB
        async with AsyncSessionLocal() as db:
            # Get project
            proj_result = await db.execute(select(Project).where(Project.id == project_id))
            project = proj_result.scalar_one_or_none()

            if not project:
                raise ValueError(f"Project not found: {project_id}")

            # Get or create repo analysis
            analysis_db_result = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
            )
            repo_analysis = analysis_db_result.scalar_one_or_none()

            if repo_analysis:
                for key, value in analysis_result.items():
                    if hasattr(repo_analysis, key):
                        setattr(repo_analysis, key, value)
            else:
                repo_analysis = RepoAnalysis(
                    project_id=project_id,
                    git_url=git_url,
                    **analysis_result
                )
                db.add(repo_analysis)

            # Update project
            if not project.role and detected_role:
                project.role = detected_role
            project.is_analyzed = 1
            project.git_url = git_url

            # Save technologies
            detected_techs = analysis_result.get("detected_technologies", [])
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
                        is_primary=1 if tech_name == analysis_result.get("primary_language") else 0
                    )
                    db.add(project_tech)

            # Auto-detect achievements
            try:
                achievement_service = AchievementService(llm_provider=None)
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
                commit_messages = []
                if repo_analysis.commit_messages_summary:
                    commit_messages = repo_analysis.commit_messages_summary.split("\n")

                achievements, _ = await achievement_service.detect_all(
                    project_data=project_data,
                    commit_messages=commit_messages,
                    use_llm=False,
                    language=language
                )

                if achievements:
                    # Delete existing achievements to avoid language mixing
                    await db.execute(
                        ProjectAchievement.__table__.delete().where(
                            ProjectAchievement.project_id == project_id
                        )
                    )
                    for achievement in achievements:
                        db.add(ProjectAchievement(
                            project_id=project_id,
                            metric_name=achievement.get("metric_name", ""),
                            metric_value=achievement.get("metric_value", ""),
                            description=achievement.get("description"),
                            category=achievement.get("category"),
                            evidence=achievement.get("evidence"),
                        ))
                    logger.info("[BackgroundAnalysis] Saved %d achievements", len(achievements))
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to auto-detect achievements: %s", e)

            await db.commit()
            analysis_id = repo_analysis.id

        # Step 5: LLM key tasks
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        key_tasks = []
        if llm_service:
            await service.update_step_progress(task_id, 5, "running")
            logger.info("[BackgroundAnalysis] Step 5: LLM key tasks (language=%s)", language)

            try:
                key_tasks, tokens = await _generate_key_tasks_bg(
                    project_id, analysis_result, llm_service, language
                )
                total_tokens += tokens
                logger.info("[BackgroundAnalysis] Generated %d key tasks, tokens=%d", len(key_tasks), tokens)
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to generate key tasks: %s", e)
        else:
            logger.warning("[BackgroundAnalysis] Skipping Step 5: llm_service is None")

        step5_result = {"tasks": key_tasks}
        await service.update_step_progress(task_id, 5, "completed", step5_result)

        # Step 6: LLM detailed content
        if await service.check_cancelled(task_id):
            raise AnalysisCancelledException()

        detailed_content = {}
        if llm_service:
            await service.update_step_progress(task_id, 6, "running")
            logger.info("[BackgroundAnalysis] Step 6: LLM detailed content")

            try:
                async with AsyncSessionLocal() as db:
                    proj_result = await db.execute(select(Project).where(Project.id == project_id))
                    project = proj_result.scalar_one_or_none()

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
                        "commit_messages_summary": analysis_result.get("commit_messages_summary"),
                        "detected_technologies": analysis_result.get("detected_technologies", []),
                        "commit_categories": analysis_result.get("commit_categories", {}),
                        "total_commits": analysis_result.get("total_commits", 0),
                        "lines_added": analysis_result.get("lines_added", 0),
                        "lines_deleted": analysis_result.get("lines_deleted", 0),
                        "files_changed": analysis_result.get("files_changed", 0),
                    },
                    llm_service=llm_service,
                    language=language
                )
                total_tokens += content_tokens
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to generate detailed content: %s", e)

        step6_result = detailed_content
        await service.update_step_progress(task_id, 6, "completed", step6_result)

        # Generate AI summary (same as synchronous analysis)
        ai_summary = None
        ai_key_features = None
        if llm_service:
            try:
                logger.info("[BackgroundAnalysis] Generating AI summary (language=%s)", language)
                async with AsyncSessionLocal() as db:
                    proj_result = await db.execute(select(Project).where(Project.id == project_id))
                    project = proj_result.scalar_one_or_none()

                    if project:
                        summary_project_data = {
                            "name": project.name,
                            "description": project.description,
                            "role": project.role,
                            "team_size": project.team_size,
                            "contribution_percent": project.contribution_percent,
                            "technologies": analysis_result.get("detected_technologies", []),
                            "start_date": str(project.start_date) if project.start_date else None,
                            "end_date": str(project.end_date) if project.end_date else None,
                            "total_commits": analysis_result.get("total_commits", 0),
                            "commit_summary": analysis_result.get("commit_messages_summary", ""),
                        }

                        summary_result = await llm_service.generate_project_summary(
                            summary_project_data,
                            style=summary_style,
                            language=language
                        )
                        if summary_result:
                            ai_summary = summary_result.get("summary", "")
                            ai_key_features = summary_result.get("key_features", [])
                            if hasattr(llm_service, 'total_tokens_used'):
                                total_tokens += llm_service.total_tokens_used
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to generate AI summary: %s", e)
        else:
            logger.warning("[BackgroundAnalysis] Skipping AI summary: llm_service is None")

        # Save LLM results and language to DB (ALWAYS save language, even if LLM failed)
        async with AsyncSessionLocal() as db:
            analysis_db_result = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
            )
            repo_analysis = analysis_db_result.scalar_one_or_none()

            if repo_analysis:
                repo_analysis.analysis_language = language
                if key_tasks:
                    repo_analysis.key_tasks = key_tasks
                if detailed_content.get("implementation_details"):
                    repo_analysis.implementation_details = detailed_content["implementation_details"]
                if detailed_content.get("development_timeline"):
                    repo_analysis.development_timeline = detailed_content["development_timeline"]
                if detailed_content.get("detailed_achievements"):
                    repo_analysis.detailed_achievements = detailed_content["detailed_achievements"]
                if ai_summary:
                    repo_analysis.ai_summary = ai_summary
                if ai_key_features:
                    repo_analysis.ai_key_features = ai_key_features
                await db.commit()

                # Copy ai_summary to Project for report_service compatibility
                if ai_summary or ai_key_features:
                    proj_result = await db.execute(select(Project).where(Project.id == project_id))
                    project = proj_result.scalar_one_or_none()
                    if project:
                        if ai_summary:
                            project.ai_summary = ai_summary
                        if ai_key_features:
                            project.ai_key_features = ai_key_features
                        await db.commit()

        # Extract tech versions
        try:
            tech_versions = await github_service.extract_tech_versions(git_url)
            if tech_versions:
                async with AsyncSessionLocal() as db:
                    analysis_db_result = await db.execute(
                        select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
                    )
                    repo_analysis = analysis_db_result.scalar_one_or_none()
                    if repo_analysis:
                        repo_analysis.tech_stack_versions = tech_versions
                        await db.commit()
        except Exception as e:
            logger.warning("[BackgroundAnalysis] Failed to extract tech versions: %s", e)

        # Create ContributorAnalysis for the current user
        if github_username:
            try:
                logger.info("[BackgroundAnalysis] Creating ContributorAnalysis for user: %s", github_username)
                contributor_data = await github_service.analyze_contributor(
                    git_url,
                    github_username,
                    commit_limit=100
                )

                async with AsyncSessionLocal() as db:
                    # Check if already exists
                    existing_result = await db.execute(
                        select(ContributorAnalysis).where(
                            ContributorAnalysis.repo_analysis_id == analysis_id,
                            ContributorAnalysis.username == github_username
                        )
                    )
                    existing = existing_result.scalar_one_or_none()

                    if existing:
                        # Update existing record
                        existing.email = contributor_data.get("email")
                        existing.is_primary = True
                        existing.total_commits = contributor_data.get("total_commits", 0)
                        existing.first_commit_date = contributor_data.get("first_commit_date")
                        existing.last_commit_date = contributor_data.get("last_commit_date")
                        existing.lines_added = contributor_data.get("lines_added", 0)
                        existing.lines_deleted = contributor_data.get("lines_deleted", 0)
                        existing.file_extensions = contributor_data.get("file_extensions", {})
                        existing.work_areas = contributor_data.get("work_areas", [])
                        existing.detected_technologies = contributor_data.get("detected_technologies", [])
                        existing.detailed_commits = contributor_data.get("detailed_commits", [])
                        existing.commit_types = contributor_data.get("commit_types", {})
                    else:
                        # Create new record
                        new_contributor = ContributorAnalysis(
                            repo_analysis_id=analysis_id,
                            username=github_username,
                            email=contributor_data.get("email"),
                            is_primary=True,
                            total_commits=contributor_data.get("total_commits", 0),
                            first_commit_date=contributor_data.get("first_commit_date"),
                            last_commit_date=contributor_data.get("last_commit_date"),
                            lines_added=contributor_data.get("lines_added", 0),
                            lines_deleted=contributor_data.get("lines_deleted", 0),
                            file_extensions=contributor_data.get("file_extensions", {}),
                            work_areas=contributor_data.get("work_areas", []),
                            detected_technologies=contributor_data.get("detected_technologies", []),
                            detailed_commits=contributor_data.get("detailed_commits", []),
                            commit_types=contributor_data.get("commit_types", {}),
                        )
                        db.add(new_contributor)
                    await db.commit()
                    logger.info("[BackgroundAnalysis] Saved ContributorAnalysis for %s", github_username)
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to create ContributorAnalysis: %s", e)

        # Complete the job
        await service.complete_job(task_id, {
            "analysis_id": analysis_id,
            "total_tokens": total_tokens,
        })

        logger.info("[BackgroundAnalysis] Completed for task_id=%s", task_id)

    except AnalysisCancelledException:
        logger.info("[BackgroundAnalysis] Cancelled for task_id=%s", task_id)
        # Job already marked as cancelled

    except Exception as e:
        logger.exception("[BackgroundAnalysis] Failed for task_id=%s: %s", task_id, e)
        await service.fail_job(task_id, str(e), {"type": type(e).__name__})


async def _generate_key_tasks_bg(
    project_id: int,
    analysis_result: Dict[str, Any],
    llm_service,
    language: str = "ko"
) -> Tuple[List[str], int]:
    """Generate key tasks using LLM for background analysis."""
    async with AsyncSessionLocal() as db:
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project:
            return [], 0

        technologies = analysis_result.get("detected_technologies", [])
        commit_summary = analysis_result.get("commit_messages_summary", "")
        commit_categories = analysis_result.get("commit_categories", {})

        if language == "en":
            commit_context = ""
            if commit_categories:
                parts = []
                if commit_categories.get("feature", 0) > 0:
                    parts.append(f"New features: {commit_categories['feature']}")
                if commit_categories.get("fix", 0) > 0:
                    parts.append(f"Bug fixes: {commit_categories['fix']}")
                if commit_categories.get("refactor", 0) > 0:
                    parts.append(f"Refactoring: {commit_categories['refactor']}")
                commit_context = ", ".join(parts)

            prompt = f"""Based on the following project information, extract 3-5 key tasks/responsibilities.

Project: {project.name}
Description: {project.description or 'N/A'}
Role: {project.role or 'Developer'}
Tech Stack: {', '.join(technologies[:10]) if technologies else 'N/A'}
Commit Summary: {commit_context or 'N/A'}
Commit Messages:
{commit_summary[:500] if commit_summary else 'N/A'}

Each task should be specific and suitable for a resume.
Examples:
- "Designed and developed RESTful APIs"
- "Database modeling and query optimization"

Respond ONLY with a JSON array:
["task1", "task2", "task3"]
"""
        else:
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

JSON 배열 형식으로만 응답하세요:
["업무1", "업무2", "업무3"]
"""

        try:
            system_prompt = (
                "You are an expert at extracting key tasks from development projects. Respond ONLY with a JSON array."
                if language == "en" else
                "당신은 개발 프로젝트의 주요 업무를 추출하는 전문가입니다. JSON 배열 형식으로만 응답하세요."
            )

            # Handle both LLMService (has provider) and CLILLMService (is the provider)
            if hasattr(llm_service, 'provider'):
                # API-based LLM service (OpenAI, Anthropic, Gemini)
                response, tokens = await llm_service.provider.generate(
                    prompt,
                    system_prompt=system_prompt,
                    max_tokens=500,
                    temperature=0.3
                )
            else:
                # CLI-based LLM service (Claude Code CLI, Gemini CLI)
                full_prompt = f"{system_prompt}\n\n{prompt}"
                response, tokens = await llm_service.generate_with_cli(full_prompt)

            json_str = response.strip()
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]

            tasks = json.loads(json_str.strip())

            if isinstance(tasks, list) and all(isinstance(t, str) for t in tasks):
                return tasks[:5], tokens

            return [], tokens

        except Exception as e:
            logger.warning("[_generate_key_tasks_bg] Failed: %s", e)
            return [], 0
