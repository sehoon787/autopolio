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
    fork: bool = False
    owner: str = ""


class RepoAnalysisRequest(BaseModel):
    """Request to analyze a GitHub repository."""

    git_url: str
    project_id: Optional[int] = None  # Associate with existing project
    summary_style: Optional[str] = (
        None  # "professional", "casual", "technical" - uses user default if not specified
    )


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
    key_tasks: Optional[List[str]] = None  # LLM-generated key tasks
    # LLM-generated detailed content (v1.2)
    implementation_details: Optional[List[Dict[str, Any]]] = None  # [{title, items}]
    development_timeline: Optional[List[Dict[str, Any]]] = (
        None  # [{period, title, activities}]
    )
    tech_stack_versions: Optional[Dict[str, List[str]]] = (
        None  # {Frontend: [...], Backend: [...]}
    )
    detailed_achievements: Optional[Dict[str, List[Dict[str, str]]]] = (
        None  # {category: [{title, description}]}
    )
    # AI-generated summary (v1.12)
    ai_summary: Optional[str] = None
    ai_key_features: Optional[List[str]] = None
    # User's code contributions context (v1.12)
    user_code_contributions: Optional[Dict[str, Any]] = None
    analyzed_at: datetime
    # LLM usage tracking (v1.8)
    provider: Optional[str] = None
    token_usage: Optional[int] = None
    # Auto-calculated contribution percent (v1.12)
    suggested_contribution_percent: Optional[int] = None
    # Language used for analysis (v1.12)
    analysis_language: str = "ko"  # "ko" or "en"
    # AI tools detected from commits (v1.17)
    ai_tools_detected: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True


class GitHubRepoListResponse(BaseModel):
    """List of user's GitHub repositories."""

    repos: List[GitHubRepoInfo]
    total: int
    page: int = 1
    per_page: int = 100
    has_more: bool = False
    cached: bool = False
    cached_at: Optional[str] = None


class ImportReposRequest(BaseModel):
    """Request to import multiple repos as projects."""

    repo_urls: List[str]
    auto_analyze: bool = False


class ImportRepoResult(BaseModel):
    """Result of importing a single repo."""

    repo_url: str
    project_id: Optional[int] = None
    project_name: str
    success: bool
    message: str


class ImportReposResponse(BaseModel):
    """Response from batch import."""

    imported: int
    failed: int
    results: List[ImportRepoResult]


class BatchAnalysisRequest(BaseModel):
    """Request to analyze multiple projects."""

    project_ids: List[int]
    # LLM settings (v1.8)
    llm_provider: Optional[str] = None  # 'openai', 'anthropic', 'gemini'
    cli_mode: Optional[str] = None  # 'claude_code' or 'gemini_cli'
    cli_model: Optional[str] = None  # Model name for CLI


class BatchAnalysisResult(BaseModel):
    """Result of analyzing a single project."""

    project_id: int
    project_name: str
    success: bool
    message: str
    detected_technologies: Optional[List[str]] = None
    detected_role: Optional[str] = None


class BatchAnalysisResponse(BaseModel):
    """Response from batch analysis."""

    task_id: Optional[str] = None
    total: int
    completed: int
    failed: int
    results: List[BatchAnalysisResult]


# ============ Inline Editing Schemas ============


class AnalysisContentUpdate(BaseModel):
    """Request to update analysis content."""

    field: str  # 'key_tasks', 'implementation_details', or 'detailed_achievements'
    content: Any  # The updated content (type depends on field)


class ImplementationDetailItem(BaseModel):
    """Single implementation detail item."""

    title: str
    items: List[str]


class DetailedAchievementItem(BaseModel):
    """Single detailed achievement item."""

    title: str
    description: str


class EditStatus(BaseModel):
    """Status of edited fields."""

    key_tasks_modified: bool = False
    implementation_details_modified: bool = False
    detailed_achievements_modified: bool = False


class EffectiveAnalysisResponse(BaseModel):
    """Analysis response with user edits applied."""

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
    # These fields may contain edited content
    key_tasks: Optional[List[str]] = None
    implementation_details: Optional[List[Dict[str, Any]]] = None
    development_timeline: Optional[List[Dict[str, Any]]] = None
    tech_stack_versions: Optional[Dict[str, List[str]]] = None
    detailed_achievements: Optional[Dict[str, List[Dict[str, str]]]] = None
    # AI-generated summary (v1.12)
    ai_summary: Optional[str] = None
    ai_key_features: Optional[List[str]] = None
    analyzed_at: datetime
    # Edit status
    edit_status: EditStatus
    # Auto-calculated contribution percent (v1.12)
    suggested_contribution_percent: Optional[int] = None
    # Language used for analysis (v1.12)
    analysis_language: str = "ko"  # "ko" or "en"
    # AI tools detected from commits (v1.17)
    ai_tools_detected: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True


class RepoAnalysisSummary(BaseModel):
    """Per-repo analysis summary for multi-repo projects."""

    repo_url: str
    label: Optional[str] = None
    is_primary: bool = False
    total_commits: int = 0
    user_commits: int = 0
    lines_added: int = 0
    lines_deleted: int = 0
    files_changed: int = 0
    detected_technologies: List[str] = []
    primary_language: Optional[str] = None
    key_tasks: Optional[List[str]] = None
    # Rich per-repo fields (v1.17)
    implementation_details: Optional[List[Dict[str, Any]]] = None
    detailed_achievements: Optional[Dict[str, List[Dict[str, str]]]] = None
    ai_summary: Optional[str] = None
    ai_key_features: Optional[List[str]] = None
    languages: Optional[Dict[str, float]] = None
    commit_categories: Optional[Dict[str, int]] = None
    development_timeline: Optional[List[Dict[str, Any]]] = None
    ai_tools_detected: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True


class MultiRepoAnalysisResponse(BaseModel):
    """All per-repo analyses for a multi-repo project."""

    project_id: int
    repo_count: int
    analyses: List[RepoAnalysisSummary]

    class Config:
        from_attributes = True


# ============ Extended Analysis Schemas (v1.10) ============


class DetailedCommit(BaseModel):
    """Detailed commit information with Conventional Commit parsing."""

    sha: str
    short_sha: Optional[str] = None  # Will be derived from sha if not provided
    message: str
    full_message: Optional[str] = None
    author: str
    author_email: Optional[str] = None
    date: datetime
    commit_type: str = (
        "other"  # feat, fix, refactor, docs, test, chore, perf, style, other
    )
    type_label: str = "Other"  # Human-readable label
    scope: Optional[str] = None
    description: Optional[str] = None  # Will be derived from message if not provided
    is_breaking: bool = False
    files_changed: int = 0
    lines_added: int = 0
    lines_deleted: int = 0
    work_areas: List[str] = []  # ["frontend", "backend", "tests", ...]

    def model_post_init(self, __context) -> None:
        """Fill in derived fields after model initialization."""
        if self.short_sha is None and self.sha:
            object.__setattr__(self, "short_sha", self.sha[:7])
        if self.description is None and self.message:
            object.__setattr__(self, "description", self.message.split("\n")[0][:100])


class ContributorSummary(BaseModel):
    """Summary info for a single contributor."""

    username: str
    avatar_url: Optional[str] = None
    contributions: int = 0
    html_url: Optional[str] = None


class ContributorAnalysisResponse(BaseModel):
    """Full contributor analysis response."""

    username: str
    email: Optional[str] = None
    is_primary: bool = False
    total_commits: int = 0
    first_commit_date: Optional[datetime] = None
    last_commit_date: Optional[datetime] = None
    lines_added: int = 0
    lines_deleted: int = 0
    file_extensions: Dict[str, int] = {}  # {".py": 45, ".ts": 30}
    work_areas: List[str] = []  # ["frontend", "backend", "tests"]
    detected_technologies: List[str] = []
    detailed_commits: List[DetailedCommit] = []
    commit_types: Dict[str, int] = {}  # {"feat": 40, "fix": 30}

    class Config:
        from_attributes = True


class FileCountByType(BaseModel):
    """File counts by type."""

    code: int = 0
    test: int = 0
    docs: int = 0
    config: int = 0


class CodeQualityMetrics(BaseModel):
    """Code quality metrics for a repository."""

    total_files: int = 0
    total_lines: int = 0  # Estimated
    avg_file_size: float = 0
    max_file_size: int = 0
    test_file_ratio: float = 0  # Percentage of test files
    doc_file_ratio: float = 0  # Percentage of doc files
    code_file_ratio: float = 0  # Percentage of code files
    config_file_count: int = 0
    language_distribution: Dict[str, float] = {}  # {".py": 45.5, ".ts": 30.2}
    file_count_by_type: FileCountByType = FileCountByType()


class ContributorsListResponse(BaseModel):
    """List of all contributors in a repository."""

    contributors: List[ContributorSummary]
    total: int


class ExtendedRepoAnalysisResponse(RepoAnalysisResponse):
    """Extended analysis response with contributor and quality metrics."""

    # Repository-level technologies (separate from user-detected)
    repo_technologies: List[str] = []
    # All contributors summary
    all_contributors: List[ContributorSummary] = []
    # Code quality metrics
    code_quality_metrics: Optional[CodeQualityMetrics] = None
    # Contributor analyses
    contributors: List[ContributorAnalysisResponse] = []
    # Primary contributor (logged-in user)
    primary_contributor: Optional[ContributorAnalysisResponse] = None


# ============ Analysis Job Schemas (v1.12) ============


class AnalysisJobStatus(BaseModel):
    """Status of an analysis job."""

    task_id: str
    project_id: Optional[int] = None
    status: str  # pending, running, completed, failed, cancelled
    progress: int  # 0-100
    current_step: int
    total_steps: int
    step_name: Optional[str] = None
    error_message: Optional[str] = None
    partial_results: Optional[Dict[str, Any]] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    token_usage: Optional[int] = None  # Total tokens used in LLM calls
    llm_provider: Optional[str] = None  # LLM provider used

    class Config:
        from_attributes = True


class AnalysisJobListResponse(BaseModel):
    """List of active analysis jobs."""

    jobs: List[AnalysisJobStatus]
    total: int


class StartAnalysisResponse(BaseModel):
    """Response when starting a background analysis."""

    task_id: str
    project_id: int
    message: str


class CancelAnalysisResponse(BaseModel):
    """Response when cancelling an analysis."""

    task_id: str
    project_id: int
    status: str
    message: str
    partial_saved: bool = False
