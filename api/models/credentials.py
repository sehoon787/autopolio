from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base


class Certification(Base):
    """자격증 모델"""
    __tablename__ = "certifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name = Column(String(200), nullable=False)  # 자격증명
    issuer = Column(String(200))  # 발급기관
    issue_date = Column(Date)  # 취득일
    expiry_date = Column(Date, nullable=True)  # 만료일 (선택)
    credential_id = Column(String(100))  # 자격번호
    credential_url = Column(String(500))  # 검증 URL
    description = Column(Text)  # 설명

    # Attachment fields
    attachment_path = Column(String(500), nullable=True)
    attachment_name = Column(String(300), nullable=True)
    attachment_size = Column(Integer, nullable=True)  # bytes

    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="certifications")


class Award(Base):
    """수상이력 모델"""
    __tablename__ = "awards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name = Column(String(200), nullable=False)  # 수상명
    issuer = Column(String(200))  # 수여기관
    award_date = Column(Date)  # 수상일
    description = Column(Text)  # 상세 설명
    award_url = Column(String(500))  # 관련 URL

    # Attachment fields
    attachment_path = Column(String(500), nullable=True)
    attachment_name = Column(String(300), nullable=True)
    attachment_size = Column(Integer, nullable=True)  # bytes

    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="awards")


class Education(Base):
    """교육이력 모델"""
    __tablename__ = "educations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    school_name = Column(String(200), nullable=False)  # 학교명
    major = Column(String(200))  # 전공
    degree = Column(String(50))  # 학위 (학사/석사/박사/수료)
    start_date = Column(Date)  # 입학일
    end_date = Column(Date, nullable=True)  # 졸업일
    is_current = Column(Integer, default=0)  # 재학중 (SQLite boolean) - deprecated, use graduation_status
    graduation_status = Column(String(20), nullable=True)  # graduated/enrolled/completed/withdrawn
    gpa = Column(String(20))  # 학점
    description = Column(Text)  # 활동/특이사항

    # University metadata (from Hipo database)
    school_country = Column(String(100), nullable=True)  # Full country name (e.g., "South Korea")
    school_country_code = Column(String(10), nullable=True)  # ISO alpha-2 code (e.g., "KR")
    school_state = Column(String(100), nullable=True)  # State/province
    school_domain = Column(String(200), nullable=True)  # Primary email domain
    school_web_page = Column(String(500), nullable=True)  # Primary website URL

    # Attachment fields
    attachment_path = Column(String(500), nullable=True)
    attachment_name = Column(String(300), nullable=True)
    attachment_size = Column(Integer, nullable=True)  # bytes

    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="educations")


class Publication(Base):
    """논문/저술 모델"""
    __tablename__ = "publications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String(500), nullable=False)  # 논문/저서 제목
    authors = Column(String(500))  # 저자 (공동저자 포함)
    publication_type = Column(String(50))  # 유형 (journal/conference/book/patent)
    publisher = Column(String(200))  # 출판사/학술지/학회
    publication_date = Column(String(100))  # 발표일 (String for patent pipe-separated dates)
    doi = Column(String(200))  # DOI
    url = Column(String(500))  # 논문 URL
    description = Column(Text)  # 요약

    # Attachment fields
    attachment_path = Column(String(500), nullable=True)
    attachment_name = Column(String(300), nullable=True)
    attachment_size = Column(Integer, nullable=True)  # bytes

    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="publications")


class VolunteerActivity(Base):
    """봉사활동/대외활동 모델"""
    __tablename__ = "volunteer_activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name = Column(String(200), nullable=False)  # 활동명
    organization = Column(String(200))  # 기관/단체명
    activity_type = Column(String(50))  # volunteer (봉사활동) / external (대외활동)
    start_date = Column(Date)  # 시작일
    end_date = Column(Date, nullable=True)  # 종료일
    is_current = Column(Integer, default=0)  # 진행중 (SQLite boolean)
    hours = Column(Integer, nullable=True)  # 봉사시간 (봉사활동용)
    role = Column(String(100))  # 역할
    description = Column(Text)  # 상세 설명
    certificate_url = Column(String(500))  # 인증서 URL

    # Attachment fields
    attachment_path = Column(String(500), nullable=True)
    attachment_name = Column(String(300), nullable=True)
    attachment_size = Column(Integer, nullable=True)  # bytes

    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="volunteer_activities")
