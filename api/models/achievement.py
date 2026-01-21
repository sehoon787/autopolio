from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class ProjectAchievement(Base):
    """Project achievements based on PROJECT_PERFORMANCE_SUMMARY structure."""
    __tablename__ = "project_achievements"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)

    # Achievement details
    metric_name = Column(String(200), nullable=False)  # e.g., "Performance Improvement"
    metric_value = Column(String(100))  # e.g., "40%", "3x", "$100K"
    description = Column(Text)  # Detailed description

    # Before/After comparison values (for detailed achievements)
    before_value = Column(String(200))  # e.g., "5초 로딩 시간", "수동 배포"
    after_value = Column(String(200))  # e.g., "0.5초 로딩 시간", "자동 CI/CD"

    # Categorization
    category = Column(String(50))  # performance, cost, user, technical, business

    # Evidence/proof
    evidence = Column(Text)  # Links, screenshots, or documentation references

    # Display order
    display_order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="achievements")
