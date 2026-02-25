"""Tests for authentication middleware (dual-mode: desktop user_id vs web JWT)."""


class TestDesktopAuth:
    """Desktop mode: user_id query parameter authentication."""

    def test_user_id_param_works(self, api_client, test_user):
        """Endpoints accept user_id query parameter in SQLite mode."""
        response = api_client.get(
            "/knowledge/companies", params={"user_id": test_user["id"]}
        )
        assert response.status_code == 200

    def test_missing_user_id_for_protected_endpoint(self, api_client):
        """Export endpoint requires user_id."""
        response = api_client.get("/data/export")
        # Should fail with 400 or 422 (missing user_id)
        assert response.status_code in (400, 422)


class TestDataMigration:
    """Data migration export/import endpoints."""

    def test_export_empty_user(self, api_client, test_user):
        """Export for a new user returns empty collections."""
        response = api_client.get(
            "/data/export", params={"user_id": test_user["id"]}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["version"] == "1.0"
        assert data["companies"] == []
        assert data["projects"] == []

    def test_export_with_data(self, api_client, test_user, test_company, test_project):
        """Export includes companies and projects."""
        response = api_client.get(
            "/data/export", params={"user_id": test_user["id"]}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["companies"]) >= 1
        assert len(data["projects"]) >= 1
        # Sensitive fields should be excluded
        assert "github_token_encrypted" not in data["user"]
        assert "openai_api_key_encrypted" not in data["user"]

    def test_import_roundtrip(self, api_client, test_user, test_company, test_project):
        """Export data, create new user, import into it — data should match."""
        # Export from first user
        export_resp = api_client.get(
            "/data/export", params={"user_id": test_user["id"]}
        )
        assert export_resp.status_code == 200
        export_data = export_resp.json()

        # Create second user
        from uuid import uuid4

        uid = uuid4().hex[:8]
        new_user_resp = api_client.post(
            "/users",
            json={"name": f"Import Target {uid}", "email": f"import_{uid}@test.com"},
        )
        assert new_user_resp.status_code in (200, 201)
        new_user = new_user_resp.json()

        try:
            # Import into second user
            import_resp = api_client.post(
                "/data/import",
                params={"user_id": new_user["id"]},
                json=export_data,
            )
            assert import_resp.status_code == 200
            result = import_resp.json()
            assert result["imported_counts"]["companies"] >= 1
            assert result["imported_counts"]["projects"] >= 1

            # Verify data exists for new user
            verify_resp = api_client.get(
                "/data/export", params={"user_id": new_user["id"]}
            )
            assert verify_resp.status_code == 200
            verify_data = verify_resp.json()
            assert len(verify_data["companies"]) >= 1
            assert len(verify_data["projects"]) >= 1
        finally:
            # Cleanup
            try:
                api_client.delete(f"/users/{new_user['id']}")
            except Exception:
                pass
