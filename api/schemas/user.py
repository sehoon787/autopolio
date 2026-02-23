from pydantic import BaseModel, EmailStr
from datetime import datetime, date
from typing import Optional


class UserBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    github_username: Optional[str] = None
    preferred_llm: str = "openai"
    preferred_language: str = "ko"  # "ko" or "en"


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    preferred_llm: Optional[str] = None
    preferred_language: Optional[str] = None  # "ko" or "en"


class GenerationOptionsUpdate(BaseModel):
    """Update generation options preferences"""

    # AI Analysis settings
    default_summary_style: Optional[str] = None  # professional, casual, technical
    default_analysis_language: Optional[str] = None  # ko, en
    default_analysis_scope: Optional[str] = None  # quick, standard, detailed
    # Document generation settings (stored for reference, but used in Generate page)
    default_output_format: Optional[str] = None  # docx, pdf, md
    default_include_achievements: Optional[bool] = None
    default_include_tech_stack: Optional[bool] = None


class GenerationOptionsResponse(BaseModel):
    """Generation options response"""

    # AI Analysis settings
    default_summary_style: str = "professional"
    default_analysis_language: str = "ko"
    default_analysis_scope: str = "standard"
    # Document generation settings
    default_output_format: str = "docx"
    default_include_achievements: bool = True
    default_include_tech_stack: bool = True

    class Config:
        from_attributes = True


class UserResponse(UserBase):
    id: int
    github_avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Profile schemas for personal info management
class OAuthDefaults(BaseModel):
    """Default values from primary OAuth provider"""

    name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class UserProfileUpdate(BaseModel):
    """Profile update request - fields can be:
    - None/omitted: keep current value
    - "": intentionally empty (user cleared the field)
    - value: user-entered value
    """

    display_name: Optional[str] = None
    profile_email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    birthdate: Optional[date] = None
    # profile_photo_url is updated via separate upload endpoint


class UserProfileResponse(BaseModel):
    """Profile response with user values, OAuth defaults, and effective values"""

    # User-entered values (can be None or "")
    display_name: Optional[str] = None
    profile_email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    birthdate: Optional[date] = None
    profile_photo_url: Optional[str] = None  # Profile photo for resume

    # OAuth default values
    oauth_defaults: OAuthDefaults

    # Effective values (user value if set, otherwise OAuth default)
    effective_name: str
    effective_email: Optional[str] = None
    effective_avatar_url: Optional[str] = None
    effective_photo_url: Optional[str] = None  # profile_photo_url or github_avatar_url

    class Config:
        from_attributes = True
