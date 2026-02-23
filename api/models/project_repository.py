from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class ProjectRepository(Base):
    """Association between a project and one of its Git repositories.

    A project can have multiple repositories (e.g., backend, frontend, infra).
    """

    __tablename__ = "project_repositories"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    git_url = Column(String(500), nullable=False)
    label = Column(String(100))  # "Backend", "Frontend", "Infra", etc.
    display_order = Column(Integer, default=0)
    is_primary = Column(
        Integer, default=0
    )  # 1 = primary repo (used for contribution display)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="repositories")
    repo_analysis = relationship(
        "RepoAnalysis",
        back_populates="project_repository",
        uselist=False,
        cascade="all, delete-orphan",
    )
