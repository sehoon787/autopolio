from sqlalchemy import Column, Index, Integer, String, DateTime, Text, ForeignKey, Date, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class Technology(Base):
    """Master list of technologies."""
    __tablename__ = "technologies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    category = Column(String(50))  # language, framework, database, tool, etc.
    icon = Column(String(200))  # Icon URL or name

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    projects = relationship("ProjectTechnology", back_populates="technology")


class ProjectTechnology(Base):
    """Association table for project-technology many-to-many relationship."""
    __tablename__ = "project_technologies"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    technology_id = Column(Integer, ForeignKey("technologies.id"), nullable=False, index=True)
    is_primary = Column(Integer, default=0)  # Main tech vs supporting

    # Relationships
    project = relationship("Project", back_populates="technologies")
    technology = relationship("Technology", back_populates="projects")

    # Composite index for efficient lookup
    __table_args__ = (
        Index('ix_project_technologies_project_tech', 'project_id', 'technology_id'),
    )


class Project(Base):
    """Project information based on PROJECTS.md structure."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)

    # Basic info
    name = Column(String(200), nullable=False)
    short_description = Column(String(500))
    description = Column(Text)

    # Timeline
    start_date = Column(Date)
    end_date = Column(Date)

    # Team & Role
    team_size = Column(Integer)
    role = Column(String(200))  # e.g., "백엔드 개발 (기여도 70%)"
    contribution_percent = Column(Integer)  # 0-100

    # Git integration
    git_url = Column(String(500))
    is_analyzed = Column(Integer, default=0, index=True)

    # Project type and status
    project_type = Column(String(50))  # personal, company, open-source
    status = Column(String(50))  # completed, in-progress, maintained

    # Additional info stored as JSON
    links = Column(JSON)  # {"demo": "...", "docs": "..."}
    images = Column(JSON)  # ["image1.png", "image2.png"]

    # LLM generated content
    ai_summary = Column(Text)
    ai_key_features = Column(JSON)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="projects")
    company = relationship("Company", back_populates="projects")
    technologies = relationship("ProjectTechnology", back_populates="project", cascade="all, delete-orphan")
    achievements = relationship("ProjectAchievement", back_populates="project", cascade="all, delete-orphan")
    repo_analysis = relationship("RepoAnalysis", back_populates="project", uselist=False, cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="project", foreign_keys="Job.target_project_id")
