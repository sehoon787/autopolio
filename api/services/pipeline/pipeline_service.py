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
"""
import logging
import time
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

from api.models.user import User
from api.services.core import TaskService
from api.services.document import DocumentService
from api.services.core import EncryptionService
from api.schemas.pipeline import PipelineRunRequest

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


class PipelineService:
    """Service for running the document generation pipeline.
    
    This is a facade that orchestrates the pipeline steps.
    Step implementations are in pipeline_steps.py.
    """

    # Re-export STEP_NAMES for backward compatibility
    STEP_NAMES = STEP_NAMES

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.task_service = TaskService(db)
        self.document_service = DocumentService()
        self.encryption = EncryptionService()

    async def run_pipeline(
        self,
        task_id: str,
        request: PipelineRunRequest
    ) -> Dict[str, Any]:
        """Run the complete pipeline."""
        start_time = time.time()
        llm_tokens = 0

        # Store task_id in request for step functions
        request.task_id = task_id

        try:
            # Start the job
            await self.task_service.start_job(task_id)

            # Get user
            user_result = await self.db.execute(
                select(User).where(User.id == self.user_id)
            )
            user = user_result.scalar_one_or_none()
            if not user:
                raise ValueError("User not found")

            # Step 1: GitHub Analysis
            github_results = await step_github_analysis(
                self.db, self.user_id, self.task_service,
                request, user, self.encryption
            )

            # Step 2: Code Extraction
            code_results = await step_code_extraction(
                self.db, self.task_service, request, github_results
            )

            # Step 3: Tech Detection
            tech_results = await step_tech_detection(
                self.db, self.task_service, request, code_results
            )

            # Step 4: Achievement Detection
            achievement_results = await step_achievement_detection(
                self.db, self.task_service, request, user
            )

            # Step 5: LLM Summarization
            summary_results, tokens = await step_llm_summarization(
                self.db, self.task_service, request, user, tech_results
            )
            llm_tokens += tokens

            # Step 6: Template Mapping
            mapping_results = await step_template_mapping(
                self.db, self.user_id, self.task_service,
                request, user, summary_results, self.document_service
            )

            # Step 7: Document Generation
            document = await step_document_generation(
                self.db, self.user_id, self.task_service,
                request, mapping_results, self.document_service
            )

            # Calculate generation time
            generation_time = time.time() - start_time
            llm_provider = request.llm_provider or (user.preferred_llm if user else None)

            # Complete the job
            cli_mode = getattr(request, 'cli_mode', None)
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

            await self.task_service.complete_job(task_id, output_data)
            return output_data

        except Exception as e:
            await self.task_service.fail_job(
                task_id,
                str(e),
                {"exception_type": type(e).__name__}
            )
            raise
