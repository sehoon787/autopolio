"""
GitHub API module for testing.

Note: API parameters must match the actual endpoint definitions:
- detect_technologies: uses 'git_url' (not 'repo_url')
- analyze: user_id is a query param, git_url/project_id in body
"""

from typing import Optional
import httpx
from .base import BaseAPIModule


class GitHubAPI(BaseAPIModule):
    """API module for GitHub integration endpoints."""

    def get_status(self, user_id: int) -> httpx.Response:
        """Get GitHub connection status for a user."""
        return self._get("/github/status", params={"user_id": user_id})

    def get_connect_url(self, user_id: int) -> httpx.Response:
        """Get GitHub OAuth connect URL."""
        return self._get("/github/connect", params={"user_id": user_id})

    def disconnect(self, user_id: int) -> httpx.Response:
        """Disconnect GitHub from user account."""
        return self._delete("/github/disconnect", params={"user_id": user_id})

    def list_repos(self, user_id: int) -> httpx.Response:
        """List user's GitHub repositories."""
        return self._get("/github/repos", params={"user_id": user_id})

    def get_repo_info(self, user_id: int, git_url: str) -> httpx.Response:
        """Get basic information about a repository."""
        return self._get("/github/repo-info", params={
            "user_id": user_id,
            "git_url": git_url
        })

    def detect_technologies(self, user_id: int, git_url: str) -> httpx.Response:
        """Detect technologies used in a repository."""
        return self._get("/github/detect-technologies", params={
            "user_id": user_id,
            "git_url": git_url
        })

    def analyze(
        self,
        user_id: int,
        project_id: int,
        git_url: str,
        provider: Optional[str] = None,
        cli_mode: Optional[str] = None
    ) -> httpx.Response:
        """
        Analyze a repository for a project.

        Args:
            user_id: User ID (query param)
            project_id: Project ID to link analysis to (body)
            git_url: Repository URL (body)
            provider: LLM provider (optional query param)
            cli_mode: CLI mode (optional query param)
        """
        params = {"user_id": user_id}
        if provider:
            params["provider"] = provider
        if cli_mode:
            params["cli_mode"] = cli_mode

        return self._post("/github/analyze", params=params, json={
            "git_url": git_url,
            "project_id": project_id
        })

    def get_analysis(self, analysis_id: int) -> httpx.Response:
        """Get analysis result by ID."""
        return self._get(f"/github/analysis/{analysis_id}")

    def generate_description(
        self,
        user_id: int,
        project_id: int,
        git_url: str
    ) -> httpx.Response:
        """Generate AI description for a project."""
        return self._post("/github/generate-description", json={
            "user_id": user_id,
            "project_id": project_id,
            "git_url": git_url
        })

    # Extended analysis endpoints (v1.10)

    def get_contributors(self, project_id: int) -> httpx.Response:
        """Get all contributors for a project."""
        return self._get(f"/github/contributors/{project_id}")

    def get_contributor_analysis(
        self,
        project_id: int,
        username: Optional[str] = None
    ) -> httpx.Response:
        """Get detailed contributor analysis."""
        params = {}
        if username:
            params["username"] = username
        return self._get(f"/github/contributor-analysis/{project_id}", params=params)

    def get_code_quality(self, project_id: int) -> httpx.Response:
        """Get code quality metrics for a project."""
        return self._get(f"/github/code-quality/{project_id}")

    def get_detailed_commits(
        self,
        project_id: int,
        limit: int = 50
    ) -> httpx.Response:
        """Get detailed commit history with conventional commit parsing."""
        return self._get(f"/github/detailed-commits/{project_id}", params={"limit": limit})
