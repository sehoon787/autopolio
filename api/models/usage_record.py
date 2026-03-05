from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from api.database import Base


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    year_month = Column(String(7), nullable=False, index=True)  # "2026-03"
    llm_call_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
