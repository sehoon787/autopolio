from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    name = Column(String(200), nullable=False)
    position = Column(String(200))  # Job title/role
    department = Column(String(200))
    employment_type = Column(String(50))  # full-time, contract, freelance, intern

    start_date = Column(Date)
    end_date = Column(Date)  # NULL if current
    is_current = Column(Integer, default=0)  # SQLite boolean

    description = Column(Text)
    location = Column(String(200))
    company_url = Column(String(500))

    # Logo
    logo_path = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="companies")
    projects = relationship("Project", back_populates="company", cascade="all, delete-orphan")
