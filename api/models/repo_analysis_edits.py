"""
RepoAnalysisEdits - Stores user edits for repo analysis content
Allows inline editing of LLM-generated content without modifying original analysis
"""

from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class RepoAnalysisEdits(Base):
    """User edits for repository analysis content."""

    __tablename__ = "repo_analysis_edits"

    id = Column(Integer, primary_key=True, index=True)
    repo_analysis_id = Column(
        Integer, ForeignKey("repo_analyses.id"), unique=True, nullable=False
    )

    # User-edited content (null means use original)
    key_tasks = Column(JSON, nullable=True)  # List of strings
    implementation_details = Column(JSON, nullable=True)  # List of {title, items}
    detailed_achievements = Column(
        JSON, nullable=True
    )  # Dict of {category: [{title, description}]}

    # Track which fields have been modified
    key_tasks_modified = Column(Boolean, default=False)
    implementation_details_modified = Column(Boolean, default=False)
    detailed_achievements_modified = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    repo_analysis = relationship("RepoAnalysis", back_populates="user_edits")
