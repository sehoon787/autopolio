from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class UserBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    github_username: Optional[str] = None
    preferred_llm: str = "openai"


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    preferred_llm: Optional[str] = None


class UserResponse(UserBase):
    id: int
    github_avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
