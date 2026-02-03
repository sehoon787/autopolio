"""
Companies API module for testing.
"""

from typing import Optional
import httpx
from .base import BaseAPIModule


class CompaniesAPI(BaseAPIModule):
    """API module for company management endpoints."""

    def list(self, user_id: int) -> httpx.Response:
        """
        List all companies for a user.

        Args:
            user_id: User ID

        Returns:
            Response with list of companies
        """
        return self._get("/knowledge/companies", params={"user_id": user_id})

    def create(
        self,
        user_id: int,
        name: str,
        position: Optional[str] = None,
        department: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        description: Optional[str] = None,
        **kwargs
    ) -> httpx.Response:
        """
        Create a new company.

        Args:
            user_id: User ID
            name: Company name
            position: Job position/title
            department: Department name
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            description: Company/role description
            **kwargs: Additional fields

        Returns:
            Response with created company data
        """
        data = {
            "name": name,
            **kwargs
        }
        if position:
            data["position"] = position
        if department:
            data["department"] = department
        if start_date:
            data["start_date"] = start_date
        if end_date:
            data["end_date"] = end_date
        if description:
            data["description"] = description

        return self._post("/knowledge/companies", json=data, params={"user_id": user_id})

    def get(self, company_id: int, user_id: Optional[int] = None) -> httpx.Response:
        """
        Get company by ID.

        Args:
            company_id: Company ID
            user_id: User ID (required by API)

        Returns:
            Response with company data
        """
        params = {}
        if user_id:
            params["user_id"] = user_id
        return self._get(f"/knowledge/companies/{company_id}", params=params if params else None)

    def update(self, company_id: int, user_id: int, **kwargs) -> httpx.Response:
        """
        Update company data.

        Args:
            company_id: Company ID
            user_id: User ID
            **kwargs: Fields to update

        Returns:
            Response with updated company data
        """
        return self._put(f"/knowledge/companies/{company_id}", json=kwargs, params={"user_id": user_id})

    def delete(self, company_id: int, user_id: Optional[int] = None) -> httpx.Response:
        """
        Delete a company.

        Args:
            company_id: Company ID
            user_id: User ID (required by API)

        Returns:
            Response confirming deletion
        """
        params = {}
        if user_id:
            params["user_id"] = user_id
        return self._delete(f"/knowledge/companies/{company_id}", params=params if params else None)

    def get_summary(self, company_id: int, user_id: Optional[int] = None) -> httpx.Response:
        """
        Get company summary with projects.

        Args:
            company_id: Company ID
            user_id: User ID (required by API)

        Returns:
            Response with company summary
        """
        params = {}
        if user_id:
            params["user_id"] = user_id
        return self._get(f"/knowledge/companies/{company_id}/summary", params=params if params else None)

    def get_grouped_by_company(self, user_id: int) -> httpx.Response:
        """
        Get projects grouped by company.

        Args:
            user_id: User ID

        Returns:
            Response with grouped projects
        """
        return self._get("/knowledge/companies/grouped-by-company", params={"user_id": user_id})

    def upload_logo(self, company_id: int, logo_file: bytes, filename: str) -> httpx.Response:
        """
        Upload company logo.

        Args:
            company_id: Company ID
            logo_file: Logo file bytes
            filename: Original filename

        Returns:
            Response with upload result
        """
        files = {"file": (filename, logo_file, "image/png")}
        return self._post(f"/knowledge/companies/{company_id}/logo", files=files)
