from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any


class GitHubConnectRequest(BaseModel):
    """Request to initiate GitHub OAuth flow."""
    redirect_url: Optional[str] = None


class GitHubCallbackResponse(BaseModel):
    """Response after GitHub OAuth callback."""
    success: bool
    user_id: int
    github_username: str
    github_avatar_url: Optional[str] = None
    message: str


class GitHubUserInfo(BaseModel):
    """GitHub user information."""
    login: str
    id: int
    avatar_url: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    public_repos: int = 0
    followers: int = 0
    following: int = 0


class GitHubRepoInfo(BaseModel):
    """GitHub repository information."""
    id: int
    name: str
    full_name: str
    description: Optional[str] = None
    html_url: str
    clone_url: str
    language: Optional[str] = None
    stargazers_count: int = 0
    forks_count: int = 0
    created_at: datetime
    updated_at: datetime
    pushed_at: Optional[datetime] = None


class RepoAnalysisRequest(BaseModel):
    """Request to analyze a GitHub repository."""
    git_url: str
    project_id: Optional[int] = None  # Associate with existing project


class RepoAnalysisResponse(BaseModel):
    """Response from repository analysis."""
    id: int
    project_id: int
    git_url: str
    total_commits: int
    user_commits: int
    lines_added: int
    lines_deleted: int
    files_changed: int
    languages: Dict[str, float]
    primary_language: Optional[str] = None
    detected_technologies: List[str]
    commit_messages_summary: Optional[str] = None
    commit_categories: Optional[Dict[str, int]] = None
    architecture_patterns: Optional[List[str]] = None
    analyzed_at: datetime

    class Config:
        from_attributes = True


class GitHubRepoListResponse(BaseModel):
    """List of user's GitHub repositories."""
    repos: List[GitHubRepoInfo]
    total: int
