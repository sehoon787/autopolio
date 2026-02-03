"""
Projects API module for testing.
"""

from typing import Optional, List
import httpx
from .base import BaseAPIModule


class ProjectsAPI(BaseAPIModule):
    """API module for project management endpoints."""

    def list(self, user_id: int) -> httpx.Response:
        """
        List all projects for a user.

        Args:
            user_id: User ID

        Returns:
            Response with list of projects
        """
        return self._get("/knowledge/projects", params={"user_id": user_id})

    def create(
        self,
        user_id: int,
        name: str,
        description: Optional[str] = None,
        role: Optional[str] = None,
        team_size: Optional[int] = None,
        project_type: str = "personal",
        company_id: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        git_url: Optional[str] = None,
        technologies: Optional[List[str]] = None,
        **kwargs
    ) -> httpx.Response:
        """
        Create a new project.

        Args:
            user_id: User ID
            name: Project name
            description: Project description
            role: User's role in project
            team_size: Team size
            project_type: Type of project (personal/company/opensource)
            company_id: Associated company ID
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            git_url: Git repository URL
            technologies: List of technologies used
            **kwargs: Additional fields

        Returns:
            Response with created project data
        """
        data = {
            "name": name,
            "project_type": project_type,
            **kwargs
        }
        if description:
            data["description"] = description
        if role:
            data["role"] = role
        if team_size:
            data["team_size"] = team_size
        if company_id:
            data["company_id"] = company_id
        if start_date:
            data["start_date"] = start_date
        if end_date:
            data["end_date"] = end_date
        if git_url:
            data["git_url"] = git_url
        if technologies:
            data["technologies"] = technologies

        return self._post("/knowledge/projects", json=data, params={"user_id": user_id})

    def get(self, project_id: int, user_id: Optional[int] = None) -> httpx.Response:
        """
        Get project by ID.

        Args:
            project_id: Project ID
            user_id: User ID (required by API)

        Returns:
            Response with project data
        """
        params = {}
        if user_id:
            params["user_id"] = user_id
        return self._get(f"/knowledge/projects/{project_id}", params=params if params else None)

    def update(self, project_id: int, user_id: int, **kwargs) -> httpx.Response:
        """
        Update project data.

        Args:
            project_id: Project ID
            user_id: User ID
            **kwargs: Fields to update

        Returns:
            Response with updated project data
        """
        return self._put(f"/knowledge/projects/{project_id}", json=kwargs, params={"user_id": user_id})

    def delete(self, project_id: int, user_id: int) -> httpx.Response:
        """
        Delete a project.

        Args:
            project_id: Project ID
            user_id: User ID

        Returns:
            Response confirming deletion
        """
        return self._delete(f"/knowledge/projects/{project_id}", params={"user_id": user_id})

    def get_achievements(self, project_id: int) -> httpx.Response:
        """
        Get achievements for a project.

        Args:
            project_id: Project ID

        Returns:
            Response with list of achievements
        """
        return self._get(f"/knowledge/projects/{project_id}/achievements")

    def add_achievement(
        self,
        project_id: int,
        metric_name: str,
        metric_value: str,
        description: Optional[str] = None
    ) -> httpx.Response:
        """
        Add an achievement to a project.

        Args:
            project_id: Project ID
            metric_name: Name of the metric
            metric_value: Value of the metric
            description: Achievement description

        Returns:
            Response with created achievement
        """
        data = {
            "metric_name": metric_name,
            "metric_value": metric_value,
        }
        if description:
            data["description"] = description

        return self._post(f"/knowledge/projects/{project_id}/achievements", json=data)

    def auto_detect_achievements(self, project_id: int) -> httpx.Response:
        """
        Auto-detect achievements from project data.

        Args:
            project_id: Project ID

        Returns:
            Response with detected achievements
        """
        return self._post("/knowledge/achievements/auto-detect", json={"project_id": project_id})
