"""
Platform template API tests.
"""

from modules.platforms import PlatformsAPI, _get_template_list


class TestPlatformTemplateList:
    """Test platform template listing."""

    def test_list_platforms(self, api_client):
        """Test listing all platform templates."""
        api = PlatformsAPI(api_client)

        response = api.list()

        assert response.status_code == 200
        data = response.json()
        # API returns {"templates": [...], "total": N}
        assert "templates" in data
        assert isinstance(data["templates"], list)

    def test_init_system_templates(self, api_client):
        """Test initializing system templates."""
        api = PlatformsAPI(api_client)

        response = api.init_system_templates()

        # May succeed or indicate already initialized
        assert response.status_code in [200, 201, 409]

    def test_get_platform(self, api_client):
        """Test getting a specific platform template."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.get(templates[0]["id"])
            assert response.status_code == 200
            data = response.json()
            assert "id" in data
            assert "name" in data or "platform_name" in data

    def test_get_platform_not_found(self, api_client):
        """Test getting non-existent platform returns 404."""
        api = PlatformsAPI(api_client)

        response = api.get(99999)

        assert response.status_code == 404


class TestPlatformPreview:
    """Test platform template preview."""

    def test_preview_with_sample_data(self, api_client):
        """Test previewing template with sample data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.preview(platform_id=templates[0]["id"], use_sample=True)
            assert response.status_code == 200
            data = response.json()
            assert "html" in data

    def test_preview_with_render_data(self, api_client):
        """Test previewing template with explicit render data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.preview(
                platform_id=templates[0]["id"],
                use_sample=False,
                render_data={
                    "name": "Test User",
                    "email": "test@example.com",
                    "projects": [
                        {
                            "name": "Test Project",
                            "description": "A test project",
                            "role": "Developer",
                            "technologies": ["Python"],
                        }
                    ],
                },
            )
            assert response.status_code == 200


class TestPlatformRender:
    """Test platform template rendering."""

    def test_render_with_data(self, api_client):
        """Test rendering template with provided data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.render(
                platform_id=templates[0]["id"],
                user_data={
                    "name": "Test User",
                    "email": "test@example.com",
                    "phone": "010-1234-5678",
                    "projects": [
                        {
                            "name": "Test Project",
                            "description": "A test project",
                            "role": "Developer",
                            "technologies": ["Python", "React"],
                        }
                    ],
                },
            )
            assert response.status_code == 200

    def test_render_from_db(self, api_client, test_user, test_project):
        """Test rendering template with data from database."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.render_from_db(
                platform_id=templates[0]["id"], user_id=test_user["id"]
            )
            assert response.status_code == 200


class TestPlatformExport:
    """Test platform template export."""

    def test_export_from_db_html(self, api_client, test_user, test_project):
        """Test exporting template as HTML using DB data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.export_from_db_html(
                platform_id=templates[0]["id"], user_id=test_user["id"]
            )
            assert response.status_code == 200
            data = response.json()
            assert "filename" in data
            assert "download_url" in data

    def test_export_from_db_markdown(self, api_client, test_user, test_project):
        """Test exporting template as Markdown using DB data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.export_from_db_markdown(
                platform_id=templates[0]["id"], user_id=test_user["id"]
            )
            assert response.status_code == 200

    def test_export_from_db_docx(self, api_client, test_user, test_project):
        """Test exporting template as Word document using DB data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.export_from_db_docx(
                platform_id=templates[0]["id"], user_id=test_user["id"]
            )
            assert response.status_code == 200
            data = response.json()
            assert "filename" in data

    def test_export_html_with_sample_data(self, api_client):
        """Test exporting with sample data (no user required)."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.export_html(platform_id=templates[0]["id"])
            assert response.status_code == 200

    def test_export_markdown_with_sample_data(self, api_client):
        """Test exporting Markdown with sample data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.export_markdown(platform_id=templates[0]["id"])
            assert response.status_code == 200

    def test_export_docx_with_sample_data(self, api_client):
        """Test exporting Word doc with sample data."""
        api = PlatformsAPI(api_client)

        templates = _get_template_list(api)
        if len(templates) > 0:
            response = api.export_docx(platform_id=templates[0]["id"])
            assert response.status_code == 200
