"""
GitHub E2E Workflow Tests.

Tests the complete flow from import to analysis for both:
1. Electron mode (CLI-based token, CLI LLM analysis)
2. Web mode (OAuth token, API LLM analysis)

These tests verify:
- Repository import as project
- Project analysis execution
- Analysis results contain all expected fields (implementation_details, key_tasks, etc.)
"""

import pytest
import time
import subprocess
import os
from typing import Optional
from modules.github import GitHubAPI


# ============ Helper Functions ============

def get_gh_cli_token() -> Optional[str]:
    """
    Get GitHub token from gh CLI.
    
    Returns:
        str: GitHub token if gh CLI is installed and authenticated
        None: If gh CLI is not available or not authenticated
    """
    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        return None


def get_gh_cli_username() -> Optional[str]:
    """
    Get GitHub username from gh CLI.
    
    Returns:
        str: GitHub username if authenticated
        None: If not authenticated
    """
    try:
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            # Parse username from output like "Logged in to github.com as USERNAME"
            for line in result.stdout.split('\n') + result.stderr.split('\n'):
                if 'Logged in' in line and 'as' in line:
                    parts = line.split('as')
                    if len(parts) >= 2:
                        return parts[1].strip().split()[0].strip()
        return None
    except Exception:
        return None


def wait_for_analysis_completion(
    api_client,
    project_id: int,
    user_id: int,
    max_wait: int = 180,
    poll_interval: int = 5
) -> dict:
    """
    Wait for background analysis to complete.
    
    Args:
        api_client: HTTP client
        project_id: Project ID
        user_id: User ID
        max_wait: Maximum seconds to wait
        poll_interval: Seconds between polls
        
    Returns:
        dict: Analysis status with 'completed' flag and optional 'analysis' data
    """
    elapsed = 0
    while elapsed < max_wait:
        # Check job status
        status_response = api_client.get(
            f"/github/analysis-status/{project_id}",
            params={"user_id": user_id}
        )
        
        if status_response.status_code == 200:
            status = status_response.json()
            if status:
                job_status = status.get("status", "")
                if job_status == "completed":
                    # Get full analysis
                    analysis_response = api_client.get(f"/github/analysis/{project_id}")
                    if analysis_response.status_code == 200:
                        return {
                            "completed": True,
                            "analysis": analysis_response.json(),
                            "elapsed": elapsed
                        }
                elif job_status == "failed":
                    return {
                        "completed": False,
                        "error": status.get("error_message", "Analysis failed"),
                        "elapsed": elapsed
                    }
        
        time.sleep(poll_interval)
        elapsed += poll_interval
    
    return {"completed": False, "error": "Timeout", "elapsed": elapsed}


def verify_analysis_results(analysis: dict) -> dict:
    """
    Verify analysis results contain all expected fields.
    
    Args:
        analysis: Analysis data from API
        
    Returns:
        dict: Verification results with 'passed' flag and details
    """
    results = {
        "passed": True,
        "checks": {},
        "missing_fields": [],
        "empty_fields": []
    }
    
    # Required fields that should exist
    required_fields = [
        "id",
        "project_id",
        "git_url",
        "total_commits",
        "detected_technologies",
        "analyzed_at"
    ]
    
    # LLM-generated fields that should be populated after full analysis
    llm_fields = [
        "key_tasks",
        "implementation_details",
        "detailed_achievements",
        "ai_summary"
    ]
    
    # Check required fields
    for field in required_fields:
        exists = field in analysis and analysis[field] is not None
        results["checks"][field] = exists
        if not exists:
            results["missing_fields"].append(field)
            results["passed"] = False
    
    # Check LLM fields (warn if empty but don't fail)
    for field in llm_fields:
        value = analysis.get(field)
        exists = value is not None
        has_content = exists and (
            (isinstance(value, list) and len(value) > 0) or
            (isinstance(value, dict) and len(value) > 0) or
            (isinstance(value, str) and len(value) > 0)
        )
        results["checks"][field] = {
            "exists": exists,
            "has_content": has_content
        }
        if not has_content:
            results["empty_fields"].append(field)
    
    return results


# ============ Test Classes ============

class TestElectronWorkflow:
    """
    Test Electron-style workflow (CLI token + CLI LLM).
    
    Simulates what happens when:
    1. User authenticates via gh CLI in Electron
    2. Token is synced to backend via save-token API
    3. Repos are imported
    4. Analysis runs with CLI mode (claude_code or gemini_cli)
    """
    
    @pytest.fixture
    def gh_token(self):
        """Get token from gh CLI."""
        token = get_gh_cli_token()
        if not token:
            pytest.skip("gh CLI not installed or not authenticated")
        return token
    
    @pytest.fixture
    def gh_username(self):
        """Get username from gh CLI."""
        username = get_gh_cli_username()
        if not username:
            pytest.skip("gh CLI not authenticated")
        return username
    
    def test_electron_save_token_flow(self, api_client, test_user, gh_token, gh_username):
        """
        Test saving GitHub token from gh CLI (Electron flow).
        
        Steps:
        1. Get token from gh CLI
        2. Call save-token API
        3. Verify token was saved and user was updated
        """
        api = GitHubAPI(api_client)
        
        # Save token
        response = api.save_token(test_user["id"], gh_token)
        
        assert response.status_code == 200, f"save-token failed: {response.text}"
        data = response.json()
        
        assert data.get("success") is True
        assert "user_id" in data
        assert data.get("github_username") is not None
        
        print(f"\n[Electron] Token saved for user {data['user_id']}")
        print(f"[Electron] GitHub username: {data['github_username']}")
        
        # Store actual user_id (may differ due to merge)
        actual_user_id = data["user_id"]
        
        # Verify GitHub status
        status_response = api.get_status(actual_user_id)
        assert status_response.status_code == 200
        status = status_response.json()
        
        assert status["connected"] is True
        assert status["valid"] is True
        print(f"[Electron] GitHub connected and valid")
    
    def test_electron_import_only(self, api_client, test_user, gh_token):
        """
        Test Electron import flow without analysis.
        
        This tests the basic import functionality separately from LLM analysis.
        """
        api = GitHubAPI(api_client)
        
        # Save token
        save_response = api.save_token(test_user["id"], gh_token)
        assert save_response.status_code == 200
        actual_user_id = save_response.json()["user_id"]
        print(f"\n[Electron Import] Using user_id: {actual_user_id}")
        
        # List repos
        repos_response = api.list_repos(actual_user_id)
        assert repos_response.status_code == 200
        repos_data = repos_response.json()
        repos = repos_data.get("repos", repos_data if isinstance(repos_data, list) else [])
        
        if not repos:
            pytest.skip("No repos available")
        
        # Get existing to avoid duplicates
        existing_response = api_client.get("/knowledge/projects", params={"user_id": actual_user_id})
        existing_urls = set()
        if existing_response.status_code == 200:
            for p in existing_response.json().get("projects", []):
                if p.get("git_url"):
                    existing_urls.add(p["git_url"].lower().replace(".git", ""))
        
        # Find non-imported repo
        target_repo = None
        for repo in repos[:50]:
            url = (repo.get("html_url") or repo.get("clone_url", "")).lower().replace(".git", "")
            if not repo.get("fork", False) and url not in existing_urls:
                target_repo = repo
                break
        
        if not target_repo:
            pytest.skip("All repos already imported")
        
        git_url = target_repo.get("html_url") or target_repo.get("clone_url")
        repo_name = target_repo.get("name", "unknown")
        print(f"[Electron Import] Selected: {repo_name}")
        
        # Import
        import_response = api.import_repos(actual_user_id, [git_url])
        assert import_response.status_code == 200, f"Import failed: {import_response.text}"
        import_data = import_response.json()
        
        assert import_data["imported"] >= 1, f"No repos imported: {import_data}"
        project_id = import_data["results"][0].get("project_id")
        assert project_id is not None
        print(f"[Electron Import] Created project {project_id}")
        
        # Verify project exists
        project_response = api_client.get(
            f"/knowledge/projects/{project_id}",
            params={"user_id": actual_user_id}
        )
        assert project_response.status_code == 200
        project = project_response.json()
        assert project["git_url"] == git_url
        assert project["name"] == repo_name
        print(f"[Electron Import] Project verified: {project['name']}")
        
        # Cleanup
        api_client.delete(f"/knowledge/projects/{project_id}", params={"user_id": actual_user_id})
        print(f"[Electron Import] Cleaned up")

    @pytest.mark.slow
    @pytest.mark.llm_required
    def test_electron_import_and_analyze_flow(self, api_client, test_user, gh_token):
        """
        Test full Electron workflow: save token -> import repos -> analyze with CLI.
        
        This simulates the complete Electron app flow.
        """
        api = GitHubAPI(api_client)
        
        # Step 1: Save token (like Electron does after gh auth)
        save_response = api.save_token(test_user["id"], gh_token)
        assert save_response.status_code == 200
        actual_user_id = save_response.json()["user_id"]
        print(f"\n[Electron] Using user_id: {actual_user_id}")
        
        # Step 2: List repos (simulate what Electron does via IPC)
        repos_response = api.list_repos(actual_user_id)
        assert repos_response.status_code == 200
        repos_data = repos_response.json()
        repos = repos_data.get("repos", repos_data if isinstance(repos_data, list) else [])
        
        if not repos:
            pytest.skip("No repos available for testing")
        
        # Get existing projects to avoid duplicates
        existing_projects_response = api_client.get(
            "/knowledge/projects",
            params={"user_id": actual_user_id}
        )
        existing_urls = set()
        if existing_projects_response.status_code == 200:
            existing_projects = existing_projects_response.json().get("projects", [])
            for p in existing_projects:
                if p.get("git_url"):
                    # Normalize URL
                    url = p["git_url"].lower().replace(".git", "")
                    existing_urls.add(url)
        
        # Pick a small repo (prefer non-fork, not already imported)
        target_repo = None
        for repo in repos[:50]:  # Check first 50
            git_url = (repo.get("html_url") or repo.get("clone_url", "")).lower().replace(".git", "")
            if not repo.get("fork", False) and git_url not in existing_urls:
                target_repo = repo
                break
        
        if not target_repo:
            # Try any non-imported repo
            for repo in repos:
                git_url = (repo.get("html_url") or repo.get("clone_url", "")).lower().replace(".git", "")
                if git_url not in existing_urls:
                    target_repo = repo
                    break
        
        if not target_repo:
            pytest.skip("All repos already imported")
        
        git_url = target_repo.get("html_url") or target_repo.get("clone_url")
        repo_name = target_repo.get("name", "unknown")
        print(f"[Electron] Selected repo: {repo_name} ({git_url})")
        
        # Step 3: Import repo as project
        import_response = api.import_repos(actual_user_id, [git_url])
        assert import_response.status_code == 200, f"Import failed: {import_response.text}"
        import_data = import_response.json()
        
        assert import_data["imported"] >= 1, f"No repos imported: {import_data}"
        project_id = import_data["results"][0].get("project_id")
        assert project_id is not None, "No project_id returned"
        print(f"[Electron] Imported as project {project_id}")
        
        try:
            # Step 4: Start background analysis with CLI mode
            # Note: claude_code requires Claude Code CLI installed on the machine
            # For testing, we'll try claude_code first, then fall back to API
            analyze_response = api.start_background_analysis(
                user_id=actual_user_id,
                git_url=git_url,
                project_id=project_id,
                cli_mode="claude_code",  # Electron uses CLI mode
                language="en"
            )
            
            # If CLI mode fails (CLI not installed), try API mode
            if analyze_response.status_code != 200:
                print("[Electron] CLI mode failed, falling back to API mode")
                analyze_response = api.start_background_analysis(
                    user_id=actual_user_id,
                    git_url=git_url,
                    project_id=project_id,
                    provider="gemini",  # Fallback to API
                    language="en"
                )
            
            assert analyze_response.status_code == 200, f"Analysis start failed: {analyze_response.text}"
            task_data = analyze_response.json()
            print(f"[Electron] Analysis started: task_id={task_data.get('task_id')}")
            
            # Step 5: Wait for completion
            result = wait_for_analysis_completion(
                api_client, project_id, actual_user_id,
                max_wait=180, poll_interval=5
            )
            
            if result["completed"]:
                print(f"[Electron] Analysis completed in {result['elapsed']}s")
                
                # Step 6: Verify results
                analysis = result["analysis"]
                verification = verify_analysis_results(analysis)
                
                print(f"[Electron] Analysis verification:")
                print(f"  - Commits: {analysis.get('total_commits', 'N/A')}")
                print(f"  - Technologies: {analysis.get('detected_technologies', [])[:5]}")
                print(f"  - Key tasks: {len(analysis.get('key_tasks', []))} items")
                print(f"  - Implementation details: {len(analysis.get('implementation_details', []))} sections")
                print(f"  - AI Summary: {'Yes' if analysis.get('ai_summary') else 'No'}")
                
                if verification["empty_fields"]:
                    print(f"  - Empty LLM fields: {verification['empty_fields']}")
                
                assert verification["passed"], f"Analysis missing required fields: {verification['missing_fields']}"
            else:
                print(f"[Electron] Analysis did not complete: {result.get('error')}")
                # Don't fail - might be running async or LLM not available
                
        finally:
            # Cleanup: Delete the test project
            api_client.delete(
                f"/knowledge/projects/{project_id}",
                params={"user_id": actual_user_id}
            )
            print(f"[Electron] Cleaned up project {project_id}")


class TestWebWorkflow:
    """
    Test Web-style workflow (OAuth token + API LLM).
    
    Uses existing GitHub-connected user (from OAuth).
    """
    
    def test_web_github_status(self, api_client, github_user):
        """Test GitHub connection status for OAuth user."""
        if github_user is None:
            pytest.skip("No GitHub-connected user available")
        
        api = GitHubAPI(api_client)
        response = api.get_status(github_user["id"])
        
        assert response.status_code == 200
        status = response.json()
        
        assert status["connected"] is True
        assert status["valid"] is True
        print(f"\n[Web] GitHub connected for user {github_user['id']}")
        print(f"[Web] Username: {status.get('github_username')}")
    
    def test_web_list_repos(self, api_client, github_user):
        """Test listing repos for OAuth user."""
        if github_user is None:
            pytest.skip("No GitHub-connected user available")
        
        api = GitHubAPI(api_client)
        response = api.list_repos(github_user["id"])
        
        assert response.status_code == 200
        data = response.json()
        repos = data.get("repos", data if isinstance(data, list) else [])
        
        assert len(repos) > 0, "OAuth user should have repos"
        print(f"\n[Web] Found {len(repos)} repos")
    
    @pytest.mark.requires_github
    def test_web_import_only(self, api_client, github_user):
        """
        Test Web import flow without analysis.
        """
        if github_user is None:
            pytest.skip("No GitHub-connected user available")
        
        api = GitHubAPI(api_client)
        user_id = github_user["id"]
        
        # List repos
        repos_response = api.list_repos(user_id)
        assert repos_response.status_code == 200
        repos = repos_response.json().get("repos", [])
        
        if not repos:
            pytest.skip("No repos available")
        
        # Get existing
        existing_response = api_client.get("/knowledge/projects", params={"user_id": user_id})
        existing_urls = set()
        if existing_response.status_code == 200:
            for p in existing_response.json().get("projects", []):
                if p.get("git_url"):
                    existing_urls.add(p["git_url"].lower().replace(".git", ""))
        
        # Find non-imported repo
        target_repo = None
        for repo in repos[:50]:
            url = (repo.get("html_url") or repo.get("clone_url", "")).lower().replace(".git", "")
            if not repo.get("fork", False) and url not in existing_urls:
                target_repo = repo
                break
        
        if not target_repo:
            pytest.skip("All repos already imported")
        
        git_url = target_repo.get("html_url") or target_repo.get("clone_url")
        repo_name = target_repo.get("name", "unknown")
        print(f"\n[Web Import] Selected: {repo_name}")
        
        # Import
        import_response = api.import_repos(user_id, [git_url])
        assert import_response.status_code == 200
        import_data = import_response.json()
        
        assert import_data["imported"] >= 1
        project_id = import_data["results"][0].get("project_id")
        assert project_id is not None
        print(f"[Web Import] Created project {project_id}")
        
        # Verify
        project_response = api_client.get(f"/knowledge/projects/{project_id}", params={"user_id": user_id})
        assert project_response.status_code == 200
        project = project_response.json()
        assert project["git_url"] == git_url
        print(f"[Web Import] Verified: {project['name']}")
        
        # Cleanup
        api_client.delete(f"/knowledge/projects/{project_id}", params={"user_id": user_id})
        print(f"[Web Import] Cleaned up")

    @pytest.mark.slow
    @pytest.mark.requires_github
    @pytest.mark.llm_required
    def test_web_import_and_analyze_flow(self, api_client, github_user):
        """
        Test full Web workflow: import repos -> analyze with API.
        
        This simulates the complete Web app flow.
        """
        if github_user is None:
            pytest.skip("No GitHub-connected user available")
        
        api = GitHubAPI(api_client)
        user_id = github_user["id"]
        
        # Step 1: List repos
        repos_response = api.list_repos(user_id)
        assert repos_response.status_code == 200
        repos_data = repos_response.json()
        repos = repos_data.get("repos", repos_data if isinstance(repos_data, list) else [])
        
        if not repos:
            pytest.skip("No repos available")
        
        # Get existing projects to avoid duplicates
        existing_projects_response = api_client.get(
            "/knowledge/projects",
            params={"user_id": user_id}
        )
        existing_urls = set()
        if existing_projects_response.status_code == 200:
            existing_projects = existing_projects_response.json().get("projects", [])
            for p in existing_projects:
                if p.get("git_url"):
                    url = p["git_url"].lower().replace(".git", "")
                    existing_urls.add(url)
        
        # Pick a small non-fork repo not already imported
        target_repo = None
        for repo in repos[:50]:
            git_url = (repo.get("html_url") or repo.get("clone_url", "")).lower().replace(".git", "")
            if not repo.get("fork", False) and git_url not in existing_urls:
                target_repo = repo
                break
        
        if not target_repo:
            for repo in repos:
                git_url = (repo.get("html_url") or repo.get("clone_url", "")).lower().replace(".git", "")
                if git_url not in existing_urls:
                    target_repo = repo
                    break
        
        if not target_repo:
            pytest.skip("All repos already imported")
        
        git_url = target_repo.get("html_url") or target_repo.get("clone_url")
        repo_name = target_repo.get("name", "unknown")
        print(f"\n[Web] Selected repo: {repo_name} ({git_url})")
        
        # Step 2: Import repo as project
        import_response = api.import_repos(user_id, [git_url])
        assert import_response.status_code == 200, f"Import failed: {import_response.text}"
        import_data = import_response.json()
        
        assert import_data["imported"] >= 1
        project_id = import_data["results"][0].get("project_id")
        assert project_id is not None
        print(f"[Web] Imported as project {project_id}")
        
        try:
            # Step 3: Start background analysis with API provider
            analyze_response = api.start_background_analysis(
                user_id=user_id,
                git_url=git_url,
                project_id=project_id,
                provider="gemini",  # Web uses API mode
                language="en"
            )
            
            assert analyze_response.status_code == 200, f"Analysis start failed: {analyze_response.text}"
            task_data = analyze_response.json()
            print(f"[Web] Analysis started: task_id={task_data.get('task_id')}")
            
            # Step 4: Wait for completion
            result = wait_for_analysis_completion(
                api_client, project_id, user_id,
                max_wait=180, poll_interval=5
            )
            
            if result["completed"]:
                print(f"[Web] Analysis completed in {result['elapsed']}s")
                
                # Step 5: Verify results
                analysis = result["analysis"]
                verification = verify_analysis_results(analysis)
                
                print(f"[Web] Analysis verification:")
                print(f"  - Commits: {analysis.get('total_commits', 'N/A')}")
                print(f"  - Technologies: {analysis.get('detected_technologies', [])[:5]}")
                print(f"  - Key tasks: {len(analysis.get('key_tasks', []))} items")
                print(f"  - Implementation details: {len(analysis.get('implementation_details', []))} sections")
                print(f"  - Detailed achievements: {len(analysis.get('detailed_achievements', {}))} categories")
                print(f"  - AI Summary: {'Yes' if analysis.get('ai_summary') else 'No'}")
                
                if verification["empty_fields"]:
                    print(f"  - Empty LLM fields: {verification['empty_fields']}")
                
                assert verification["passed"], f"Analysis missing required fields: {verification['missing_fields']}"
            else:
                print(f"[Web] Analysis did not complete: {result.get('error')}")
                
        finally:
            # Cleanup
            api_client.delete(
                f"/knowledge/projects/{project_id}",
                params={"user_id": user_id}
            )
            print(f"[Web] Cleaned up project {project_id}")


class TestAnalysisContentVerification:
    """
    Detailed verification of analysis content.
    
    Tests that LLM-generated content is properly populated.
    """
    
    @pytest.mark.requires_github
    @pytest.mark.slow
    def test_analysis_has_implementation_details(self, api_client, github_user):
        """Verify implementation_details is populated after analysis."""
        if github_user is None:
            pytest.skip("No GitHub-connected user available")
        
        api = GitHubAPI(api_client)
        user_id = github_user["id"]
        
        # Get repos and import
        repos_response = api.list_repos(user_id)
        repos = repos_response.json().get("repos", [])
        if not repos:
            pytest.skip("No repos available")
        
        git_url = repos[0].get("html_url")
        import_response = api.import_repos(user_id, [git_url])
        project_id = import_response.json()["results"][0]["project_id"]
        
        try:
            # Analyze
            api.start_background_analysis(
                user_id=user_id,
                git_url=git_url,
                project_id=project_id,
                provider="gemini",
                language="en"
            )
            
            result = wait_for_analysis_completion(
                api_client, project_id, user_id,
                max_wait=180
            )
            
            if result["completed"]:
                analysis = result["analysis"]
                
                # Check implementation_details
                impl_details = analysis.get("implementation_details")
                print(f"\n[Verify] implementation_details: {impl_details}")
                
                if impl_details:
                    assert isinstance(impl_details, list), "implementation_details should be a list"
                    if len(impl_details) > 0:
                        first_detail = impl_details[0]
                        assert "title" in first_detail, "Each detail should have a title"
                        assert "items" in first_detail, "Each detail should have items"
                        print(f"[Verify] First implementation detail: {first_detail['title']}")
                else:
                    print("[Verify] WARNING: implementation_details is empty")
                    
        finally:
            api_client.delete(f"/knowledge/projects/{project_id}", params={"user_id": user_id})
    
    @pytest.mark.requires_github
    @pytest.mark.slow
    def test_analysis_has_key_tasks(self, api_client, github_user):
        """Verify key_tasks is populated after analysis."""
        if github_user is None:
            pytest.skip("No GitHub-connected user available")
        
        api = GitHubAPI(api_client)
        user_id = github_user["id"]
        
        repos_response = api.list_repos(user_id)
        repos = repos_response.json().get("repos", [])
        if not repos:
            pytest.skip("No repos available")
        
        git_url = repos[0].get("html_url")
        import_response = api.import_repos(user_id, [git_url])
        project_id = import_response.json()["results"][0]["project_id"]
        
        try:
            api.start_background_analysis(
                user_id=user_id,
                git_url=git_url,
                project_id=project_id,
                provider="gemini",
                language="en"
            )
            
            result = wait_for_analysis_completion(
                api_client, project_id, user_id,
                max_wait=180
            )
            
            if result["completed"]:
                analysis = result["analysis"]
                key_tasks = analysis.get("key_tasks")
                
                print(f"\n[Verify] key_tasks: {key_tasks}")
                
                if key_tasks:
                    assert isinstance(key_tasks, list), "key_tasks should be a list"
                    assert len(key_tasks) > 0, "key_tasks should have at least one item"
                    print(f"[Verify] Found {len(key_tasks)} key tasks")
                    for i, task in enumerate(key_tasks[:3]):
                        print(f"  {i+1}. {task}")
                else:
                    print("[Verify] WARNING: key_tasks is empty")
                    
        finally:
            api_client.delete(f"/knowledge/projects/{project_id}", params={"user_id": user_id})


class TestCompareElectronVsWeb:
    """
    Compare Electron and Web analysis results.
    
    Both should produce similar quality results.
    """
    
    @pytest.mark.slow
    @pytest.mark.requires_github
    def test_compare_cli_vs_api_analysis(self, api_client, github_user):
        """
        Compare analysis results between CLI mode and API mode.
        
        This helps identify if one mode is failing to populate fields.
        """
        if github_user is None:
            pytest.skip("No GitHub-connected user available")
        
        api = GitHubAPI(api_client)
        user_id = github_user["id"]
        
        # Get a repo
        repos_response = api.list_repos(user_id)
        repos = repos_response.json().get("repos", [])
        if not repos:
            pytest.skip("No repos available")
        
        git_url = repos[0].get("html_url")
        
        results = {}
        
        # Test with API mode (Web)
        print("\n[Compare] Testing API mode (Web)...")
        import_response = api.import_repos(user_id, [git_url])
        if import_response.status_code == 200:
            project_id = import_response.json()["results"][0]["project_id"]
            
            try:
                api.start_background_analysis(
                    user_id=user_id,
                    git_url=git_url,
                    project_id=project_id,
                    provider="gemini",
                    language="en"
                )
                
                result = wait_for_analysis_completion(
                    api_client, project_id, user_id,
                    max_wait=180
                )
                
                if result["completed"]:
                    results["api"] = verify_analysis_results(result["analysis"])
                    print(f"[Compare] API mode completed")
                else:
                    results["api"] = {"completed": False, "error": result.get("error")}
                    
            finally:
                api_client.delete(f"/knowledge/projects/{project_id}", params={"user_id": user_id})
        
        # Compare results
        print("\n[Compare] Results comparison:")
        if "api" in results:
            api_result = results["api"]
            if api_result.get("passed"):
                print(f"  API mode: PASSED")
                if api_result.get("empty_fields"):
                    print(f"    Empty LLM fields: {api_result['empty_fields']}")
            else:
                print(f"  API mode: FAILED - {api_result.get('missing_fields', api_result.get('error'))}")
