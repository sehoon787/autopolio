from pydantic import BaseModel, model_validator
from datetime import date, datetime
from typing import Optional, List, Dict, Any


# Technology schemas
class TechnologyBase(BaseModel):
    name: str
    category: Optional[str] = None
    icon: Optional[str] = None


class TechnologyCreate(TechnologyBase):
    pass


class TechnologyResponse(TechnologyBase):
    id: int

    class Config:
        from_attributes = True


# Achievement schemas
class AchievementBase(BaseModel):
    metric_name: str
    metric_value: Optional[str] = None
    description: Optional[str] = None
    before_value: Optional[str] = None  # Before state for comparison
    after_value: Optional[str] = None   # After state for comparison
    category: Optional[str] = None
    evidence: Optional[str] = None
    display_order: int = 0


class AchievementCreate(AchievementBase):
    pass


class AchievementUpdate(BaseModel):
    metric_name: Optional[str] = None
    metric_value: Optional[str] = None
    description: Optional[str] = None
    before_value: Optional[str] = None
    after_value: Optional[str] = None
    category: Optional[str] = None
    evidence: Optional[str] = None
    display_order: Optional[int] = None


class AchievementResponse(AchievementBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Project schemas
class ProjectBase(BaseModel):
    name: str
    short_description: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    team_size: Optional[int] = None
    role: Optional[str] = None
    contribution_percent: Optional[int] = None
    git_url: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None
    links: Optional[Dict[str, str]] = None
    images: Optional[List[str]] = None


class ProjectCreate(ProjectBase):
    company_id: Optional[int] = None
    technologies: Optional[List[str]] = None  # List of technology names


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    team_size: Optional[int] = None
    role: Optional[str] = None
    contribution_percent: Optional[int] = None
    git_url: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None
    links: Optional[Dict[str, str]] = None
    images: Optional[List[str]] = None
    company_id: Optional[int] = None
    technologies: Optional[List[str]] = None


class ProjectResponse(ProjectBase):
    id: int
    user_id: int
    company_id: Optional[int] = None
    is_analyzed: bool = False
    ai_summary: Optional[str] = None
    ai_key_features: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime
    technologies: List[TechnologyResponse] = []
    achievements: List[AchievementResponse] = []

    class Config:
        from_attributes = True

    @model_validator(mode='before')
    @classmethod
    def transform_technologies(cls, data):
        """Transform ProjectTechnology associations to Technology objects."""
        if hasattr(data, 'technologies') and data.technologies:
            # ORM object - extract Technology from ProjectTechnology
            tech_list = []
            for pt in data.technologies:
                if hasattr(pt, 'technology') and pt.technology:
                    tech_list.append(pt.technology)
            # Store transformed list in a temp attribute
            data._transformed_technologies = tech_list
        elif isinstance(data, dict) and 'technologies' in data and data['technologies']:
            # Dict - transform if needed
            tech_list = []
            for pt in data['technologies']:
                if hasattr(pt, 'technology') and pt.technology:
                    tech_list.append(pt.technology)
                elif isinstance(pt, dict) and 'technology' in pt:
                    tech_list.append(pt['technology'])
                else:
                    tech_list.append(pt)
            data['technologies'] = tech_list
        return data

    @model_validator(mode='after')
    def apply_transformed_technologies(self):
        """Apply transformed technologies after model creation."""
        if hasattr(self, '_transformed_technologies'):
            object.__setattr__(self, 'technologies', [
                TechnologyResponse.model_validate(t, from_attributes=True)
                for t in self._transformed_technologies
            ])
        return self


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]
    total: int
    page: int
    page_size: int
