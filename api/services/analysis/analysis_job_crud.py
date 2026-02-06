"""
Analysis Job CRUD Service - Job management and partial result saving.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from api.models.job import Job
from api.models.project import Project
from api.models.repo_analysis import RepoAnalysis
from api.services.core import TaskService
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
