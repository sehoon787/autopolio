from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class GeneratedDocument(Base):
    """Generated resume/portfolio documents."""
    __tablename__ = "generated_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)

    # Document info
    document_name = Column(String(300), nullable=False)
    description = Column(Text)

    # File info
    file_path = Column(String(500), nullable=False)
    file_format = Column(String(20))  # docx, pdf, md
    file_size = Column(Integer)  # bytes

    # Content tracking
    included_projects = Column(JSON)  # List of project IDs included
    included_companies = Column(JSON)  # List of company IDs included

    # Generation settings used
    generation_settings = Column(JSON)  # LLM settings, formatting options, etc.

    # Version tracking
    version = Column(Integer, default=1)
    parent_document_id = Column(Integer, ForeignKey("generated_documents.id"), nullable=True)

    # Status
    status = Column(String(50), default="completed")  # completed, draft, archived

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="documents")
    template = relationship("Template", back_populates="documents")
    job = relationship("Job", back_populates="documents")
    parent_document = relationship("GeneratedDocument", remote_side=[id])
