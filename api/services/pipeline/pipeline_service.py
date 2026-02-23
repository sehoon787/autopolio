"""
Pipeline Service - Orchestrates the 7-step document generation pipeline.

Pipeline Steps:
1. GitHub Analysis - Analyze commits and code
2. Code Extraction - Extract patterns and architecture
3. Tech Detection - Auto-detect technologies
4. Achievement Detection - Auto-detect achievements
5. LLM Summarization - Generate AI summaries
6. Template Mapping - Map data to template
7. Document Generation - Create final document

Performance Optimizations (v1.9):
- Parallel GitHub analysis for multiple projects
- Parallel LLM summarization for multiple projects
- Concurrency limits to respect API rate limits

Refactored (v1.13):
- Step functions extracted to pipeline_steps.py
- PipelineService is now a facade that orchestrates steps

Fixed (v1.17):
- Pipeline now creates its own DB session for background execution
- Commits after each step so polling endpoints can see progress
- Previously, using the request's DB session meant progress updates
  were never committed (only flushed), causing the pipeline to appear
  stuck at 'pending' when polled from frontend.
"""

import logging
import time
import traceback
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.models.user import User
from api.services.core import TaskService, EncryptionService
from api.services.document import DocumentService
from api.schemas.pipeline import PipelineRunRequest
from api.database import AsyncSessionLocal

# Import step functions from pipeline_steps module
from .pipeline_steps import (
    STEP_NAMES,
    step_github_analysis,
    step_code_extraction,
    step_tech_detection,
    step_achievement_detection,
    step_llm_summarization,
    step_template_mapping,
    step_document_generation,
)

logger = logging.getLogger(__name__)


class PipelineService:
    """Service for running the document generation pipeline.

    This is a facade that orchestrates the pipeline steps.
    Step implementations are in pipeline_steps.py.
    """

    # Re-export STEP_NAMES for backward compatibility
    STEP_NAMES = STEP_NAMES

    def __init__(self, db: AsyncSession, user_id: int):
        # Note: db is accepted for API compatibility but NOT used directly.
        # run_pipeline() creates its own session via AsyncSessionLocal() so
        # that commits are visible to polling endpoints.
        self.user_id = user_id
        self.document_service = DocumentService()
        self.encryption = EncryptionService()

    async def run_pipeline(
        self, task_id: str, request: PipelineRunRequest
    ) -> Dict[str, Any]:
        """Run the complete pipeline using its own DB session.

        Creates a fresh DB session so that progress commits are visible
        to other sessions (e.g., the frontend polling endpoint).
        """
        start_time = time.time()
        llm_tokens = 0

        # Store task_id in request for step functions
        request.task_id = task_id

        # Create our own DB session for the background task.
        # The caller's session may be closed by the time asyncio.create_task
        # runs, and even if alive, flush()-only updates are invisible to other
        # sessions due to SQLite transaction isolation.
        async with AsyncSessionLocal() as db:
            task_service = TaskService(db)
            document_service = self.document_service

            try:
                # Start the job
                await task_service.start_job(task_id)
                await db.commit()

                # Get user
                user_result = await db.execute(
                    select(User).where(User.id == self.user_id)
                )
                user = user_result.scalar_one_or_none()
                if not user:
                    raise ValueError("User not found")

                # Step 1: GitHub Analysis
                logger.info("[Pipeline] Step 1: GitHub Analysis (task=%s)", task_id)
                github_results = await step_github_analysis(
                    db, self.user_id, task_service, request, user, self.encryption
                )
                await db.commit()

                # Step 2: Code Extraction
                logger.info("[Pipeline] Step 2: Code Extraction (task=%s)", task_id)
                code_results = await step_code_extraction(
                    db, task_service, request, github_results
                )
                await db.commit()

                # Step 3: Tech Detection
                logger.info("[Pipeline] Step 3: Tech Detection (task=%s)", task_id)
                tech_results = await step_tech_detection(
                    db, task_service, request, code_results
                )
                await db.commit()

                # Step 4: Achievement Detection
                logger.info(
                    "[Pipeline] Step 4: Achievement Detection (task=%s)", task_id
                )
                await step_achievement_detection(db, task_service, request, user)
                await db.commit()

                # Step 5: LLM Summarization
                logger.info("[Pipeline] Step 5: LLM Summarization (task=%s)", task_id)
                summary_results, tokens = await step_llm_summarization(
                    db, task_service, request, user, tech_results
                )
                llm_tokens += tokens
                await db.commit()

                # Step 6: Template Mapping
                logger.info("[Pipeline] Step 6: Template Mapping (task=%s)", task_id)
                mapping_results = await step_template_mapping(
                    db,
                    self.user_id,
                    task_service,
                    request,
                    user,
                    summary_results,
                    document_service,
                )
                await db.commit()

                # Step 7: Document Generation
                logger.info("[Pipeline] Step 7: Document Generation (task=%s)", task_id)
                document = await step_document_generation(
                    db,
                    self.user_id,
                    task_service,
                    request,
                    mapping_results,
                    document_service,
                )
                await db.commit()

                # Calculate generation time
                generation_time = time.time() - start_time
                llm_provider = request.llm_provider or (
                    user.preferred_llm if user else None
                )

                # Complete the job
                cli_mode = getattr(request, "cli_mode", None)
                output_data = {
                    "document_id": document.id,
                    "document_name": document.document_name,
                    "file_path": document.file_path,
                    "file_format": document.file_format,
                    "file_size": document.file_size,
                    "generation_time_seconds": round(generation_time, 2),
                    "projects_processed": len(request.project_ids),
                    "llm_tokens_used": llm_tokens,
                    "llm_provider": llm_provider,
                    "llm_execution_mode": "cli" if cli_mode else "api",
                    "llm_cli_type": cli_mode if cli_mode else None,
                }

                await task_service.complete_job(task_id, output_data)
                await db.commit()

                logger.info(
                    "[Pipeline] Completed in %.1fs (task=%s)", generation_time, task_id
                )
                return output_data

            except Exception as e:
                tb_str = traceback.format_exc()
                logger.error("[Pipeline] Failed (task=%s): %s\n%s", task_id, e, tb_str)
                try:
                    await task_service.fail_job(
                        task_id,
                        str(e),
                        {
                            "exception_type": type(e).__name__,
                            "traceback": tb_str[-2000:],
                        },
                    )
                    await db.commit()
                except Exception as commit_err:
                    logger.error(
                        "[Pipeline] Failed to save error state: %s", commit_err
                    )
                raise
