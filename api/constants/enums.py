"""Centralized StrEnum definitions for the Autopolio backend.

StrEnum inherits from str, so enum values work seamlessly with string
comparisons, JSON serialization, and SQLAlchemy column defaults:
    JobStatus.PENDING == "pending"  # True
"""

from enum import StrEnum


class JobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class LLMProvider(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"


class CLIType(StrEnum):
    CLAUDE_CODE = "claude_code"
    GEMINI_CLI = "gemini_cli"
    CODEX_CLI = "codex_cli"


class DocumentFormat(StrEnum):
    DOCX = "docx"
    PDF = "pdf"
    MD = "md"
    HTML = "html"


class ProjectType(StrEnum):
    PERSONAL = "personal"
    COMPANY = "company"
    OPEN_SOURCE = "open-source"


class ProjectStatus(StrEnum):
    COMPLETED = "completed"
    IN_PROGRESS = "in-progress"
    MAINTAINED = "maintained"


class EmploymentType(StrEnum):
    FULL_TIME = "full-time"
    CONTRACT = "contract"
    FREELANCE = "freelance"
    INTERN = "intern"


class GraduationStatus(StrEnum):
    GRADUATED = "graduated"
    ENROLLED = "enrolled"
    COMPLETED = "completed"
    WITHDRAWN = "withdrawn"


class ActivityType(StrEnum):
    VOLUNTEER = "volunteer"
    EXTERNAL = "external"


class PublicationType(StrEnum):
    JOURNAL = "journal"
    CONFERENCE = "conference"
    BOOK = "book"
    PATENT = "patent"


class SummaryStyle(StrEnum):
    PROFESSIONAL = "professional"
    CASUAL = "casual"
    TECHNICAL = "technical"
