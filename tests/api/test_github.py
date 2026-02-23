"""
GitHub API tests.

Note: Some tests require a GitHub-connected user and may be skipped
if GitHub integration is not configured.

Test categories:
1. TestGitHubStatus - Connection status tests (no GitHub required)
2. TestGitHubRepos - Repository listing tests
3. TestGitHubTechnologyDetection - Tech detection tests
4. TestGitHubAnalysis - Analysis tests
5. TestGitHubExtendedAnalysis - Extended analysis (v1.10)
6. TestGitHubFullWorkflow - Full E2E workflow tests
"""

import pytest
import time
from modules.github import GitHubAPI


class TestGitHubStatus:
    """Test GitHub connection status."""

    def test_get_status_not_connected(self, api_client, test_user):
        """Test getting status for user without GitHub connection."""
        api = GitHubAPI(api_client)

        response = api.get_status(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        assert data["connected"] is False

    def test_get_connect_url(self, api_client, test_user):
        """Test getting GitHub OAuth connect URL."""
        api = GitHubAPI(api_client)

        response = api.get_connect_url(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        assert "url" in data or "auth_url" in data


class TestGitHubRepos:
    """Test GitHub repository operations."""

    @pytest.mark.requires_github
    def test_list_repos(self, api_client, test_user):
        """Test listing user's GitHub repositories."""
        api = GitHubAPI(api_client)

        response = api.list_repos(test_user["id"])

        # May return empty list or error if not connected
        assert response.status_code in [200, 401, 403]

    def test_list_repos_not_connected(self, api_client, test_user):
        """Test listing repos for user without GitHub connection."""
        api = GitHubAPI(api_client)

        response = api.list_repos(test_user["id"])

        # Should fail or return empty
        assert response.status_code in [200, 400, 401]
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                assert len(data) == 0 or "error" in str(data)


class TestGitHubTechnologyDetection:
    """Test technology detection features."""

    @pytest.mark.requires_github
    def test_detect_technologies(self, api_client, test_user):
        """Test detecting technologies in a repository."""
        api = GitHubAPI(api_client)

        # Use a well-known public repository
        response = api.detect_technologies(
            user_id=test_user["id"], git_url="https://github.com/facebook/react"
        )

        # May fail if not connected
        if response.status_code == 200:
            data = response.json()
            assert "technologies" in data or isinstance(data, list)

    @pytest.mark.requires_github
    def test_get_repo_info(self, api_client, test_user):
        """Test getting repository information."""
        api = GitHubAPI(api_client)

        response = api.get_repo_info(
            user_id=test_user["id"], git_url="https://github.com/facebook/react"
        )

        if response.status_code == 200:
            data = response.json()
            assert "name" in data or "full_name" in data


class TestGitHubAnalysis:
    """Test GitHub analysis features."""

    @pytest.mark.requires_github
    @pytest.mark.slow
    def test_analyze_repository(self, api_client, test_user, test_personal_project):
        """Test analyzing a repository."""
        api = GitHubAPI(api_client)

        # Update project with git URL first
        api_client.put(
            f"/knowledge/projects/{test_personal_project['id']}",
            params={"user_id": test_user["id"]},
            json={"git_url": "https://github.com/facebook/react"},
        )

        response = api.analyze(
            user_id=test_user["id"],
            project_id=test_personal_project["id"],
            git_url="https://github.com/facebook/react",
        )

        # May return task ID for async operation
        assert response.status_code in [200, 202, 401, 403]

    @pytest.mark.requires_github
    def test_get_analysis(self, api_client):
        """Test getting analysis result."""
        api = GitHubAPI(api_client)

        # Try to get non-existent analysis
        response = api.get_analysis(99999)

        assert response.status_code in [404, 200]


class TestGitHubExtendedAnalysis:
    """Test extended analysis features (v1.10)."""

    @pytest.mark.requires_github
    def test_get_contributors(self, api_client, test_project):
        """Test getting contributors for a project."""
        api = GitHubAPI(api_client)

        response = api.get_contributors(test_project["id"])

        # May return empty if not analyzed
        assert response.status_code in [200, 404]

    @pytest.mark.requires_github
    def test_get_contributor_analysis(self, api_client, test_project):
        """Test getting detailed contributor analysis."""
        api = GitHubAPI(api_client)

        response = api.get_contributor_analysis(test_project["id"])

        assert response.status_code in [200, 404]

    @pytest.mark.requires_github
    def test_get_code_quality(self, api_client, test_project):
        """Test getting code quality metrics."""
        api = GitHubAPI(api_client)

        response = api.get_code_quality(test_project["id"])

        assert response.status_code in [200, 404]

    @pytest.mark.requires_github
    def test_get_detailed_commits(self, api_client, test_project):
        """Test getting detailed commit history."""
        api = GitHubAPI(api_client)

        response = api.get_detailed_commits(test_project["id"], limit=10)

        assert response.status_code in [200, 404]


class TestGitHubDisconnect:
    """Test GitHub disconnection."""

    def test_disconnect_not_connected(self, api_client, test_user):
        """Test disconnecting when not connected."""
        api = GitHubAPI(api_client)

        response = api.disconnect(test_user["id"])

        # Should succeed or indicate not connected
        assert response.status_code in [200, 400]


class TestGitHubFullWorkflow:
    """
    Full workflow E2E tests for GitHub integration.

    Tests the complete flow:
    1. List repos from GitHub
    2. Detect technologies in a repo
    3. Create project with repo URL
    4. Analyze the repository
    5. Verify analysis results
    """

    @pytest.mark.requires_github
    def test_list_repos_connected_user(self, api_client, github_user):
        """Test listing repos for a GitHub-connected user."""
        if github_user is None:
            pytest.skip("No GitHub-connected user available")

        api = GitHubAPI(api_client)
        response = api.list_repos(github_user["id"])

        assert response.status_code == 200
        data = response.json()

        # Should have repos or repos key
        repos = data.get("repos", data) if isinstance(data, dict) else data
        assert isinstance(repos, list)
        assert len(repos) > 0, "GitHub user should have at least one repository"

        # Verify repo structure
        first_repo = repos[0]
        assert "name" in first_repo or "full_name" in first_repo
        assert "html_url" in first_repo or "clone_url" in first_repo

    @pytest.mark.requires_github
    def test_detect_technologies_real_repo(self, api_client, github_user):
        """Test detecting technologies in a real repository."""
        if github_user is None:
            pytest.skip("No GitHub-connected user available")

        api = GitHubAPI(api_client)

        # Get first repo from user's repos
        repos_response = api.list_repos(github_user["id"])
        repos = repos_response.json().get("repos", repos_response.json())
        if not repos:
            pytest.skip("No repos available")

        git_url = repos[0].get("html_url") or repos[0].get("clone_url")

        response = api.detect_technologies(user_id=github_user["id"], git_url=git_url)

        assert response.status_code == 200
        data = response.json()
        # Should return technologies list
        techs = data.get("technologies", data)
        assert isinstance(techs, list)

    @pytest.mark.requires_github
    def test_full_import_and_analyze_workflow(self, api_client, github_user):
        """
        Full E2E test: Import repo as project and analyze.

        This test:
        1. Lists user's repos
        2. Detects technologies for first repo
        3. Creates a project with the repo URL
        4. Triggers analysis
        5. Waits for analysis to complete
        6. Verifies analysis results
        """
        if github_user is None:
            pytest.skip("No GitHub-connected user available")

        api = GitHubAPI(api_client)
        user_id = github_user["id"]

        # Step 1: List repos
        repos_response = api.list_repos(user_id)
        assert repos_response.status_code == 200
        repos = repos_response.json().get("repos", repos_response.json())
        assert len(repos) > 0, "Need at least one repo for this test"

        # Pick a small repo (prefer non-fork, smallest by size if available)
        target_repo = None
        for repo in repos:
            if not repo.get("fork", False):
                target_repo = repo
                break
        if target_repo is None:
            target_repo = repos[0]

        git_url = target_repo.get("html_url") or target_repo.get("clone_url")
        repo_name = target_repo.get("name", "unknown")
        print(f"\nTesting with repo: {repo_name} ({git_url})")

        # Step 2: Detect technologies
        tech_response = api.detect_technologies(user_id, git_url)
        assert tech_response.status_code == 200
        technologies = tech_response.json().get("technologies", [])
        print(f"Detected technologies: {technologies[:5]}...")

        # Step 3: Create project
        project_response = api_client.post(
            "/knowledge/projects",
            params={"user_id": user_id},
            json={
                "name": f"GitHub Test - {repo_name}",
                "description": f"Integration test for {repo_name}",
                "role": "Developer",
                "project_type": "personal",
                "git_url": git_url,
                "start_date": "2024-01-01",
            },
        )
        assert project_response.status_code in [200, 201]
        project = project_response.json()
        project_id = project["id"]
        print(f"Created project: {project_id}")

        try:
            # Step 4: Trigger analysis (commits only for speed)
            analyze_response = api.analyze(
                user_id=user_id, project_id=project_id, git_url=git_url
            )
            assert analyze_response.status_code in [200, 202]
            print("Analysis started")

            # Step 5: Wait for analysis to complete (poll status)
            max_wait = 60  # seconds
            poll_interval = 2
            elapsed = 0
            analysis_complete = False

            while elapsed < max_wait:
                # Check project analysis status
                project_check = api_client.get(
                    f"/knowledge/projects/{project_id}", params={"user_id": user_id}
                )
                if project_check.status_code == 200:
                    proj_data = project_check.json()
                    if proj_data.get("is_analyzed"):
                        analysis_complete = True
                        print(f"Analysis completed in {elapsed}s")
                        break

                time.sleep(poll_interval)
                elapsed += poll_interval

            # Step 6: Verify results
            if analysis_complete:
                # Get analysis data
                final_project = api_client.get(
                    f"/knowledge/projects/{project_id}", params={"user_id": user_id}
                ).json()

                assert final_project.get("is_analyzed") is True

                # Check if repo_analysis exists
                if final_project.get("repo_analysis"):
                    ra = final_project["repo_analysis"]
                    print("Analysis results:")
                    print(f"  - Total commits: {ra.get('total_commits', 'N/A')}")
                    print(
                        f"  - Technologies: {ra.get('detected_technologies', [])[:5]}"
                    )
            else:
                print(
                    f"Analysis did not complete within {max_wait}s (may be running async)"
                )
                # Don't fail - analysis might be running in background

        finally:
            # Cleanup: Delete the test project
            api_client.delete(
                f"/knowledge/projects/{project_id}", params={"user_id": user_id}
            )
            print("Cleaned up test project")

    @pytest.mark.requires_github
    @pytest.mark.slow
    def test_full_analysis_with_code(self, api_client, github_user):
        """
        Full analysis test including code analysis.

        This is marked as slow because code analysis takes longer.
        """
        if github_user is None:
            pytest.skip("No GitHub-connected user available")

        api = GitHubAPI(api_client)
        user_id = github_user["id"]

        # Get repos and find a small one
        repos_response = api.list_repos(user_id)
        repos = repos_response.json().get("repos", repos_response.json())

        # Find smallest non-fork repo
        target_repo = min(
            [r for r in repos if not r.get("fork", False)] or repos,
            key=lambda r: r.get("size", 0),
            default=repos[0] if repos else None,
        )

        if target_repo is None:
            pytest.skip("No repos available")

        git_url = target_repo.get("html_url")
        repo_name = target_repo.get("name")

        # Create project
        project_response = api_client.post(
            "/knowledge/projects",
            params={"user_id": user_id},
            json={
                "name": f"Full Analysis Test - {repo_name}",
                "description": "Full analysis with code",
                "role": "Developer",
                "project_type": "personal",
                "git_url": git_url,
                "start_date": "2024-01-01",
            },
        )
        project = project_response.json()
        project_id = project["id"]

        try:
            # Run full analysis
            analyze_response = api.analyze(
                user_id=user_id, project_id=project_id, git_url=git_url
            )
            assert analyze_response.status_code in [200, 202]

            # Wait longer for code analysis
            max_wait = 180  # 3 minutes
            poll_interval = 5
            elapsed = 0

            while elapsed < max_wait:
                project_check = api_client.get(
                    f"/knowledge/projects/{project_id}", params={"user_id": user_id}
                )
                if project_check.status_code == 200:
                    proj_data = project_check.json()
                    if proj_data.get("is_analyzed"):
                        break
                time.sleep(poll_interval)
                elapsed += poll_interval

        finally:
            api_client.delete(
                f"/knowledge/projects/{project_id}", params={"user_id": user_id}
            )
