from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any


class PipelineStep(BaseModel):
    """Individual pipeline step status."""
    step_number: int
    step_name: str
    status: str  # pending, running, completed, failed, skipped
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class PipelineRunRequest(BaseModel):
    """Request to run the document generation pipeline."""
    project_ids: List[int]  # Projects to include
    company_ids: Optional[List[int]] = None  # Companies to include
    template_id: int  # Template to use
    output_format: str = "docx"  # docx, pdf, md

    # Pipeline options
    skip_github_analysis: bool = False
    skip_llm_summary: bool = False
    regenerate_summaries: bool = False

    # Output settings
    document_name: Optional[str] = None
    include_achievements: bool = True
    include_tech_stack: bool = True

    # LLM settings
    llm_provider: Optional[str] = None  # Override user preference
    summary_style: str = "professional"  # professional, casual, technical
    cli_mode: Optional[str] = None  # 'claude_code' or 'gemini_cli' for CLI execution


class PipelineStatusResponse(BaseModel):
    """Response for pipeline execution status."""
    task_id: str
    status: str
    progress: int
    current_step: int
    total_steps: int
    steps: List[PipelineStep]
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class PipelineResultResponse(BaseModel):
    """Final result of pipeline execution."""
    task_id: str
    status: str
    document_id: int
    document_name: str
    file_path: str
    file_format: str
    file_size: int
    generation_time_seconds: float
    steps_completed: int
    projects_processed: int
    llm_tokens_used: Optional[int] = None
    llm_execution_mode: Optional[str] = None  # "cli" or "api"
    llm_cli_type: Optional[str] = None  # "claude_code" or "gemini_cli"
