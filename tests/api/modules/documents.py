"""
Documents API module for testing.
"""

from typing import List, Literal
import httpx
from .base import BaseAPIModule


class DocumentsAPI(BaseAPIModule):
    """API module for document management endpoints."""

    def list(self, user_id: int) -> httpx.Response:
        """
        List all documents for a user.

        Args:
            user_id: User ID

        Returns:
            Response with paginated document list
            Format: {"documents": [...], "total": N, "page": N, "page_size": N}
        """
        return self._get("/documents", params={"user_id": user_id})

    def get(self, document_id: int) -> httpx.Response:
        """Get document by ID."""
        return self._get(f"/documents/{document_id}")

    def download(self, document_id: int) -> httpx.Response:
        """Download a document."""
        return self._get(f"/documents/{document_id}/download")

    def delete(self, document_id: int) -> httpx.Response:
        """Delete a document."""
        return self._delete(f"/documents/{document_id}")

    # Report generation endpoints

    def generate_projects_report(
        self, user_id: int, format: str = "markdown"
    ) -> httpx.Response:
        """Generate PROJECTS.md style report."""
        return self._get(
            "/documents/reports/projects", params={"user_id": user_id, "format": format}
        )

    def generate_performance_report(
        self, user_id: int, format: str = "markdown"
    ) -> httpx.Response:
        """Generate performance summary report."""
        return self._get(
            "/documents/reports/performance",
            params={"user_id": user_id, "format": format},
        )

    def generate_company_report(
        self, user_id: int, format: str = "markdown"
    ) -> httpx.Response:
        """Generate company-integrated report."""
        return self._get(
            "/documents/reports/company-integrated",
            params={"user_id": user_id, "format": format},
        )

    # Export endpoints (all use Query params, not JSON body)

    def export_preview(
        self,
        user_id: int,
        report_type: Literal["detailed", "final", "summary"] = "summary",
        include_code_stats: bool = False,
        language: str = "ko",
    ) -> httpx.Response:
        """Preview export content."""
        return self._get(
            "/documents/export/preview",
            params={
                "user_id": user_id,
                "report_type": report_type,
                "include_code_stats": include_code_stats,
                "language": language,
            },
        )

    def export_markdown(
        self,
        user_id: int,
        report_type: Literal["detailed", "final", "summary"] = "summary",
        include_code_stats: bool = False,
        language: str = "ko",
    ) -> httpx.Response:
        """Export to Markdown file. Returns {"filename": ..., "download_url": ...}."""
        return self._post(
            "/documents/export/markdown",
            params={
                "user_id": user_id,
                "report_type": report_type,
                "include_code_stats": include_code_stats,
                "language": language,
            },
        )

    def export_docx(
        self,
        user_id: int,
        report_type: Literal["detailed", "final", "summary"] = "summary",
        include_code_stats: bool = False,
        language: str = "ko",
    ) -> httpx.Response:
        """Export to Word document. Returns {"filename": ..., "download_url": ...}."""
        return self._post(
            "/documents/export/docx",
            params={
                "user_id": user_id,
                "report_type": report_type,
                "include_code_stats": include_code_stats,
                "language": language,
            },
        )

    def download_export(self, filename: str) -> httpx.Response:
        """Download an exported file."""
        return self._get(f"/documents/export/download/{filename}")

    # Pipeline endpoints

    def run_pipeline(
        self,
        user_id: int,
        template_id: int,
        project_ids: List[int],
        output_format: str = "docx",
    ) -> httpx.Response:
        """Run document generation pipeline."""
        return self._post(
            "/pipeline/run",
            params={"user_id": user_id},
            json={
                "template_id": template_id,
                "project_ids": project_ids,
                "output_format": output_format,
            },
        )

    def get_pipeline_status(self, task_id: str) -> httpx.Response:
        """Get pipeline task status."""
        return self._get(f"/pipeline/tasks/{task_id}")

    def cancel_pipeline(self, task_id: str) -> httpx.Response:
        """Cancel a running pipeline task."""
        return self._delete(f"/pipeline/tasks/{task_id}")
