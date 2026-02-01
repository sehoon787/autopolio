from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class PlatformTemplate(Base):
    """Platform-specific resume templates (Saramin, Remember, Jumpit, etc.)."""
    __tablename__ = "platform_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL for system templates

    # Platform info
    name = Column(String(200), nullable=False)
    platform_key = Column(String(50), nullable=False)  # saramin, remember, jumpit
    description = Column(Text)
    page_url = Column(String(500))  # Original page URL (if scraped)

    # Template content
    html_content = Column(Text)  # HTML template with Mustache placeholders
    css_content = Column(Text)  # Extracted/embedded CSS
    original_html = Column(Text)  # Original HTML (reference)
    screenshot_path = Column(String(500))

    # Field mappings
    field_mappings = Column(JSON)
    # {
    #   "name": {"selector": ".profile-name", "type": "text"},
    #   "experiences": {"selector": ".experience-list", "type": "section"}
    # }

    # CSS selectors for various elements
    selectors = Column(JSON)
    # {
    #   "header": ".header",
    #   "sections": {"experience": "#exp", "projects": "#proj"}
    # }

    # Metadata
    is_system = Column(Integer, default=0)  # 1 = system template, 0 = user template
    requires_login = Column(Integer, default=0)  # Whether original page requires login
    scrape_status = Column(String(20))  # pending, success, failed

    # Platform branding
    platform_color = Column(String(20))  # Primary color (e.g., "#0066cc")
    platform_logo_url = Column(String(500))

    # Features list
    features = Column(JSON)  # ["프린트 최적화", "반응형 디자인", ...]

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="platform_templates")
