"""
ContributorAnalysis model - Stores contributor-specific analysis data.

Tracks individual contributor statistics, work patterns, and technology usage
within a repository. Enables per-user analysis for portfolio generation.
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class ContributorAnalysis(Base):
    """Contributor-specific analysis results within a repository."""
    __tablename__ = "contributor_analyses"

    # Composite index for common query pattern (repo_analysis_id + username)
    __table_args__ = (
        Index('ix_contributor_repo_username', 'repo_analysis_id', 'username'),
    )

    id = Column(Integer, primary_key=True, index=True)
    repo_analysis_id = Column(
        Integer,
        ForeignKey("repo_analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Contributor identification
    username = Column(String(100), nullable=False, index=True)  # GitHub username
    email = Column(String(255))  # Git author email
    is_primary = Column(Boolean, default=False)  # True if this is the logged-in user

    # Commit statistics
    total_commits = Column(Integer, default=0)
    first_commit_date = Column(DateTime)
    last_commit_date = Column(DateTime)

    # Line statistics
    lines_added = Column(Integer, default=0)
    lines_deleted = Column(Integer, default=0)

    # File patterns (JSON)
    # Format: {".py": 45, ".ts": 30, ".tsx": 25, ...}
    file_extensions = Column(JSON)

    # Work areas detected from file paths (JSON)
    # Format: ["frontend", "backend", "tests", "devops", "docs", "database"]
    work_areas = Column(JSON)

    # Technologies used by this contributor (JSON)
    # Format: ["React", "FastAPI", "PostgreSQL", ...]
    detected_technologies = Column(JSON)

    # Detailed commit information (JSON)
    # Format: [{"sha": "...", "message": "...", "type": "feat", "scope": "auth", ...}]
    # Limited to recent 50 commits
    detailed_commits = Column(JSON)

    # Commit type breakdown (JSON)
    # Format: {"feat": 40, "fix": 30, "refactor": 20, "docs": 5, "test": 3, "other": 2}
    commit_types = Column(JSON)

    # Analysis metadata
    analyzed_at = Column(DateTime, default=datetime.utcnow)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    repo_analysis = relationship("RepoAnalysis", back_populates="contributors")

    def __repr__(self):
        return f"<ContributorAnalysis(id={self.id}, username={self.username}, commits={self.total_commits})>"
