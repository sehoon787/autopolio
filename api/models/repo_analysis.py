from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class RepoAnalysis(Base):
    """GitHub repository analysis results."""
    __tablename__ = "repo_analyses"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, unique=True, index=True)

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

    # Key tasks extracted from analysis (LLM-generated)
    key_tasks = Column(JSON)  # ["RESTful API 설계 및 개발", "인증/인가 시스템 구현", ...]

    # Code patterns detected
    architecture_patterns = Column(JSON)  # ["MVC", "microservices", ...]
    code_quality_metrics = Column(JSON)  # {"avg_file_size": 150, "test_coverage": ...}

    # LLM-generated detailed content (v1.2)
    implementation_details = Column(JSON, nullable=True)  # 주요 구현 기능 (구조화된 JSON)
    # [{"title": "기능 제목", "items": ["상세 설명 1", "상세 설명 2"]}]

    development_timeline = Column(JSON, nullable=True)  # 개발 타임라인
    # [{"period": "2024-01 ~ 02", "title": "단계 제목", "activities": ["활동 1"]}]

    tech_stack_versions = Column(JSON, nullable=True)  # 기술 스택 + 버전 정보
    # {"Frontend": ["React 18.2.0", "TypeScript 5.0.2"], "Backend": ["FastAPI 0.100.0"]}

    detailed_achievements = Column(JSON, nullable=True)  # 상세 성과 (카테고리별)
    # {"새로운 기능 추가": [{"title": "기능", "description": "설명"}], "성능 개선": [...]}

    # Analysis metadata
    analyzed_at = Column(DateTime, default=datetime.utcnow)
    analysis_version = Column(String(20), default="1.0")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="repo_analysis")
    user_edits = relationship("RepoAnalysisEdits", back_populates="repo_analysis", uselist=False)
