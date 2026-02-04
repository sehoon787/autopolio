"""
Analysis Job Service - Background analysis with job tracking.
Supports cancellation and partial result saving.
"""
import logging
import asyncio
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from api.models.job import Job
from api.models.project import Project, Technology, ProjectTechnology
from api.models.repo_analysis import RepoAnalysis
from api.models.achievement import ProjectAchievement
from api.models.contributor_analysis import ContributorAnalysis
from api.services.task_service import TaskService
from api.services.github_service import GitHubService
from api.services.role_service import RoleService
from api.services.achievement_service import AchievementService
from api.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


class AnalysisCancelledException(Exception):
    """Raised when analysis is cancelled by user."""
    pass


class AnalysisJobService:
    """
    Service for managing background GitHub analysis jobs.

    Runs analysis in 6 steps, saving partial results at each step:
    1. Repository info - basic stats, languages
    2. Technology detection - detected technologies
    3. Commit analysis - commit patterns, categories
    4. Role detection - contributor role
    5. LLM key tasks - main tasks list
    6. LLM detailed content - implementation details, timeline, achievements
    """

    STEP_NAMES = {
        1: "repository_info",
        2: "technology_detection",
        3: "commit_analysis",
        4: "role_detection",
        5: "llm_key_tasks",
        6: "llm_detailed_content",
    }

    def __init__(self, db: AsyncSession):
        self.db = db
        self.task_service = TaskService(db)

    async def create_analysis_job(
        self,
        user_id: int,
        project_id: int,
        git_url: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Job:
        """Create a new analysis job."""
        job = Job(
            user_id=user_id,
            job_type="github_analysis",
            target_project_id=project_id,
            status="pending",
            progress=0,
            current_step=0,
            total_steps=6,
            input_data={
                "git_url": git_url,
                "project_id": project_id,
                "options": options or {},
            },
            step_results={},
            partial_results={},
        )
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def get_job(self, task_id: str) -> Optional[Job]:
        """Get a job by task_id."""
        result = await self.db.execute(
            select(Job).where(Job.task_id == task_id)
        )
        return result.scalar_one_or_none()

    async def get_job_by_project(self, project_id: int) -> Optional[Job]:
        """Get active job for a project."""
        result = await self.db.execute(
            select(Job).where(
                Job.target_project_id == project_id,
                Job.status.in_(["pending", "running"])
            ).order_by(Job.created_at.desc())
        )
        return result.scalar_one_or_none()

    async def get_active_jobs_for_user(self, user_id: int) -> List[Job]:
        """Get all active analysis jobs for a user.

        Includes:
        - Active jobs (pending, running)
        - Recently completed jobs (within last 60 seconds) for token tracking
        """
        recent_cutoff = datetime.utcnow() - timedelta(seconds=60)

        result = await self.db.execute(
            select(Job).where(
                Job.user_id == user_id,
                Job.job_type == "github_analysis",
                or_(
                    # Active jobs
                    Job.status.in_(["pending", "running"]),
                    # Recently completed/failed jobs (for token tracking)
                    and_(
                        Job.status.in_(["completed", "failed"]),
                        Job.completed_at >= recent_cutoff
                    )
                )
            ).order_by(Job.created_at.desc())
        )
        return list(result.scalars().all())

    async def check_cancelled(self, task_id: str) -> bool:
        """Check if job has been cancelled. Uses fresh DB read."""
        async with AsyncSessionLocal() as fresh_db:
            result = await fresh_db.execute(
                select(Job.status).where(Job.task_id == task_id)
            )
            status = result.scalar_one_or_none()
            return status == "cancelled"

    async def cancel_job(self, task_id: str) -> Optional[Job]:
        """Cancel a running job and save partial results."""
        job = await self.get_job(task_id)
        if not job:
            return None

        if job.status in ["completed", "failed", "cancelled"]:
            return job

        job.status = "cancelled"
        job.completed_at = datetime.utcnow()
        job.error_message = "Cancelled by user"

        await self.db.flush()
        await self.db.refresh(job)

        # Save partial results to project if any steps completed
        if job.partial_results and job.target_project_id:
            await self._save_partial_to_project(job)

        return job

    async def update_step_progress(
        self,
        task_id: str,
        step_number: int,
        status: str = "running",
        result: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update job progress for a specific step."""
        async with AsyncSessionLocal() as db:
            job_result = await db.execute(
                select(Job).where(Job.task_id == task_id)
            )
            job = job_result.scalar_one_or_none()
            if not job:
                return

            step_name = self.STEP_NAMES.get(step_number, f"step_{step_number}")
            job.current_step = step_number
            job.step_name = step_name

            # Update progress based on step
            if status == "completed":
                job.progress = int((step_number / job.total_steps) * 100)
            else:
                job.progress = int(((step_number - 1) / job.total_steps) * 100) + 5

            # Update step results
            step_results = job.step_results or {}
            step_results[f"step_{step_number}"] = {
                "name": step_name,
                "status": status,
                "timestamp": datetime.utcnow().isoformat(),
            }
            if result:
                step_results[f"step_{step_number}"]["result_summary"] = str(result)[:500]
            job.step_results = step_results

            # Save partial results
            if result and status == "completed":
                partial_results = job.partial_results or {}
                partial_results[step_name] = result
                job.partial_results = partial_results

            await db.commit()

    async def complete_job(
        self,
        task_id: str,
        output_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Mark job as completed."""
        async with AsyncSessionLocal() as db:
            job_result = await db.execute(
                select(Job).where(Job.task_id == task_id)
            )
            job = job_result.scalar_one_or_none()
            if not job:
                return

            job.status = "completed"
            job.progress = 100
            job.completed_at = datetime.utcnow()
            if output_data:
                job.output_data = output_data

            await db.commit()

    async def fail_job(
        self,
        task_id: str,
        error_message: str,
        error_details: Optional[Dict[str, Any]] = None
    ) -> None:
        """Mark job as failed."""
        async with AsyncSessionLocal() as db:
            job_result = await db.execute(
                select(Job).where(Job.task_id == task_id)
            )
            job = job_result.scalar_one_or_none()
            if not job:
                return

            job.status = "failed"
            job.completed_at = datetime.utcnow()
            job.error_message = error_message
            if error_details:
                job.error_details = error_details

            # Save partial results to project if any steps completed
            if job.partial_results and job.target_project_id:
                await self._save_partial_to_project_in_session(db, job)

            await db.commit()

    async def _save_partial_to_project(self, job: Job) -> None:
        """Save partial results to project/repo_analysis."""
        async with AsyncSessionLocal() as db:
            await self._save_partial_to_project_in_session(db, job)
            await db.commit()

    async def _save_partial_to_project_in_session(
        self,
        db: AsyncSession,
        job: Job
    ) -> None:
        """Save partial results to project within existing session."""
        if not job.partial_results or not job.target_project_id:
            return

        # Get project
        proj_result = await db.execute(
            select(Project).where(Project.id == job.target_project_id)
        )
        project = proj_result.scalar_one_or_none()
        if not project:
            return

        partial = job.partial_results

        # Get or create repo analysis
        analysis_result = await db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == job.target_project_id)
        )
        repo_analysis = analysis_result.scalar_one_or_none()

        if not repo_analysis:
            repo_analysis = RepoAnalysis(
                project_id=job.target_project_id,
                git_url=job.input_data.get("git_url", ""),
            )
            db.add(repo_analysis)

        # Apply partial results
        if "repository_info" in partial:
            info = partial["repository_info"]
            repo_analysis.total_commits = info.get("total_commits", 0)
            repo_analysis.user_commits = info.get("user_commits", 0)
            repo_analysis.lines_added = info.get("lines_added", 0)
            repo_analysis.lines_deleted = info.get("lines_deleted", 0)
            repo_analysis.files_changed = info.get("files_changed", 0)
            repo_analysis.languages = info.get("languages", {})
            repo_analysis.primary_language = info.get("primary_language")

        if "technology_detection" in partial:
            tech = partial["technology_detection"]
            repo_analysis.detected_technologies = tech.get("technologies", [])

        if "commit_analysis" in partial:
            commits = partial["commit_analysis"]
            repo_analysis.commit_messages_summary = commits.get("summary")
            repo_analysis.commit_categories = commits.get("categories", {})

        if "role_detection" in partial:
            role = partial["role_detection"]
            if role.get("detected_role") and not project.role:
                project.role = role["detected_role"]

        if "llm_key_tasks" in partial:
            tasks = partial["llm_key_tasks"]
            repo_analysis.key_tasks = tasks.get("tasks", [])

        if "llm_detailed_content" in partial:
            content = partial["llm_detailed_content"]
            if content.get("implementation_details"):
                repo_analysis.implementation_details = content["implementation_details"]
            if content.get("development_timeline"):
                repo_analysis.development_timeline = content["development_timeline"]
            if content.get("detailed_achievements"):
                repo_analysis.detailed_achievements = content["detailed_achievements"]

        # Mark as partially analyzed if any step completed
        if partial:
            project.status = "partial"


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
    from api.services.llm_service import LLMService
    from api.services.cli_llm_service import CLILLMService

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

    logger.info("[BackgroundAnalysis] Options: %s", options)
    logger.info("[BackgroundAnalysis] Analysis language: %s", language)

    # Initialize LLM service
    llm_service = None
    try:
        cli_mode = options.get("cli_mode")
        cli_model = options.get("cli_model")
        provider = options.get("provider")

        logger.info("[BackgroundAnalysis] LLM config - cli_mode=%s, provider=%s", cli_mode, provider)

        if cli_mode:
            llm_service = CLILLMService(cli_mode, model=cli_model)
            logger.info("[BackgroundAnalysis] Using CLI LLM service: %s", cli_mode)
        elif provider:
            llm_service = LLMService(provider)
            logger.info("[BackgroundAnalysis] Using API LLM service: %s", provider)
        else:
            llm_service = LLMService()
            logger.info("[BackgroundAnalysis] Using default LLM service")
    except Exception as e:
        logger.warning("[BackgroundAnalysis] LLM service not available: %s", e)
        import traceback
        logger.warning("[BackgroundAnalysis] LLM init traceback: %s", traceback.format_exc())

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
                    # (re-analysis should replace all achievements with current language)
                    await db.execute(
                        ProjectAchievement.__table__.delete().where(
                            ProjectAchievement.project_id == project_id
                        )
                    )
                    logger.info("[BackgroundAnalysis] Deleted existing achievements for project %d", project_id)

                    for achievement in achievements:
                        new_achievement = ProjectAchievement(
                            project_id=project_id,
                            metric_name=achievement.get("metric_name", ""),
                            metric_value=achievement.get("metric_value", ""),
                            description=achievement.get("description"),
                            category=achievement.get("category"),
                            evidence=achievement.get("evidence"),
                        )
                        db.add(new_achievement)
                    logger.info("[BackgroundAnalysis] Added %d new achievements", len(achievements))
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
                import traceback
                logger.warning("[BackgroundAnalysis] Key tasks traceback: %s", traceback.format_exc())
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
                            style="professional",
                            language=language
                        )
                        if summary_result:
                            ai_summary = summary_result.get("summary", "")
                            ai_key_features = summary_result.get("key_features", [])
                            if hasattr(llm_service, 'total_tokens_used'):
                                total_tokens += llm_service.total_tokens_used
                            logger.info("[BackgroundAnalysis] AI summary generated: %d chars, %d features",
                                       len(ai_summary or ""), len(ai_key_features or []))
                        else:
                            logger.warning("[BackgroundAnalysis] generate_project_summary returned None/empty")
                    else:
                        logger.warning("[BackgroundAnalysis] Project not found for AI summary: %d", project_id)
            except Exception as e:
                logger.warning("[BackgroundAnalysis] Failed to generate AI summary: %s", e)
                import traceback
                logger.warning("[BackgroundAnalysis] AI summary traceback: %s", traceback.format_exc())
        else:
            logger.warning("[BackgroundAnalysis] Skipping AI summary: llm_service is None")

        # Save LLM results and language to DB (ALWAYS save language, even if LLM failed)
        async with AsyncSessionLocal() as db:
            analysis_db_result = await db.execute(
                select(RepoAnalysis).where(RepoAnalysis.id == analysis_id)
            )
            repo_analysis = analysis_db_result.scalar_one_or_none()

            if repo_analysis:
                # Always save analysis language (even if LLM calls failed)
                repo_analysis.analysis_language = language
                logger.info("[BackgroundAnalysis] Setting analysis_language=%s", language)

                # Save LLM results if available
                if key_tasks:
                    repo_analysis.key_tasks = key_tasks
                    logger.info("[BackgroundAnalysis] Saved %d key_tasks", len(key_tasks))
                if detailed_content.get("implementation_details"):
                    repo_analysis.implementation_details = detailed_content["implementation_details"]
                if detailed_content.get("development_timeline"):
                    repo_analysis.development_timeline = detailed_content["development_timeline"]
                if detailed_content.get("detailed_achievements"):
                    repo_analysis.detailed_achievements = detailed_content["detailed_achievements"]
                # Save AI summary (same as synchronous analysis)
                if ai_summary:
                    repo_analysis.ai_summary = ai_summary
                    logger.info("[BackgroundAnalysis] Saved ai_summary (%d chars)", len(ai_summary))
                if ai_key_features:
                    repo_analysis.ai_key_features = ai_key_features

                await db.commit()

                # Also copy ai_summary and ai_key_features to Project (for report_service compatibility)
                if ai_summary or ai_key_features:
                    proj_result = await db.execute(
                        select(Project).where(Project.id == project_id)
                    )
                    project = proj_result.scalar_one_or_none()
                    if project:
                        if ai_summary:
                            project.ai_summary = ai_summary
                        if ai_key_features:
                            project.ai_key_features = ai_key_features
                        await db.commit()
                        logger.info("[BackgroundAnalysis] Copied ai_summary to Project %d", project_id)
            else:
                logger.warning("[BackgroundAnalysis] RepoAnalysis not found for id=%s", analysis_id)

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
                        logger.info("[BackgroundAnalysis] Updated ContributorAnalysis for %s", github_username)
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
                        logger.info("[BackgroundAnalysis] Created ContributorAnalysis for %s", github_username)

                    await db.commit()
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

            import json
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
            import traceback
            logger.warning("[_generate_key_tasks_bg] Traceback: %s", traceback.format_exc())
            return [], 0
