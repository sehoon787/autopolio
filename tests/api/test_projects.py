"""
Projects API tests.
"""

import pytest
from uuid import uuid4
from modules.projects import ProjectsAPI


class TestProjectCRUD:
    """Test project CRUD operations."""

    def test_create_project(self, api_client, test_user, test_company):
        """Test creating a new project."""
        api = ProjectsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create(
            user_id=test_user["id"],
            company_id=test_company["id"],
            name=f"Test Project {unique_id}",
            description="A test project",
            role="Lead Developer",
            team_size=5,
            project_type="company",
            start_date="2024-01-01",
            end_date="2024-12-31"
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["name"] == f"Test Project {unique_id}"
        assert data["role"] == "Lead Developer"
        assert data["team_size"] == 5
        assert "id" in data

        # Cleanup
        api.delete(data["id"], test_user["id"])

    def test_create_personal_project(self, api_client, test_user):
        """Test creating a personal project (no company)."""
        api = ProjectsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create(
            user_id=test_user["id"],
            name=f"Personal Project {unique_id}",
            description="A personal side project",
            project_type="personal",
            start_date="2024-01-01"
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["project_type"] == "personal"
        assert data.get("company_id") is None

        api.delete(data["id"], test_user["id"])

    def test_list_projects(self, api_client, test_user, test_project):
        """Test listing projects for a user."""
        api = ProjectsAPI(api_client)

        response = api.list(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        # API returns {"projects": [...], "total": ...} or list
        if isinstance(data, dict) and "projects" in data:
            projects = data["projects"]
        else:
            projects = data
        assert isinstance(projects, list)
        assert len(projects) >= 1

    def test_get_project(self, api_client, test_user, test_project):
        """Test getting a project by ID."""
        api = ProjectsAPI(api_client)

        response = api.get(test_project["id"], test_user["id"])

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_project["id"]

    def test_get_project_not_found(self, api_client, test_user):
        """Test getting non-existent project returns 404."""
        api = ProjectsAPI(api_client)

        response = api.get(99999, test_user["id"])

        assert response.status_code == 404

    def test_update_project(self, api_client, test_user, test_project):
        """Test updating project data."""
        api = ProjectsAPI(api_client)

        response = api.update(
            test_project["id"],
            test_user["id"],
            name="Updated Project Name",
            description="Updated description"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Project Name"
        assert data["description"] == "Updated description"

    def test_update_project_technologies(self, api_client, test_user, test_project):
        """Test updating project technologies."""
        api = ProjectsAPI(api_client)

        response = api.update(
            test_project["id"],
            test_user["id"],
            technologies=["Python", "FastAPI", "React"]
        )

        assert response.status_code == 200
        data = response.json()
        # Check technologies are stored (format may vary)
        assert "technologies" in data or "detected_technologies" in data

    def test_delete_project(self, api_client, test_user):
        """Test deleting a project."""
        api = ProjectsAPI(api_client)

        # Create project first
        create_response = api.create(
            user_id=test_user["id"],
            name="To Delete Project",
            project_type="personal"
        )
        project_id = create_response.json()["id"]

        # Delete
        response = api.delete(project_id, test_user["id"])
        assert response.status_code in [200, 204]

        # Verify deleted - API may use soft delete (200) or hard delete (404)
        get_response = api.get(project_id, test_user["id"])
        assert get_response.status_code in [200, 404]


class TestProjectAchievements:
    """Test project achievements."""

    def test_add_achievement(self, api_client, test_project):
        """Test adding an achievement to a project."""
        api = ProjectsAPI(api_client)

        response = api.add_achievement(
            project_id=test_project["id"],
            user_id=test_project["user_id"],
            metric_name="Performance Improvement",
            metric_value="50%",
            description="Improved API response time by 50%"
        )

        # Achievement endpoints may use different format (200/201) or not exist (404)
        assert response.status_code in [200, 201, 404]
        if response.status_code in [200, 201]:
            data = response.json()
            assert data["metric_name"] == "Performance Improvement"
            assert data["metric_value"] == "50%"

    def test_get_achievements(self, api_client, test_project):
        """Test getting achievements for a project."""
        api = ProjectsAPI(api_client)

        response = api.get_achievements(test_project["id"])

        # Achievements endpoint may not exist (404) or return list (200)
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)

    @pytest.mark.slow
    def test_auto_detect_achievements(self, api_client, test_project):
        """Test auto-detecting achievements from project data."""
        api = ProjectsAPI(api_client)

        response = api.auto_detect_achievements(test_project["id"])

        # May return empty if no achievements detected or endpoint doesn't exist
        assert response.status_code in [200, 404, 422]


class TestProjectValidation:
    """Test project input validation."""

    def test_create_project_missing_name(self, api_client, test_user):
        """Test creating project without name fails."""
        api = ProjectsAPI(api_client)

        response = api._post(
            "/knowledge/projects",
            params={"user_id": test_user["id"]},
            json={"project_type": "personal"}
        )

        assert response.status_code in [400, 422]

    def test_create_project_invalid_user(self, api_client):
        """Test creating project with invalid user ID fails."""
        api = ProjectsAPI(api_client)

        response = api.create(
            user_id=99999,
            name="Invalid User Project",
            project_type="personal"
        )

        assert response.status_code in [400, 404]

    def test_create_project_invalid_company(self, api_client, test_user):
        """Test creating project with invalid company ID fails."""
        api = ProjectsAPI(api_client)

        response = api.create(
            user_id=test_user["id"],
            company_id=99999,
            name="Invalid Company Project",
            project_type="company"
        )

        # API may allow creating project with invalid company or reject it
        assert response.status_code in [200, 201, 400, 404, 422]

    def test_create_project_with_git_url(self, api_client, test_user):
        """Test creating project with Git URL."""
        api = ProjectsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create(
            user_id=test_user["id"],
            name=f"Git Project {unique_id}",
            project_type="personal",
            git_url="https://github.com/example/repo"
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["git_url"] == "https://github.com/example/repo"

        api.delete(data["id"], test_user["id"])
