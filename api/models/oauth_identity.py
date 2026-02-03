"""
OAuth Identity Model - Stores OAuth connections for multiple providers per user
Supports: GitHub, Google, Apple, Naver, Kakao
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey,
    UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.database import Base


class OAuthIdentity(Base):
    """OAuth identity linking users to OAuth providers"""
    __tablename__ = "oauth_identities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Provider information
    provider = Column(String(50), nullable=False)  # 'github', 'google', 'apple', 'naver', 'kakao'
    provider_user_id = Column(String(255), nullable=False)  # Unique ID from provider

    # User info from provider
    username = Column(String(255))  # Display name or username
    email = Column(String(255))  # Email from provider
    avatar_url = Column(String(500))

    # OAuth tokens (encrypted)
    access_token_encrypted = Column(Text)
    refresh_token_encrypted = Column(Text)
    token_expires_at = Column(DateTime)

    # Metadata
    is_primary = Column(Boolean, default=False)  # Primary login method
    raw_data = Column(Text)  # JSON blob of raw provider data for debugging

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    # Constraints
    __table_args__ = (
        # Each provider user ID can only be linked to one user
        UniqueConstraint('provider', 'provider_user_id', name='uq_oauth_provider_user'),
        # Index for quick lookup by user and provider
        Index('ix_oauth_user_provider', 'user_id', 'provider'),
    )

    # Relationships
    user = relationship("User", back_populates="oauth_identities")

    def __repr__(self):
        return f"<OAuthIdentity(id={self.id}, provider={self.provider}, username={self.username})>"
