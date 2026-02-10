"""
Pytest fixtures for API testing.

Provides reusable fixtures for:
- HTTP client with base URL configured
- Test user creation and cleanup
- Test company creation and cleanup
- Test project creation and cleanup
"""

import os
import pytest
import httpx
from typing import Generator, Optional
from uuid import uuid4

# Base URL for API requests - configurable via environment variable
from tests.utils.runtime_config import get_api_base_url

BASE_URL = os.getenv("API_BASE_URL", f"{get_api_base_url()}/api")

# GitHub-connected user ID for integration tests
# Set via environment variable or use default (user_id=25 has GitHub connected)
GITHUB_USER_ID = int(os.getenv("GITHUB_TEST_USER_ID", "25"))


@pytest.fixture(scope="session")
def base_url() -> str:
    """Return the base URL for API requests."""
    return BASE_URL


@pytest.fixture
def api_client(base_url: str) -> Generator[httpx.Client, None, None]:
    """
    Create an HTTP client for API testing.

    Yields:
        httpx.Client configured with base URL and timeout
    """
    with httpx.Client(base_url=base_url, timeout=30.0) as client:
        yield client


@pytest.fixture
def test_user(api_client: httpx.Client) -> Generator[dict, None, None]:
    """
    Create a test user and clean up after test.

    Yields:
        dict: Created user data including id, name, email
    """
    unique_id = uuid4().hex[:8]
    response = api_client.post("/users", json={
        "name": f"E2E Test User {unique_id}",
        "email": f"test_{unique_id}@example.com"
    })
    response.raise_for_status()
    user = response.json()

    yield user

    # Cleanup: delete the test user
    try:
        api_client.delete(f"/users/{user['id']}")
    except httpx.HTTPError:
        pass  # Ignore cleanup errors


@pytest.fixture
def test_company(api_client: httpx.Client, test_user: dict) -> Generator[dict, None, None]:
    """
    Create a test company for the test user.

    Args:
        api_client: HTTP client fixture
        test_user: Test user fixture

    Yields:
        dict: Created company data
    """
    unique_id = uuid4().hex[:8]
    response = api_client.post(
        "/knowledge/companies",
        params={"user_id": test_user["id"]},
        json={
            "name": f"Test Company {unique_id}",
            "position": "Software Engineer",
            "department": "Engineering",
            "start_date": "2024-01-01"
        }
    )
    response.raise_for_status()
    company = response.json()

    yield company

    # Cleanup: delete the test company
    try:
        api_client.delete(f"/knowledge/companies/{company['id']}", params={"user_id": test_user["id"]})
    except httpx.HTTPError:
        pass


@pytest.fixture
def test_project(
    api_client: httpx.Client,
    test_user: dict,
    test_company: dict
) -> Generator[dict, None, None]:
    """
    Create a test project linked to test user and company.

    Args:
        api_client: HTTP client fixture
        test_user: Test user fixture
        test_company: Test company fixture

    Yields:
        dict: Created project data
    """
    unique_id = uuid4().hex[:8]
    response = api_client.post(
        "/knowledge/projects",
        params={"user_id": test_user["id"]},
        json={
            "company_id": test_company["id"],
            "name": f"Test Project {unique_id}",
            "description": "A test project for E2E testing",
            "role": "Lead Developer",
            "team_size": 5,
            "project_type": "company",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31"
        }
    )
    response.raise_for_status()
    project = response.json()

    yield project

    # Cleanup: delete the test project
    try:
        api_client.delete(f"/knowledge/projects/{project['id']}", params={"user_id": test_user["id"]})
    except httpx.HTTPError:
        pass


@pytest.fixture
def test_personal_project(
    api_client: httpx.Client,
    test_user: dict
) -> Generator[dict, None, None]:
    """
    Create a personal test project (no company).

    Args:
        api_client: HTTP client fixture
        test_user: Test user fixture

    Yields:
        dict: Created project data
    """
    unique_id = uuid4().hex[:8]
    response = api_client.post(
        "/knowledge/projects",
        params={"user_id": test_user["id"]},
        json={
            "name": f"Personal Project {unique_id}",
            "description": "A personal test project",
            "role": "Solo Developer",
            "team_size": 1,
            "project_type": "personal",
            "start_date": "2024-01-01"
        }
    )
    response.raise_for_status()
    project = response.json()

    yield project

    try:
        api_client.delete(f"/knowledge/projects/{project['id']}", params={"user_id": test_user["id"]})
    except httpx.HTTPError:
        pass


@pytest.fixture
def test_template(api_client: httpx.Client, test_user: dict) -> Generator[dict, None, None]:
    """
    Create a test template.

    Args:
        api_client: HTTP client fixture
        test_user: Test user fixture

    Yields:
        dict: Created template data
    """
    unique_id = uuid4().hex[:8]
    response = api_client.post(
        "/templates",
        params={"user_id": test_user["id"]},
        json={
            "name": f"Test Template {unique_id}",
            "platform": "custom",
            "template_content": "# {{name}}\n\n{{description}}",
            "is_default": False
        }
    )
    response.raise_for_status()
    template = response.json()

    yield template

    try:
        api_client.delete(f"/templates/{template['id']}", params={"user_id": test_user["id"]})
    except httpx.HTTPError:
        pass


@pytest.fixture
def github_user(api_client: httpx.Client) -> Optional[dict]:
    """
    Get an existing GitHub-connected user for integration tests.

    This fixture does NOT create a new user - it uses an existing
    GitHub-connected user (configured via GITHUB_TEST_USER_ID env var).

    Returns:
        dict: User data if GitHub-connected user exists and is valid
        None: If no GitHub-connected user is available
    """
    # Check if the user exists and has GitHub connected
    try:
        status_response = api_client.get("/github/status", params={"user_id": GITHUB_USER_ID})
        if status_response.status_code != 200:
            return None

        status = status_response.json()
        if not status.get("connected") or not status.get("valid"):
            return None

        # Get user data
        user_response = api_client.get(f"/users/{GITHUB_USER_ID}")
        if user_response.status_code != 200:
            return None

        user = user_response.json()
        user["github_status"] = status
        return user
    except httpx.HTTPError:
        return None


@pytest.fixture
def github_project(
    api_client: httpx.Client,
    github_user: Optional[dict]
) -> Generator[Optional[dict], None, None]:
    """
    Create a test project for GitHub analysis tests.

    This project is linked to the GitHub-connected user and can be used
    for import/analysis tests.

    Args:
        api_client: HTTP client fixture
        github_user: GitHub-connected user fixture

    Yields:
        dict: Created project data, or None if no GitHub user
    """
    if github_user is None:
        yield None
        return

    unique_id = uuid4().hex[:8]
    response = api_client.post(
        "/knowledge/projects",
        params={"user_id": github_user["id"]},
        json={
            "name": f"GitHub Test Project {unique_id}",
            "description": "Project for GitHub integration testing",
            "role": "Developer",
            "team_size": 1,
            "project_type": "personal",
            "start_date": "2024-01-01"
        }
    )

    if response.status_code not in [200, 201]:
        yield None
        return

    project = response.json()
    yield project

    # Cleanup
    try:
        api_client.delete(
            f"/knowledge/projects/{project['id']}",
            params={"user_id": github_user["id"]}
        )
    except httpx.HTTPError:
        pass


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "requires_github: mark test as requiring GitHub connection"
    )
    config.addinivalue_line(
        "markers", "llm_required: mark test as requiring LLM service (API or CLI)"
    )


def pytest_collection_modifyitems(config, items):
    """Skip tests marked with requires_github if no GitHub user is available."""
    # This runs before fixtures, so we do a quick check here
    try:
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get("/github/status", params={"user_id": GITHUB_USER_ID})
            if response.status_code == 200:
                status = response.json()
                if status.get("connected") and status.get("valid"):
                    return  # GitHub is available, don't skip tests
    except Exception:
        pass

    # Skip tests that require GitHub
    skip_github = pytest.mark.skip(reason="GitHub connection not available")
    for item in items:
        if "requires_github" in item.keywords:
            item.add_marker(skip_github)
