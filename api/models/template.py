from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class Template(Base):
    """Resume/Portfolio templates for different platforms."""
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL for system templates

    name = Column(String(200), nullable=False)
    description = Column(Text)

    # Platform info
    platform = Column(String(50))  # saramin_1, saramin_2, saramin_3, wanted, remember, notion, custom
    is_system = Column(Integer, default=0)  # System-provided vs user-uploaded

    # Template type
    output_format = Column(String(20), default="docx")  # docx, pdf, md

    # Template content
    template_content = Column(Text)  # Markdown/HTML template with placeholders
    template_file_path = Column(String(500))  # Path to uploaded template file (if any)

    # Field mappings - which data fields map to template placeholders
    field_mappings = Column(JSON)  # {"{{company_name}}": "company.name", ...}

    # Template structure/sections
    sections = Column(JSON)  # ["summary", "experience", "projects", "skills", ...]

    # Style settings
    style_settings = Column(JSON)  # {"font": "Arial", "font_size": 11, ...}

    # Constraints
    max_projects = Column(Integer)
    max_characters = Column(Integer)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="templates")
    documents = relationship("GeneratedDocument", back_populates="template")
