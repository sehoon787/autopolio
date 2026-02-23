"""
Documents API tests.
"""

import pytest
from modules.documents import DocumentsAPI
from modules.templates import TemplatesAPI


class TestDocumentList:
    """Test document listing."""

    def test_list_documents(self, api_client, test_user):
        """Test listing documents for a user."""
        api = DocumentsAPI(api_client)

        response = api.list(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        # API returns paginated response: {"documents": [...], "total": N, "page": N, "page_size": N}
        assert "documents" in data
        assert isinstance(data["documents"], list)
        assert "total" in data

    def test_get_document_not_found(self, api_client):
        """Test getting non-existent document returns 404."""
        api = DocumentsAPI(api_client)

        response = api.get(99999)

        assert response.status_code == 404


class TestReportGeneration:
    """Test report generation endpoints."""

    def test_generate_projects_report(self, api_client, test_user, test_project):
        """Test generating PROJECTS.md style report."""
        api = DocumentsAPI(api_client)

        response = api.generate_projects_report(
            user_id=test_user["id"],
            format="markdown"
        )

        assert response.status_code == 200
        data = response.json()
        assert "content" in data or "report" in data or isinstance(data, str)

    def test_generate_performance_report(self, api_client, test_user, test_project):
        """Test generating performance summary report."""
        api = DocumentsAPI(api_client)

        response = api.generate_performance_report(
            user_id=test_user["id"],
            format="markdown"
        )

        assert response.status_code == 200

    def test_generate_company_report(self, api_client, test_user, test_company, test_project):
        """Test generating company-integrated report."""
        api = DocumentsAPI(api_client)

        response = api.generate_company_report(
            user_id=test_user["id"],
            format="markdown"
        )

        assert response.status_code == 200


class TestExport:
    """Test document export functionality."""

    def test_export_preview(self, api_client, test_user, test_project):
        """Test export preview."""
        api = DocumentsAPI(api_client)

        response = api.export_preview(
            user_id=test_user["id"],
            report_type="summary"
        )

        assert response.status_code == 200

    def test_export_markdown(self, api_client, test_user, test_project):
        """Test exporting to Markdown."""
        api = DocumentsAPI(api_client)

        response = api.export_markdown(
            user_id=test_user["id"],
            report_type="summary"
        )

        assert response.status_code == 200
        data = response.json()
        assert "filename" in data or "download_url" in data or "content" in data

    def test_export_docx(self, api_client, test_user, test_project):
        """Test exporting to Word document."""
        api = DocumentsAPI(api_client)

        response = api.export_docx(
            user_id=test_user["id"],
            report_type="summary"
        )

        assert response.status_code == 200

    def test_export_detailed_type(self, api_client, test_user, test_project):
        """Test exporting with detailed report type."""
        api = DocumentsAPI(api_client)

        response = api.export_markdown(
            user_id=test_user["id"],
            report_type="detailed"
        )

        assert response.status_code == 200


class TestPipeline:
    """Test document generation pipeline."""

    @pytest.mark.slow
    def test_run_pipeline(self, api_client, test_user, test_project, test_template):
        """Test running document generation pipeline."""
        api = DocumentsAPI(api_client)

        response = api.run_pipeline(
            user_id=test_user["id"],
            template_id=test_template["id"],
            project_ids=[test_project["id"]],
            output_format="markdown"
        )

        # May return task ID for async operation
        assert response.status_code in [200, 202]
        if response.status_code == 200:
            data = response.json()
            assert "task_id" in data or "document" in data

    @pytest.mark.slow
    def test_get_pipeline_status(self, api_client, test_user, test_project, test_template):
        """Test getting pipeline task status."""
        api = DocumentsAPI(api_client)

        # Start pipeline first
        start_response = api.run_pipeline(
            user_id=test_user["id"],
            template_id=test_template["id"],
            project_ids=[test_project["id"]],
            output_format="markdown"
        )

        if start_response.status_code in [200, 202]:
            data = start_response.json()
            if "task_id" in data:
                status_response = api.get_pipeline_status(data["task_id"])
                assert status_response.status_code == 200
                status_data = status_response.json()
                assert "status" in status_data

    def test_get_pipeline_status_not_found(self, api_client):
        """Test getting status for non-existent task."""
        api = DocumentsAPI(api_client)

        response = api.get_pipeline_status("nonexistent-task-id")

        assert response.status_code in [404, 200]


class TestDocumentDownload:
    """Test document download functionality."""

    @pytest.mark.slow
    def test_download_after_export(self, api_client, test_user, test_project):
        """Test downloading an exported document."""
        api = DocumentsAPI(api_client)

        # Export first
        export_response = api.export_markdown(
            user_id=test_user["id"],
            report_type="summary"
        )

        if export_response.status_code == 200:
            data = export_response.json()
            if "filename" in data:
                download_response = api.download_export(data["filename"])
                assert download_response.status_code == 200


class TestDocumentManagement:
    """Test document management operations."""

    def test_delete_document_not_found(self, api_client):
        """Test deleting non-existent document."""
        api = DocumentsAPI(api_client)

        response = api.delete(99999)

        assert response.status_code in [404, 200]
