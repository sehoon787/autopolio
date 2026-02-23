"""
Task Service - Based on aircok_backoffice TaskService pattern.
Handles job creation, status tracking, and progress updates.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime
from typing import Optional, Dict, Any
import uuid

from api.models.job import Job


class TaskService:
    """Service for managing background jobs and tasks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_job(
        self,
        user_id: int,
        job_type: str,
        input_data: Optional[Dict[str, Any]] = None,
        total_steps: int = 6,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Job:
        """Create a new job."""
        job = Job(
            task_id=str(uuid.uuid4()),
            user_id=user_id,
            job_type=job_type,
            status="pending",
            progress=0,
            current_step=0,
            total_steps=total_steps,
            input_data=input_data or {},
            step_results={},
            metadata=metadata or {},
        )
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def get_job(self, task_id: str) -> Optional[Job]:
        """Get a job by task_id."""
        result = await self.db.execute(select(Job).where(Job.task_id == task_id))
        return result.scalar_one_or_none()

    async def start_job(self, task_id: str) -> Optional[Job]:
        """Mark a job as started."""
        job = await self.get_job(task_id)
        if job:
            job.status = "running"
            job.started_at = datetime.utcnow()
            job.current_step = 1
            await self.db.flush()
            await self.db.refresh(job)
        return job

    async def update_job_progress(
        self,
        task_id: str,
        current_step: int,
        step_name: str,
        progress: int,
        step_result: Optional[Dict[str, Any]] = None,
    ) -> Optional[Job]:
        """Update job progress."""
        job = await self.get_job(task_id)
        if job:
            job.current_step = current_step
            job.step_name = step_name
            job.progress = progress

            # Update step results
            if step_result:
                step_results = dict(job.step_results or {})
                step_results[f"step_{current_step}"] = {
                    "name": step_name,
                    "result": step_result,
                    "completed_at": datetime.utcnow().isoformat(),
                }
                job.step_results = step_results
                flag_modified(job, "step_results")

            await self.db.flush()
            await self.db.refresh(job)
        return job

    async def start_step(
        self, task_id: str, step_number: int, step_name: str
    ) -> Optional[Job]:
        """Mark a step as started."""
        job = await self.get_job(task_id)
        if job:
            job.current_step = step_number
            job.step_name = step_name

            step_results = dict(job.step_results or {})
            step_results[f"step_{step_number}"] = {
                "name": step_name,
                "started_at": datetime.utcnow().isoformat(),
                "status": "running",
            }
            job.step_results = step_results
            flag_modified(job, "step_results")

            # Calculate progress
            job.progress = int((step_number - 1) / job.total_steps * 100)

            await self.db.flush()
            await self.db.refresh(job)
        return job

    async def complete_step(
        self, task_id: str, step_number: int, result: Optional[Dict[str, Any]] = None
    ) -> Optional[Job]:
        """Mark a step as completed."""
        job = await self.get_job(task_id)
        if job:
            step_results = dict(job.step_results or {})
            step_key = f"step_{step_number}"

            if step_key in step_results:
                step_data = dict(step_results[step_key])
                step_data["completed_at"] = datetime.utcnow().isoformat()
                step_data["status"] = "completed"
                if result:
                    step_data["result"] = result
                step_results[step_key] = step_data
            else:
                step_results[step_key] = {
                    "completed_at": datetime.utcnow().isoformat(),
                    "status": "completed",
                    "result": result,
                }

            job.step_results = step_results
            flag_modified(job, "step_results")
            job.progress = int(step_number / job.total_steps * 100)

            await self.db.flush()
            await self.db.refresh(job)
        return job

    async def skip_step(
        self,
        task_id: str,
        step_number: int,
        step_name: str,
        reason: str = "already_completed",
        result: Optional[Dict[str, Any]] = None,
    ) -> Optional[Job]:
        """Mark a step as skipped.

        Args:
            task_id: The task ID
            step_number: The step number to skip
            step_name: The name of the step
            reason: Why the step was skipped (e.g., 'already_analyzed', 'no_data')
            result: Optional result data to store
        """
        job = await self.get_job(task_id)
        if job:
            step_results = dict(job.step_results or {})
            step_key = f"step_{step_number}"

            step_results[step_key] = {
                "name": step_name,
                "status": "skipped",
                "reason": reason,
                "skipped_at": datetime.utcnow().isoformat(),
            }
            if result:
                step_results[step_key]["result"] = result

            job.step_results = step_results
            flag_modified(job, "step_results")
            job.current_step = step_number + 1
            job.progress = int(step_number / job.total_steps * 100)

            await self.db.flush()
            await self.db.refresh(job)
        return job

    async def complete_job(
        self, task_id: str, output_data: Optional[Dict[str, Any]] = None
    ) -> Optional[Job]:
        """Mark a job as completed."""
        job = await self.get_job(task_id)
        if job:
            job.status = "completed"
            job.progress = 100
            job.completed_at = datetime.utcnow()
            if output_data:
                job.output_data = output_data
            await self.db.flush()
            await self.db.refresh(job)
        return job

    async def fail_job(
        self,
        task_id: str,
        error_message: str,
        error_details: Optional[Dict[str, Any]] = None,
    ) -> Optional[Job]:
        """Mark a job as failed."""
        job = await self.get_job(task_id)
        if job:
            job.status = "failed"
            job.completed_at = datetime.utcnow()
            job.error_message = error_message
            if error_details:
                job.error_details = error_details
                flag_modified(job, "error_details")
            await self.db.flush()
            await self.db.refresh(job)
        return job

    async def update_job_status(
        self, task_id: str, status: str, error_message: Optional[str] = None
    ) -> Optional[Job]:
        """Update job status."""
        job = await self.get_job(task_id)
        if job:
            job.status = status
            if error_message:
                job.error_message = error_message
            if status in ["completed", "failed", "cancelled"]:
                job.completed_at = datetime.utcnow()
            await self.db.flush()
            await self.db.refresh(job)
        return job
