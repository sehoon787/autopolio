"""
Pytest fixtures for API testing.

Supports two modes:
1. Live server mode: Tests against a running server (Docker/local dev)
2. TestClient mode: Tests against FastAPI app in-process (CI, no server needed)

Mode is auto-detected: if the live server responds, use it; otherwise use TestClient.
In CI (CI env var set), TestClient mode is always forced.
"""

import os
import sys
import logging
import pytest
import httpx
from typing import Generator, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Ensure paths are on sys.path
# --------------------------------------------------------------------------- #
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_tests_api_dir = os.path.abspath(os.path.dirname(__file__))

# Project root: needed for `from api.xxx` imports
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

# tests/api/: needed for `from modules.xxx` imports in test files
if _tests_api_dir not in sys.path:
    sys.path.insert(0, _tests_api_dir)

# --------------------------------------------------------------------------- #
# Determine test mode: live server vs in-process TestClient
# --------------------------------------------------------------------------- #

# Try to import runtime config for port detection
try:
    from tests.utils.runtime_config import get_api_base_url
    _configured_base = get_api_base_url()
except Exception:
    _configured_base = "http://localhost:8085"

LIVE_BASE_URL = os.getenv("API_BASE_URL", f"{_configured_base}/api")
GITHUB_USER_ID = int(os.getenv("GITHUB_TEST_USER_ID", "25"))

# Force TestClient mode in CI environments
_IS_CI = bool(os.getenv("CI") or os.getenv("GITHUB_ACTIONS"))


def _server_is_alive() -> bool:
    """Check if the live API server is reachable."""
    if _IS_CI:
        return False
    try:
        with httpx.Client(timeout=3.0) as c:
            base = LIVE_BASE_URL.rsplit("/api", 1)[0]
            r = c.get(f"{base}/docs")
            return r.status_code == 200
    except Exception:
        return False


# Decide once at import time
USE_LIVE_SERVER = _server_is_alive()
logger.info("Test mode: %s", "LIVE SERVER" if USE_LIVE_SERVER else "TestClient (in-process)")


def _ensure_test_env():
    """Ensure required environment variables are set for TestClient mode.

    MUST be called BEFORE importing any api.* modules so that get_settings()
    picks up the test values on its first (cached) call.
    """
    from cryptography.fernet import Fernet

    if not os.getenv("ENCRYPTION_KEY"):
        os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode()
    else:
        # Validate existing key is a valid Fernet key
        key = os.environ["ENCRYPTION_KEY"]
        try:
            Fernet(key.encode() if isinstance(key, str) else key)
        except Exception:
            logger.warning("Invalid ENCRYPTION_KEY, generating new one")
            os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode()

    env_defaults = {
        "DATABASE_URL": "sqlite+aiosqlite:///./data/test_ci.db",
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-test-dummy",
        "GITHUB_CLIENT_ID": "test-client-id",
        "GITHUB_CLIENT_SECRET": "test-client-secret",
    }
    for key, default in env_defaults.items():
        if not os.getenv(key):
            os.environ[key] = default


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture(scope="session")
def base_url() -> str:
    """Return the base URL for API requests."""
    if USE_LIVE_SERVER:
        return LIVE_BASE_URL
    return "http://testserver/api"


@pytest.fixture(scope="session")
def _session_client():
    """Session-scoped client (TestClient or None for live mode).

    Uses context manager to ensure lifespan events (DB init) run properly.
    """
    if USE_LIVE_SERVER:
        yield None
    else:
        # 1. Set environment BEFORE importing any api.* modules
        _ensure_test_env()
        os.makedirs("data", exist_ok=True)
        os.makedirs("result", exist_ok=True)

        # 2. Remove stale test DB for a clean session
        test_db_path = os.path.join("data", "test_ci.db")
        for suffix in ("", "-wal", "-shm"):
            path = test_db_path + suffix
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass

        # 3. Clear get_settings cache so it reads fresh env vars
        from api.config import get_settings
        get_settings.cache_clear()

        # 4. Now import the app (triggers api.database module-level init)
        from api.main import app

        from starlette.testclient import TestClient
        with TestClient(app, base_url="http://testserver/api") as client:
            logger.info("TestClient session started (lifespan active)")
            yield client

        # 5. Cleanup: clear cache so other test suites get fresh settings
        get_settings.cache_clear()


@pytest.fixture
def api_client(_session_client, base_url: str) -> Generator[httpx.Client, None, None]:
    """
    Create an HTTP client for API testing.

    In live mode:  yields a plain httpx.Client targeting the running server.
    In CI mode:    yields the session-scoped TestClient (in-process).
    """
    if USE_LIVE_SERVER:
        with httpx.Client(base_url=base_url, timeout=30.0) as client:
            yield client
    else:
        # TestClient is already an httpx.Client subclass
        yield _session_client


@pytest.fixture
def test_user(api_client) -> Generator[dict, None, None]:
    """Create a test user and clean up after test."""
    unique_id = uuid4().hex[:8]
    response = api_client.post("/users", json={
        "name": f"E2E Test User {unique_id}",
        "email": f"test_{unique_id}@example.com"
    })
    response.raise_for_status()
    user = response.json()

    yield user

    try:
        api_client.delete(f"/users/{user['id']}")
    except httpx.HTTPError:
        pass


@pytest.fixture
def test_company(api_client, test_user: dict) -> Generator[dict, None, None]:
    """Create a test company for the test user."""
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

    try:
        api_client.delete(f"/knowledge/companies/{company['id']}", params={"user_id": test_user["id"]})
    except httpx.HTTPError:
        pass


@pytest.fixture
def test_project(api_client, test_user: dict, test_company: dict) -> Generator[dict, None, None]:
    """Create a test project linked to test user and company."""
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

    try:
        api_client.delete(f"/knowledge/projects/{project['id']}", params={"user_id": test_user["id"]})
    except httpx.HTTPError:
        pass


@pytest.fixture
def test_personal_project(api_client, test_user: dict) -> Generator[dict, None, None]:
    """Create a personal test project (no company)."""
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
def test_template(api_client, test_user: dict) -> Generator[dict, None, None]:
    """Create a test template."""
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
def github_user(api_client) -> Optional[dict]:
    """Get an existing GitHub-connected user for integration tests."""
    try:
        status_response = api_client.get("/github/status", params={"user_id": GITHUB_USER_ID})
        if status_response.status_code != 200:
            return None

        status = status_response.json()
        if not status.get("connected") or not status.get("valid"):
            return None

        user_response = api_client.get(f"/users/{GITHUB_USER_ID}")
        if user_response.status_code != 200:
            return None

        user = user_response.json()
        user["github_status"] = status
        return user
    except httpx.HTTPError:
        return None


@pytest.fixture
def github_project(api_client, github_user: Optional[dict]) -> Generator[Optional[dict], None, None]:
    """Create a test project for GitHub analysis tests."""
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

    try:
        api_client.delete(
            f"/knowledge/projects/{project['id']}",
            params={"user_id": github_user["id"]}
        )
    except httpx.HTTPError:
        pass


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "requires_github: mark test as requiring GitHub connection")
    config.addinivalue_line("markers", "llm_required: mark test as requiring LLM service (API or CLI)")
    config.addinivalue_line("markers", "slow: mark test as slow running")


def pytest_collection_modifyitems(config, items):
    """Skip tests marked with requires_github if no GitHub user is available."""
    if not USE_LIVE_SERVER:
        # In TestClient mode, always skip GitHub tests
        skip_github = pytest.mark.skip(reason="GitHub connection not available (TestClient mode)")
        for item in items:
            if "requires_github" in item.keywords:
                item.add_marker(skip_github)
        return

    try:
        with httpx.Client(base_url=LIVE_BASE_URL, timeout=10.0) as client:
            response = client.get("/github/status", params={"user_id": GITHUB_USER_ID})
            if response.status_code == 200:
                status = response.json()
                if status.get("connected") and status.get("valid"):
                    return
    except Exception:
        pass

    skip_github = pytest.mark.skip(reason="GitHub connection not available")
    for item in items:
        if "requires_github" in item.keywords:
            item.add_marker(skip_github)
