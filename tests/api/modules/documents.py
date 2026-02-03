"""
Documents API module for testing.
"""

from typing import Optional, List
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
            Response with list of documents
        """
        return self._get("/documents", params={"user_id": user_id})

    def get(self, document_id: int) -> httpx.Response:
        """
        Get document by ID.

        Args:
            document_id: Document ID

        Returns:
            Response with document data
        """
        return self._get(f"/documents/{document_id}")

    def download(self, document_id: int) -> httpx.Response:
        """
        Download a document.

        Args:
            document_id: Document ID

        Returns:
            Response with file content
        """
        return self._get(f"/documents/{document_id}/download")

    def delete(self, document_id: int) -> httpx.Response:
        """
        Delete a document.

        Args:
            document_id: Document ID

        Returns:
            Response confirming deletion
        """
        return self._delete(f"/documents/{document_id}")

    # Report generation endpoints

    def generate_projects_report(
        self,
        user_id: int,
        format: str = "markdown"
    ) -> httpx.Response:
        """
        Generate PROJECTS.md style report.

        Args:
            user_id: User ID
            format: Output format (markdown, html)

        Returns:
            Response with report content
        """
        return self._get("/documents/reports/projects", params={
            "user_id": user_id,
            "format": format
        })

    def generate_performance_report(
        self,
        user_id: int,
        format: str = "markdown"
    ) -> httpx.Response:
        """
        Generate performance summary report.

        Args:
            user_id: User ID
            format: Output format (markdown, html)

        Returns:
            Response with report content
        """
        return self._get("/documents/reports/performance", params={
            "user_id": user_id,
            "format": format
        })

    def generate_company_report(
        self,
        user_id: int,
        format: str = "markdown"
    ) -> httpx.Response:
        """
        Generate company-integrated report.

        Args:
            user_id: User ID
            format: Output format (markdown, html)

        Returns:
            Response with report content
        """
        return self._get("/documents/reports/company-integrated", params={
            "user_id": user_id,
            "format": format
        })

    # Export endpoints

    def export_preview(
        self,
        user_id: int,
        export_type: str = "performance",
        format: str = "markdown"
    ) -> httpx.Response:
        """
        Preview export content.

        Args:
            user_id: User ID
            export_type: Type of export (performance, projects)
            format: Output format

        Returns:
            Response with preview content
        """
        return self._get("/documents/export/preview", params={
            "user_id": user_id,
            "export_type": export_type,
            "format": format
        })

    def export_markdown(
        self,
        user_id: int,
        export_type: str = "performance",
        project_ids: Optional[List[int]] = None
    ) -> httpx.Response:
        """
        Export to Markdown file.

        Args:
            user_id: User ID
            export_type: Type of export
            project_ids: Optional list of project IDs to include

        Returns:
            Response with download info
        """
        data = {
            "user_id": user_id,
            "export_type": export_type,
        }
        if project_ids:
            data["project_ids"] = project_ids

        return self._post("/documents/export/markdown", json=data)

    def export_docx(
        self,
        user_id: int,
        export_type: str = "performance",
        project_ids: Optional[List[int]] = None
    ) -> httpx.Response:
        """
        Export to Word document.

        Args:
            user_id: User ID
            export_type: Type of export
            project_ids: Optional list of project IDs to include

        Returns:
            Response with download info
        """
        data = {
            "user_id": user_id,
            "export_type": export_type,
        }
        if project_ids:
            data["project_ids"] = project_ids

        return self._post("/documents/export/docx", json=data)

    def download_export(self, filename: str) -> httpx.Response:
        """
        Download an exported file.

        Args:
            filename: Filename to download

        Returns:
            Response with file content
        """
        return self._get(f"/documents/export/download/{filename}")

    # Pipeline endpoints

    def run_pipeline(
        self,
        user_id: int,
        template_id: int,
        project_ids: List[int],
        output_format: str = "docx"
    ) -> httpx.Response:
        """
        Run document generation pipeline.

        Args:
            user_id: User ID
            template_id: Template ID
            project_ids: List of project IDs to include
            output_format: Output format (docx, pdf, markdown)

        Returns:
            Response with task ID
        """
        return self._post("/pipeline/run", json={
            "user_id": user_id,
            "template_id": template_id,
            "project_ids": project_ids,
            "output_format": output_format
        })

    def get_pipeline_status(self, task_id: str) -> httpx.Response:
        """
        Get pipeline task status.

        Args:
            task_id: Task ID

        Returns:
            Response with task status
        """
        return self._get(f"/pipeline/tasks/{task_id}")

    def cancel_pipeline(self, task_id: str) -> httpx.Response:
        """
        Cancel a running pipeline task.

        Args:
            task_id: Task ID

        Returns:
            Response confirming cancellation
        """
        return self._delete(f"/pipeline/tasks/{task_id}")
