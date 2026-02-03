from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True)
    github_username = Column(String(100), unique=True, index=True)
    github_token_encrypted = Column(Text)  # Encrypted OAuth token
    github_avatar_url = Column(String(500))

    # LLM preferences
    preferred_llm = Column(String(50), default="openai")  # "openai", "anthropic", or "gemini"

    # Model preferences per provider
    openai_model = Column(String(100), default="gpt-4-turbo-preview")
    anthropic_model = Column(String(100), default="claude-3-5-sonnet-20241022")
    gemini_model = Column(String(100), default="gemini-2.0-flash")

    # Encrypted API keys for LLM providers
    openai_api_key_encrypted = Column(Text)
    anthropic_api_key_encrypted = Column(Text)
    gemini_api_key_encrypted = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    companies = relationship("Company", back_populates="user", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    templates = relationship("Template", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("GeneratedDocument", back_populates="user", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")
    platform_templates = relationship("PlatformTemplate", back_populates="user", cascade="all, delete-orphan")

    # Credentials relationships
    certifications = relationship("Certification", back_populates="user", cascade="all, delete-orphan")
    awards = relationship("Award", back_populates="user", cascade="all, delete-orphan")
    educations = relationship("Education", back_populates="user", cascade="all, delete-orphan")
    publications = relationship("Publication", back_populates="user", cascade="all, delete-orphan")
    volunteer_activities = relationship("VolunteerActivity", back_populates="user", cascade="all, delete-orphan")

    # OAuth identities - support for multiple OAuth providers
    oauth_identities = relationship("OAuthIdentity", back_populates="user", cascade="all, delete-orphan")
