from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base
from api.constants import JobStatus
import uuid


class Job(Base):
    """Job/Task tracking for pipeline execution (aircok TaskService pattern)."""

    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(
        String(36), unique=True, index=True, default=lambda: str(uuid.uuid4())
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Target association (v1.12 - for background analysis)
    target_project_id = Column(
        Integer, ForeignKey("projects.id"), nullable=True, index=True
    )

    # Job type
    job_type = Column(
        String(50), nullable=False
    )  # github_analysis, pipeline, document_generation

    # Status tracking
    status = Column(
        String(20), default=JobStatus.PENDING
    )  # pending, running, completed, failed, cancelled
    progress = Column(Integer, default=0)  # 0-100

    # Pipeline step tracking (for 6-step pipeline)
    current_step = Column(Integer, default=0)  # 0-6
    total_steps = Column(Integer, default=6)
    step_name = Column(String(100))  # Current step name

    # Step details for each pipeline step
    step_results = Column(JSON)  # {"step_1": {...}, "step_2": {...}, ...}

    # Partial results for background analysis (v1.12)
    partial_results = Column(JSON)  # Intermediate results saved at each step

    # Input/Output
    input_data = Column(JSON)  # Parameters for the job
    output_data = Column(JSON)  # Results from the job

    # Error handling
    error_message = Column(Text)
    error_details = Column(JSON)

    # Timing
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    estimated_completion = Column(DateTime)

    # Metadata
    job_metadata = Column(JSON)  # Additional job-specific data

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="jobs")
    documents = relationship("GeneratedDocument", back_populates="job")
    project = relationship(
        "Project", back_populates="jobs", foreign_keys=[target_project_id]
    )

    @property
    def is_running(self) -> bool:
        return self.status == JobStatus.RUNNING

    @property
    def is_completed(self) -> bool:
        return self.status == JobStatus.COMPLETED

    @property
    def is_failed(self) -> bool:
        return self.status == JobStatus.FAILED

    @property
    def is_cancelled(self) -> bool:
        return self.status == JobStatus.CANCELLED

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "task_id": self.task_id,
            "job_type": self.job_type,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "step_name": self.step_name,
            "error_message": self.error_message,
            "target_project_id": self.target_project_id,
            "partial_results": self.partial_results,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat()
            if self.completed_at
            else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
