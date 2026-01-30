from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from api.database import get_db
from api.models.user import User
from api.models.job import Job
from api.schemas.pipeline import PipelineRunRequest, PipelineStatusResponse, PipelineResultResponse
from api.schemas.job import JobResponse, JobListResponse
from api.services.pipeline_service import PipelineService
from api.services.task_service import TaskService

router = APIRouter()


@router.post("/run", response_model=JobResponse)
async def run_pipeline(
    request: PipelineRunRequest,
    background_tasks: BackgroundTasks,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Start the document generation pipeline.

    6-step pipeline:
    1. GitHub Analysis - Analyze commits and code
    2. Code Extraction - Extract patterns and architecture
    3. Tech Detection - Auto-detect technologies
    4. LLM Summarization - Generate AI summaries
    5. Template Mapping - Map data to template
    6. Document Generation - Create final document
    """
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create task service and job
    task_service = TaskService(db)
    job = await task_service.create_job(
        user_id=user_id,
        job_type="pipeline",
        input_data=request.model_dump(),
        total_steps=7  # 7 steps: GitHub Analysis, Code Extraction, Tech Detection, Achievement Detection, LLM Summarization, Template Mapping, Document Generation
    )

    # Commit immediately so the job is visible to status queries
    await db.commit()
    await db.refresh(job)

    # Start pipeline in background
    pipeline_service = PipelineService(db, user_id)
    background_tasks.add_task(
        pipeline_service.run_pipeline,
        job.task_id,
        request
    )

    return job


@router.get("/tasks/{task_id}", response_model=PipelineStatusResponse)
async def get_pipeline_status(
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get the status of a pipeline execution."""
    result = await db.execute(select(Job).where(Job.task_id == task_id))
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Task not found")

    # Build step details
    step_results = job.step_results or {}
    steps = []
    step_names = [
        "GitHub Analysis",
        "Code Extraction",
        "Tech Detection",
        "Achievement Detection",
        "LLM Summarization",
        "Template Mapping",
        "Document Generation"
    ]

    for i, step_name in enumerate(step_names, 1):
        step_key = f"step_{i}"
        step_data = step_results.get(step_key, {})

        # Determine step status - prioritize explicit status from step_results
        step_status = "pending"
        if step_data.get("status") == "skipped":
            # Step was explicitly marked as skipped
            step_status = "skipped"
        elif i < job.current_step:
            step_status = "completed"
        elif i == job.current_step:
            step_status = "running" if job.status == "running" else job.status
        elif job.status == "failed" and i > job.current_step:
            step_status = "skipped"

        steps.append({
            "step_number": i,
            "step_name": step_name,
            "status": step_status,
            "started_at": step_data.get("started_at"),
            "completed_at": step_data.get("completed_at") or step_data.get("skipped_at"),
            "result": step_data.get("result"),
            "error": step_data.get("error"),
            "skip_reason": step_data.get("reason") if step_status == "skipped" else None
        })

    return {
        "task_id": job.task_id,
        "status": job.status,
        "progress": job.progress,
        "current_step": job.current_step,
        "total_steps": job.total_steps,
        "steps": steps,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "estimated_completion": job.estimated_completion,
        "result": job.output_data,
        "error": job.error_message
    }


@router.get("/tasks/{task_id}/result", response_model=PipelineResultResponse)
async def get_pipeline_result(
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get the final result of a completed pipeline."""
    result = await db.execute(select(Job).where(Job.task_id == task_id))
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Task not found")

    if job.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Pipeline not completed. Current status: {job.status}"
        )

    output = job.output_data or {}
    return {
        "task_id": job.task_id,
        "status": job.status,
        "document_id": output.get("document_id"),
        "document_name": output.get("document_name"),
        "file_path": output.get("file_path"),
        "file_format": output.get("file_format"),
        "file_size": output.get("file_size", 0),
        "generation_time_seconds": output.get("generation_time_seconds", 0),
        "steps_completed": job.current_step,
        "projects_processed": output.get("projects_processed", 0),
        "llm_tokens_used": output.get("llm_tokens_used"),
        "token_usage": output.get("llm_tokens_used", 0),
        "provider": output.get("llm_provider")
    }


@router.post("/tasks/{task_id}/cancel")
async def cancel_pipeline(
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Cancel a running pipeline."""
    result = await db.execute(select(Job).where(Job.task_id == task_id))
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Task not found")

    if job.status not in ["pending", "running"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel task with status: {job.status}"
        )

    task_service = TaskService(db)
    await task_service.update_job_status(
        task_id,
        status="cancelled",
        error_message="Cancelled by user"
    )

    return {"message": "Pipeline cancelled", "task_id": task_id}


@router.get("/jobs", response_model=JobListResponse)
async def get_user_jobs(
    user_id: int = Query(..., description="User ID"),
    job_type: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Get all jobs for a user."""
    query = select(Job).where(Job.user_id == user_id)

    if job_type:
        query = query.where(Job.job_type == job_type)
    if status:
        query = query.where(Job.status == status)

    query = query.order_by(Job.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    jobs = result.scalars().all()

    # Get total count
    count_query = select(Job).where(Job.user_id == user_id)
    if job_type:
        count_query = count_query.where(Job.job_type == job_type)
    if status:
        count_query = count_query.where(Job.status == status)
    count_result = await db.execute(count_query)
    total = len(count_result.scalars().all())

    # Convert jobs to dicts to avoid SQLAlchemy metadata attribute conflict (fixed)
    jobs_list = [
        {
            "id": job.id,
            "task_id": job.task_id,
            "user_id": job.user_id,
            "job_type": job.job_type,
            "status": job.status,
            "progress": job.progress,
            "current_step": job.current_step,
            "total_steps": job.total_steps,
            "step_name": job.step_name,
            "step_results": job.step_results,
            "input_data": job.input_data,
            "output_data": job.output_data,
            "error_message": job.error_message,
            "error_details": job.error_details,
            "started_at": job.started_at,
            "completed_at": job.completed_at,
            "estimated_completion": job.estimated_completion,
            "job_metadata": job.job_metadata,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
        }
        for job in jobs
    ]

    return {
        "jobs": jobs_list,
        "total": total,
        "page": skip // limit + 1,
        "page_size": limit
    }
