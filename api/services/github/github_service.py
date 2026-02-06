"""
GitHub Service - Facade for GitHub API interactions.

This is the main public interface for GitHub functionality.
It delegates to specialized modules for better maintainability.

Modules:
- github_api_client.py: Low-level API interactions
- repo_analyzer.py: Repository analysis and technology detection
- contribution_analyzer.py: User contribution analysis
- contributor_analyzer.py: Helper functions for commit parsing
- github_constants.py: Constants and utility functions
- github_exceptions.py: Exception classes
"""
import asyncio
import logging
from typing import Dict, List, Any, Optional, Tuple

from .github_api_client import GitHubApiClient
from api.services.analysis.repo_analyzer import RepoAnalyzer
from api.services.analysis.contribution_analyzer import ContributionAnalyzer
from .github_exceptions import (
    GitHubServiceError,
    GitHubRateLimitError,
    GitHubNotFoundError,
    GitHubTimeoutError,
    GitHubAuthError,
)
from .github_constants import (
    MAX_CONCURRENT_FILE_CHECKS,
    MAX_CONCURRENT_COMMIT_DETAILS,
    MAX_CONCURRENT_LLM_CALLS,
    MAX_DETAILED_COMMITS,
    parse_iso_datetime,
    call_llm_generate,
)
from api.services.analysis.contributor_analyzer import (
    parse_conventional_commit as _parse_conventional_commit,
    detect_work_areas as _detect_work_areas,
    extract_file_extensions as _extract_file_extensions,
    detect_technologies_from_files as _detect_technologies_from_files,
)

logger = logging.getLogger(__name__)


class GitHubService:
    """
    Facade for GitHub API interactions.

    This class provides a unified interface for all GitHub-related operations.
    It delegates to specialized modules internally while maintaining backward
    compatibility with the original API.

    Usage:
        service = GitHubService(access_token="ghp_...")
        repos = await service.get_all_user_repos()
        analysis = await service.analyze_repository("https://github.com/user/repo")
    """

    DEFAULT_TIMEOUT = 30.0

    def __init__(self, access_token: str, timeout: float = None):
        """Initialize GitHub service with access token.

        Args:
            access_token: GitHub personal access token or OAuth token
            timeout: Request timeout in seconds (default: 30.0)
        """
        self.access_token = access_token
        self.timeout = timeout or self.DEFAULT_TIMEOUT

        # Initialize internal modules
        self._api = GitHubApiClient(access_token, self.timeout)
        self._repo_analyzer = RepoAnalyzer(self._api)
        self._contribution_analyzer = ContributionAnalyzer(self._api)

        # Expose base_url and headers for compatibility
        self.base_url = self._api.base_url
        self.headers = self._api.headers

    # ==========================================================================
    # Low-level API methods (delegated to GitHubApiClient)
    # ==========================================================================

    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make an authenticated request to GitHub API."""
        return await self._api._request(method, endpoint, **kwargs)

    def _parse_repo_url(self, git_url: str) -> tuple[str, str]:
        """Parse owner and repo name from git URL."""
        return self._api._parse_repo_url(git_url)

    # ==========================================================================
    # User & Repository Info
    # ==========================================================================

    async def get_user_info(self) -> Dict[str, Any]:
        """Get authenticated user's info."""
        return await self._api.get_user_info()

    async def get_repo_info(self, git_url: str) -> Dict[str, Any]:
        """Get repository information."""
        return await self._api.get_repo_info(git_url)

    async def get_repo_languages(self, git_url: str) -> Dict[str, float]:
        """Get repository languages with percentages."""
        return await self._api.get_repo_languages(git_url)

    # ==========================================================================
    # Repository Listing
    # ==========================================================================

    async def get_user_repos(
        self,
        page: int = 1,
        per_page: int = 100,
        sort: str = "updated"
    ) -> List[Dict[str, Any]]:
        """Get user's repositories (single page)."""
        return await self._api.get_user_repos(page, per_page, sort)

    async def get_all_user_repos(
        self,
        sort: str = "updated",
        max_pages: int = 10
    ) -> List[Dict[str, Any]]:
        """Get all user's repositories (multiple pages)."""
        return await self._api.get_all_user_repos(sort, max_pages)

    # ==========================================================================
    # Commits
    # ==========================================================================

    async def get_commits(
        self,
        git_url: str,
        author: Optional[str] = None,
        per_page: int = 100,
        max_pages: int = 5
    ) -> List[Dict[str, Any]]:
        """Get repository commits."""
        return await self._api.get_commits(git_url, author, per_page, max_pages)

    async def get_commit_details(
        self,
        git_url: str,
        sha: str,
        include_patch: bool = False
    ) -> Dict[str, Any]:
        """Get detailed information for a specific commit."""
        return await self._api.get_commit_details(git_url, sha, include_patch)

    async def _get_commit_details_safe(
        self,
        semaphore: asyncio.Semaphore,
        git_url: str,
        sha: str
    ) -> Dict[str, Any]:
        """Get commit details with semaphore for rate limiting."""
        return await self._api._get_commit_details_safe(semaphore, git_url, sha)

    # ==========================================================================
    # Contributors
    # ==========================================================================

    async def get_contributors_count(self, git_url: str) -> int:
        """Get the number of contributors for a repository."""
        return await self._api.get_contributors_count(git_url)

    async def get_all_contributors(self, git_url: str) -> List[Dict[str, Any]]:
        """Get all contributors for a repository."""
        return await self._api.get_all_contributors(git_url)

    # ==========================================================================
    # File Operations
    # ==========================================================================

    async def get_file_tree(
        self,
        git_url: str,
        path: str = "",
        ref: Optional[str] = None,
        recursive: bool = False
    ) -> List[Dict[str, Any]]:
        """Get file tree for a repository or specific directory."""
        return await self._api.get_file_tree(git_url, path, ref, recursive)

    async def get_file_content(
        self,
        git_url: str,
        file_path: str,
        ref: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get content of a specific file."""
        return await self._api.get_file_content(git_url, file_path, ref)

    # ==========================================================================
    # Repository Analysis (delegated to RepoAnalyzer)
    # ==========================================================================

    async def get_commit_stats(
        self,
        git_url: str,
        author: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get commit statistics for a repository."""
        return await self._repo_analyzer.get_commit_stats(git_url, author)

    async def get_repo_stats(
        self,
        git_url: str,
        username: Optional[str] = None,
        max_commits_for_stats: int = 100
    ) -> Dict[str, Any]:
        """Get comprehensive repository statistics."""
        return await self._repo_analyzer.get_repo_stats(git_url, username, max_commits_for_stats)

    async def detect_technologies(self, git_url: str) -> List[str]:
        """Detect technologies used in the repository."""
        return await self._repo_analyzer.detect_technologies(git_url)

    async def extract_tech_versions(self, git_url: str) -> Dict[str, List[str]]:
        """Extract technology versions from package files."""
        return await self._repo_analyzer.extract_tech_versions(git_url)

    async def analyze_repository(
        self,
        git_url: str,
        username: Optional[str] = None,
        include_detailed_stats: bool = True
    ) -> Dict[str, Any]:
        """Perform full repository analysis."""
        return await self._repo_analyzer.analyze_repository(git_url, username, include_detailed_stats)

    async def get_quick_repo_info(
        self,
        git_url: str,
        username: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get quick repository info for auto-fill."""
        return await self._repo_analyzer.get_quick_repo_info(git_url, username)

    async def analyze_code_quality(self, git_url: str) -> Dict[str, Any]:
        """Analyze code quality metrics for a repository."""
        return await self._repo_analyzer.analyze_code_quality(git_url)

    def _empty_quality_metrics(self) -> Dict[str, Any]:
        """Return empty quality metrics structure."""
        return self._repo_analyzer._empty_quality_metrics()

    # ==========================================================================
    # Contribution Analysis (delegated to ContributionAnalyzer)
    # ==========================================================================

    def calculate_contribution_percent(
        self,
        user_commits: int,
        total_commits: int,
        user_lines_added: int,
        total_lines_added: int,
        work_areas: Optional[List[str]] = None
    ) -> int:
        """Calculate weighted contribution percentage."""
        return self._contribution_analyzer.calculate_contribution_percent(
            user_commits, total_commits, user_lines_added, total_lines_added, work_areas
        )

    async def analyze_contributor(
        self,
        git_url: str,
        username: str,
        commit_limit: int = 100
    ) -> Dict[str, Any]:
        """Analyze a specific contributor's activity in a repository."""
        return await self._contribution_analyzer.analyze_contributor(
            git_url, username, commit_limit
        )

    async def get_user_code_contributions(
        self,
        git_url: str,
        username: str,
        max_commits: int = 30,
        max_total_patch_size: int = 50000
    ) -> Dict[str, Any]:
        """Get user's significant code contributions with code diffs."""
        return await self._contribution_analyzer.get_user_code_contributions(
            git_url, username, max_commits, max_total_patch_size
        )

    async def get_detailed_commits(
        self,
        git_url: str,
        author: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get detailed commit information with Conventional Commit parsing."""
        return await self._contribution_analyzer.get_detailed_commits(
            git_url, author, limit
        )

    # ==========================================================================
    # Commit Analysis Helper Methods (for backward compatibility)
    # ==========================================================================

    def _parse_conventional_commit(self, message: str) -> Dict[str, Any]:
        """Parse Conventional Commit message format."""
        return _parse_conventional_commit(message)

    def _detect_work_areas(self, file_paths: List[str]) -> List[str]:
        """Detect work areas from a list of file paths."""
        return _detect_work_areas(file_paths)

    def _extract_file_extensions(self, file_paths: List[str]) -> Dict[str, int]:
        """Extract and count file extensions from file paths."""
        return _extract_file_extensions(file_paths)

    def _detect_technologies_from_files(self, file_paths: List[str]) -> List[str]:
        """Detect technologies based on file paths and extensions."""
        return _detect_technologies_from_files(file_paths)

    # ==========================================================================
    # LLM Content Generation (delegated to content_generator module)
    # ==========================================================================

    async def generate_detailed_content(
        self,
        project_data: Dict[str, Any],
        analysis_data: Dict[str, Any],
        llm_service=None,
        language: str = "ko",
        code_contributions: Optional[Dict[str, Any]] = None
    ) -> Tuple[Dict[str, Any], int]:
        """Generate detailed content using LLM.

        Performance: Uses parallel LLM calls (3 calls in ~10-15 seconds).
        Delegates to content_generator module for actual LLM generation.

        Args:
            project_data: Project information
            analysis_data: Analysis data (commits, tech stack, etc.)
            llm_service: Optional LLM service instance
            language: Output language ("ko" or "en")
            code_contributions: Optional user's code contributions with patches

        Returns:
            Tuple of (result dict, total tokens used)
        """
        from api.services.core.content_generator import generate_detailed_content as _generate_content
        return await _generate_content(
            project_data=project_data,
            analysis_data=analysis_data,
            llm_service=llm_service,
            language=language,
            code_contributions=code_contributions
        )

    async def _get_commit_details_with_patch(
        self,
        semaphore: asyncio.Semaphore,
        git_url: str,
        sha: str
    ) -> Dict[str, Any]:
        """Get commit details with patch, with semaphore for rate limiting."""
        return await self._api._get_commit_details_with_patch(semaphore, git_url, sha)


# =============================================================================
# Convenience Exports
# =============================================================================

__all__ = [
    "GitHubService",
    "GitHubServiceError",
    "GitHubRateLimitError",
    "GitHubNotFoundError",
    "GitHubTimeoutError",
    "GitHubAuthError",
]
