"""
Tier-specific pricing tests.

These tests validate that tier restrictions (project limits, export format
locks, usage endpoint) work correctly.

In TestClient mode, conftest sets AUTOPOLIO_RUNTIME=local which bypasses
tier checks.  The ``_force_tier_enforcement`` fixture overrides that to
AUTOPOLIO_RUNTIME=docker so the guards actually fire.

In live (Docker) mode, AUTOPOLIO_RUNTIME is already ``docker`` so the
monkeypatch is a no-op (applied defensively).
"""

import pytest
from uuid import uuid4
from conftest import USE_LIVE_SERVER
from modules.documents import DocumentsAPI
from modules.platforms import PlatformsAPI, _get_template_list

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_user(api_client, tier: str = "free") -> dict:
    """Create a user and set their tier.  Returns user dict."""
    uid = uuid4().hex[:8]
    resp = api_client.post(
        "/users",
        json={"name": f"Tier Test {uid}", "email": f"tier_{uid}@example.com"},
    )
    resp.raise_for_status()
    user = resp.json()

    tier_resp = api_client.put(f"/users/{user['id']}", json={"tier": tier})
    if tier_resp.status_code == 200:
        user = tier_resp.json()
    return user


def _delete_user(api_client, user_id: int):
    try:
        api_client.delete(f"/users/{user_id}")
    except Exception:
        pass


def _create_project(api_client, user_id: int, suffix: str = "") -> dict:
    uid = uuid4().hex[:6]
    resp = api_client.post(
        "/knowledge/projects",
        params={"user_id": user_id},
        json={
            "name": f"Tier Project {uid}{suffix}",
            "description": "Tier limit test project",
            "role": "Developer",
            "team_size": 1,
            "project_type": "personal",
            "start_date": "2024-01-01",
        },
    )
    return resp


def _delete_project(api_client, project_id: int, user_id: int):
    try:
        api_client.delete(
            f"/knowledge/projects/{project_id}", params={"user_id": user_id}
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _force_tier_enforcement(monkeypatch):
    """Override AUTOPOLIO_RUNTIME to ``docker`` so tier guards are active.

    In TestClient mode this overrides the ``local`` value set by conftest.
    In live mode the Docker container already has ``docker`` but we set it
    defensively so the test is self-contained.
    """
    monkeypatch.setenv("AUTOPOLIO_RUNTIME", "docker")


@pytest.fixture
def free_user(api_client):
    user = _create_user(api_client, "free")
    yield user
    _delete_user(api_client, user["id"])


@pytest.fixture
def pro_user(api_client):
    user = _create_user(api_client, "pro")
    yield user
    _delete_user(api_client, user["id"])


@pytest.fixture
def enterprise_user(api_client):
    user = _create_user(api_client, "enterprise")
    yield user
    _delete_user(api_client, user["id"])


# ---------------------------------------------------------------------------
# Tests: /users/{id}/usage endpoint
# ---------------------------------------------------------------------------


@pytest.mark.tier
class TestTierUsageEndpoint:
    def test_free_user_usage(self, api_client, free_user):
        resp = api_client.get(f"/users/{free_user['id']}/usage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tier"] == "free"
        assert data["limits"]["max_projects"] == 3
        assert data["limits"]["allowed_export_formats"] == ["md"]

    def test_pro_user_usage(self, api_client, pro_user):
        resp = api_client.get(f"/users/{pro_user['id']}/usage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tier"] == "pro"
        assert data["limits"]["max_projects"] == 20
        assert "docx" in data["limits"]["allowed_export_formats"]
        assert "html" in data["limits"]["allowed_export_formats"]

    def test_enterprise_user_usage(self, api_client, enterprise_user):
        resp = api_client.get(f"/users/{enterprise_user['id']}/usage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tier"] == "enterprise"
        assert data["limits"]["max_projects"] is None  # unlimited


# ---------------------------------------------------------------------------
# Tests: Export format restrictions
# ---------------------------------------------------------------------------


@pytest.mark.tier
class TestExportFormatRestrictions:
    def test_free_md_export_allowed(self, api_client, free_user):
        """FREE tier can export markdown (always allowed)."""
        api = DocumentsAPI(api_client)
        resp = api.export_markdown(user_id=free_user["id"])
        # 200 or 404 (no projects) — but NOT 403
        assert resp.status_code != 403

    def test_free_docx_export_blocked(self, api_client, free_user):
        """FREE tier cannot export docx."""
        api = DocumentsAPI(api_client)
        resp = api.export_docx(user_id=free_user["id"])
        assert resp.status_code == 403
        detail = resp.json().get("detail", {})
        assert detail.get("code") == "EXPORT_FORMAT_LOCKED"
        assert detail.get("tier") == "free"

    def test_pro_docx_export_allowed(self, api_client, pro_user):
        """PRO tier can export docx."""
        api = DocumentsAPI(api_client)
        resp = api.export_docx(user_id=pro_user["id"])
        # 200 or 404 (no data) — but NOT 403
        assert resp.status_code != 403

    def test_pro_html_export_allowed(self, api_client, pro_user):
        """PRO tier can export html from platform templates."""
        api = PlatformsAPI(api_client)
        templates = _get_template_list(api)
        if not templates:
            pytest.skip("No platform templates available")
        resp = api.export_from_db_html(
            platform_id=templates[0]["id"], user_id=pro_user["id"]
        )
        # 200 or 404 — but NOT 403
        assert resp.status_code != 403

    def test_enterprise_all_formats(self, api_client, enterprise_user):
        """ENTERPRISE tier can export any format."""
        api = DocumentsAPI(api_client)
        resp = api.export_docx(user_id=enterprise_user["id"])
        assert resp.status_code != 403


# ---------------------------------------------------------------------------
# Tests: Project limit restrictions
# ---------------------------------------------------------------------------


@pytest.mark.tier
class TestProjectLimitRestrictions:
    def test_free_project_limit(self, api_client, free_user):
        """FREE tier is limited to 3 projects."""
        created = []
        try:
            # Create 3 projects (should succeed)
            for i in range(3):
                resp = _create_project(api_client, free_user["id"], f"-{i}")
                assert resp.status_code == 201, f"Project {i+1} should succeed"
                created.append(resp.json())

            # 4th project should be blocked
            resp = _create_project(api_client, free_user["id"], "-excess")
            assert resp.status_code == 403
            detail = resp.json().get("detail", {})
            assert detail.get("code") == "PROJECT_LIMIT_REACHED"
        finally:
            for p in created:
                _delete_project(api_client, p["id"], free_user["id"])

    def test_pro_higher_limit(self, api_client, pro_user):
        """PRO tier can create more than 3 projects."""
        created = []
        try:
            for i in range(4):
                resp = _create_project(api_client, pro_user["id"], f"-{i}")
                assert resp.status_code == 201, f"PRO project {i+1} should succeed"
                created.append(resp.json())
        finally:
            for p in created:
                _delete_project(api_client, p["id"], pro_user["id"])

    def test_enterprise_unlimited(self, api_client, enterprise_user):
        """ENTERPRISE tier has no project limit."""
        created = []
        try:
            for i in range(5):
                resp = _create_project(api_client, enterprise_user["id"], f"-{i}")
                assert resp.status_code == 201, f"Enterprise project {i+1} should succeed"
                created.append(resp.json())
        finally:
            for p in created:
                _delete_project(api_client, p["id"], enterprise_user["id"])


# ---------------------------------------------------------------------------
# Tests: Local runtime bypass (TestClient mode only)
# ---------------------------------------------------------------------------


@pytest.mark.tier
@pytest.mark.skipif(USE_LIVE_SERVER, reason="TestClient mode only — monkeypatch affects server env directly")
class TestLocalRuntimeBypass:
    def test_local_bypasses_export(self, api_client, monkeypatch):
        """AUTOPOLIO_RUNTIME=local lets FREE users export docx."""
        monkeypatch.setenv("AUTOPOLIO_RUNTIME", "local")
        user = _create_user(api_client, "free")
        try:
            api = DocumentsAPI(api_client)
            resp = api.export_docx(user_id=user["id"])
            # Should NOT be 403 — local runtime bypasses format check
            assert resp.status_code != 403
        finally:
            _delete_user(api_client, user["id"])

    def test_electron_bypasses_limit(self, api_client, monkeypatch):
        """AUTOPOLIO_RUNTIME=electron lets FREE users exceed project limit."""
        monkeypatch.setenv("AUTOPOLIO_RUNTIME", "electron")
        user = _create_user(api_client, "free")
        created = []
        try:
            for i in range(4):
                resp = _create_project(api_client, user["id"], f"-{i}")
                assert resp.status_code == 201, f"Electron project {i+1} should succeed"
                created.append(resp.json())
        finally:
            for p in created:
                _delete_project(api_client, p["id"], user["id"])
            _delete_user(api_client, user["id"])


# ---------------------------------------------------------------------------
# Tests: Tier upgrade / downgrade
# ---------------------------------------------------------------------------


@pytest.mark.tier
class TestTierUpgradeDowngrade:
    def test_upgrade_free_to_pro(self, api_client):
        """Upgrading from FREE to PRO immediately unlocks docx export."""
        user = _create_user(api_client, "free")
        try:
            api = DocumentsAPI(api_client)

            # FREE: docx blocked
            resp = api.export_docx(user_id=user["id"])
            assert resp.status_code == 403

            # Upgrade to PRO
            api_client.put(f"/users/{user['id']}", json={"tier": "pro"})

            # PRO: docx allowed
            resp = api.export_docx(user_id=user["id"])
            assert resp.status_code != 403
        finally:
            _delete_user(api_client, user["id"])

    def test_downgrade_pro_to_free(self, api_client):
        """Downgrading from PRO to FREE re-locks docx export."""
        user = _create_user(api_client, "pro")
        try:
            api = DocumentsAPI(api_client)

            # PRO: docx allowed
            resp = api.export_docx(user_id=user["id"])
            assert resp.status_code != 403

            # Downgrade to FREE
            api_client.put(f"/users/{user['id']}", json={"tier": "free"})

            # FREE: docx blocked
            resp = api.export_docx(user_id=user["id"])
            assert resp.status_code == 403
        finally:
            _delete_user(api_client, user["id"])
