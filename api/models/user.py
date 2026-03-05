from sqlalchemy import Column, Integer, String, DateTime, Text, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base
from api.constants import LLMProvider, DEFAULT_MODELS


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True)
    github_username = Column(String(100), unique=True, index=True)
    github_token_encrypted = Column(Text)  # Encrypted OAuth token
    github_avatar_url = Column(String(500))

    # Pricing tier
    tier = Column(String(20), default="free")  # free, pro, enterprise

    # Personal info fields (NULL = use OAuth default, "" = intentionally empty)
    display_name = Column(String(100))  # Name for resume (overrides OAuth name)
    profile_email = Column(String(255))  # Contact email (separate from login email)
    phone = Column(String(50))  # Phone number
    address = Column(String(500))  # Address
    birthdate = Column(Date)  # Date of birth
    profile_photo_url = Column(String(500))  # Profile photo path (for resume/portfolio)

    # LLM preferences
    preferred_llm = Column(
        String(50), default="openai"
    )  # "openai", "anthropic", or "gemini"

    # Language preference for analysis results
    preferred_language = Column(String(10), default="ko")  # "ko" or "en"

    # Document generation preferences
    default_summary_style = Column(
        String(50), default="professional"
    )  # professional, casual, technical
    default_output_format = Column(String(10), default="docx")  # docx, pdf, md
    default_include_achievements = Column(
        String(5), default="true"
    )  # "true" or "false" (SQLite bool workaround)
    default_include_tech_stack = Column(String(5), default="true")  # "true" or "false"
    default_skip_llm_summary = Column(String(5), default="false")  # "true" or "false"
    default_regenerate_summaries = Column(
        String(5), default="false"
    )  # "true" or "false"

    # Model preferences per provider
    openai_model = Column(String(100), default=DEFAULT_MODELS[LLMProvider.OPENAI])
    anthropic_model = Column(String(100), default=DEFAULT_MODELS[LLMProvider.ANTHROPIC])
    gemini_model = Column(String(100), default=DEFAULT_MODELS[LLMProvider.GEMINI])

    # Encrypted API keys for LLM providers
    openai_api_key_encrypted = Column(Text)
    anthropic_api_key_encrypted = Column(Text)
    gemini_api_key_encrypted = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    companies = relationship(
        "Company", back_populates="user", cascade="all, delete-orphan"
    )
    projects = relationship(
        "Project", back_populates="user", cascade="all, delete-orphan"
    )
    templates = relationship(
        "Template", back_populates="user", cascade="all, delete-orphan"
    )
    documents = relationship(
        "GeneratedDocument", back_populates="user", cascade="all, delete-orphan"
    )
    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")
    platform_templates = relationship(
        "PlatformTemplate", back_populates="user", cascade="all, delete-orphan"
    )

    # Credentials relationships
    certifications = relationship(
        "Certification", back_populates="user", cascade="all, delete-orphan"
    )
    awards = relationship("Award", back_populates="user", cascade="all, delete-orphan")
    educations = relationship(
        "Education", back_populates="user", cascade="all, delete-orphan"
    )
    publications = relationship(
        "Publication", back_populates="user", cascade="all, delete-orphan"
    )
    volunteer_activities = relationship(
        "VolunteerActivity", back_populates="user", cascade="all, delete-orphan"
    )

    # OAuth identities - support for multiple OAuth providers
    oauth_identities = relationship(
        "OAuthIdentity", back_populates="user", cascade="all, delete-orphan"
    )
