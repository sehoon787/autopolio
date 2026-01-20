from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any, List


class JobCreate(BaseModel):
    job_type: str
    input_data: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class JobResponse(BaseModel):
    id: int
    task_id: str
    user_id: int
    job_type: str
    status: str
    progress: int
    current_step: int
    total_steps: int
    step_name: Optional[str] = None
    step_results: Optional[Dict[str, Any]] = None
    input_data: Optional[Dict[str, Any]] = None
    output_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class JobStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    current_step: int
    total_steps: int
    step_name: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class JobListResponse(BaseModel):
    jobs: List[JobResponse]
    total: int
    page: int
    page_size: int
