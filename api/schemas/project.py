from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import date, datetime
from typing import Optional, List, Dict, Any


# Shared validator functions
def validate_percent_range(v: Optional[int]) -> Optional[int]:
    """Validate percentage is between 0 and 100."""
    if v is not None and (v < 0 or v > 100):
        raise ValueError("Value must be between 0 and 100")
    return v


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
    after_value: Optional[str] = None  # After state for comparison
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


# ProjectRepository schemas
class ProjectRepositoryCreate(BaseModel):
    git_url: str
    label: Optional[str] = None
    is_primary: bool = False


class ProjectRepositoryResponse(BaseModel):
    id: int
    git_url: str
    label: Optional[str] = None
    display_order: int = 0
    is_primary: bool = False
    is_analyzed: bool = False

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def compute_is_analyzed(cls, data):
        """Compute is_analyzed from the presence of repo_analysis."""
        if hasattr(data, "repo_analysis"):
            if isinstance(data, dict):
                data["is_analyzed"] = data.get("repo_analysis") is not None
            else:
                data._computed_is_analyzed = data.repo_analysis is not None
        return data

    @model_validator(mode="after")
    def apply_computed_fields(self):
        if hasattr(self, "_computed_is_analyzed"):
            object.__setattr__(self, "is_analyzed", self._computed_is_analyzed)
        return self


# Project schemas
class ProjectBase(BaseModel):
    name: str
    short_description: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    team_size: Optional[int] = None
    role: Optional[str] = None
    contribution_percent: Optional[int] = Field(None, description="기여도 (0-100%)")
    git_url: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None
    links: Optional[Dict[str, str]] = None
    images: Optional[List[str]] = None

    _validate_contribution = field_validator("contribution_percent")(
        validate_percent_range
    )


class ProjectCreate(ProjectBase):
    company_id: Optional[int] = None
    technologies: Optional[List[str]] = None  # List of technology names
    repositories: Optional[List[ProjectRepositoryCreate]] = None  # Multi-repo support


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    team_size: Optional[int] = None
    role: Optional[str] = None
    contribution_percent: Optional[int] = Field(None, description="기여도 (0-100%)")
    git_url: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None
    links: Optional[Dict[str, str]] = None
    images: Optional[List[str]] = None
    company_id: Optional[int] = None
    technologies: Optional[List[str]] = None
    repositories: Optional[List[ProjectRepositoryCreate]] = None  # Multi-repo support

    _validate_contribution = field_validator("contribution_percent")(
        validate_percent_range
    )


class ProjectResponse(ProjectBase):
    id: int
    user_id: int
    company_id: Optional[int] = None
    is_analyzed: bool = False
    ai_summary: Optional[str] = None
    ai_key_features: Optional[List[str]] = None
    last_analyzed_at: Optional[datetime] = None
    analysis_language: Optional[str] = None
    ai_tools_detected: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    updated_at: datetime
    technologies: List[TechnologyResponse] = []
    achievements: List[AchievementResponse] = []
    repositories: List[ProjectRepositoryResponse] = []

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def transform_technologies(cls, data):
        """Transform ProjectTechnology associations to Technology objects."""
        if hasattr(data, "technologies") and data.technologies:
            # ORM object - extract Technology from ProjectTechnology
            tech_list = []
            for pt in data.technologies:
                if hasattr(pt, "technology") and pt.technology:
                    tech_list.append(pt.technology)
            # Store transformed list in a temp attribute
            data._transformed_technologies = tech_list
        elif isinstance(data, dict) and "technologies" in data and data["technologies"]:
            # Dict - transform if needed
            tech_list = []
            for pt in data["technologies"]:
                if hasattr(pt, "technology") and pt.technology:
                    tech_list.append(pt.technology)
                elif isinstance(pt, dict) and "technology" in pt:
                    tech_list.append(pt["technology"])
                else:
                    tech_list.append(pt)
            data["technologies"] = tech_list
        return data

    @model_validator(mode="after")
    def apply_transformed_technologies(self):
        """Apply transformed technologies after model creation."""
        if hasattr(self, "_transformed_technologies"):
            object.__setattr__(
                self,
                "technologies",
                [
                    TechnologyResponse.model_validate(t, from_attributes=True)
                    for t in self._transformed_technologies
                ],
            )
        return self


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]
    total: int
    page: int
    page_size: int
