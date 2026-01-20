from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class RepoAnalysis(Base):
    """GitHub repository analysis results."""
    __tablename__ = "repo_analyses"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, unique=True)

    # Repository info
    git_url = Column(String(500), nullable=False)
    default_branch = Column(String(100), default="main")

    # Commit statistics
    total_commits = Column(Integer, default=0)
    user_commits = Column(Integer, default=0)  # Commits by the user
    first_commit_date = Column(DateTime)
    last_commit_date = Column(DateTime)

    # Code statistics
    lines_added = Column(Integer, default=0)
    lines_deleted = Column(Integer, default=0)
    files_changed = Column(Integer, default=0)

    # Language detection
    languages = Column(JSON)  # {"Python": 45.2, "JavaScript": 30.1, ...}
    primary_language = Column(String(50))

    # Technology detection from files
    detected_technologies = Column(JSON)  # ["FastAPI", "React", "PostgreSQL", ...]
    package_files = Column(JSON)  # Parsed content from package.json, requirements.txt, etc.

    # Commit analysis
    commit_messages_summary = Column(Text)  # LLM-generated summary of commit messages
    commit_categories = Column(JSON)  # {"feature": 40, "fix": 30, "refactor": 20, ...}

    # Code patterns detected
    architecture_patterns = Column(JSON)  # ["MVC", "microservices", ...]
    code_quality_metrics = Column(JSON)  # {"avg_file_size": 150, "test_coverage": ...}

    # Analysis metadata
    analyzed_at = Column(DateTime, default=datetime.utcnow)
    analysis_version = Column(String(20), default="1.0")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="repo_analysis")
