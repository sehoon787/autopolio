"""
Credentials API module for testing.

Handles certifications, education, awards, publications, and volunteer activities.
Aligned with actual API schemas.
"""

from typing import Optional
import httpx
from .base import BaseAPIModule


class CredentialsAPI(BaseAPIModule):
    """API module for credentials management endpoints."""

    # ==================== Certifications ====================

    def list_certifications(self, user_id: int) -> httpx.Response:
        """List all certifications for a user."""
        return self._get(
            "/knowledge/credentials/certifications", params={"user_id": user_id}
        )

    def create_certification(
        self,
        user_id: int,
        name: str,
        issuer: Optional[str] = None,
        issue_date: Optional[str] = None,
        expiry_date: Optional[str] = None,
        credential_id: Optional[str] = None,
        credential_url: Optional[str] = None,
        description: Optional[str] = None,
        **kwargs,
    ) -> httpx.Response:
        """Create a new certification."""
        data = {"name": name, **kwargs}
        if issuer:
            data["issuer"] = issuer
        if issue_date:
            data["issue_date"] = issue_date
        if expiry_date:
            data["expiry_date"] = expiry_date
        if credential_id:
            data["credential_id"] = credential_id
        if credential_url:
            data["credential_url"] = credential_url
        if description:
            data["description"] = description

        return self._post(
            "/knowledge/credentials/certifications",
            params={"user_id": user_id},
            json=data,
        )

    def update_certification(
        self, cert_id: int, user_id: int, **kwargs
    ) -> httpx.Response:
        """Update a certification."""
        return self._put(
            f"/knowledge/credentials/certifications/{cert_id}",
            params={"user_id": user_id},
            json=kwargs,
        )

    def delete_certification(self, cert_id: int, user_id: int) -> httpx.Response:
        """Delete a certification."""
        return self._delete(
            f"/knowledge/credentials/certifications/{cert_id}",
            params={"user_id": user_id},
        )

    # ==================== Education ====================

    def list_education(self, user_id: int) -> httpx.Response:
        """List all education records for a user."""
        return self._get(
            "/knowledge/credentials/educations", params={"user_id": user_id}
        )

    def create_education(
        self,
        user_id: int,
        school_name: str,
        major: Optional[str] = None,
        degree: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        gpa: Optional[str] = None,
        graduation_status: Optional[str] = None,
        description: Optional[str] = None,
        **kwargs,
    ) -> httpx.Response:
        """Create a new education record."""
        data = {"school_name": school_name, **kwargs}
        if major:
            data["major"] = major
        if degree:
            data["degree"] = degree
        if start_date:
            data["start_date"] = start_date
        if end_date:
            data["end_date"] = end_date
        if gpa:
            data["gpa"] = gpa
        if graduation_status:
            data["graduation_status"] = graduation_status
        if description:
            data["description"] = description

        return self._post(
            "/knowledge/credentials/educations", params={"user_id": user_id}, json=data
        )

    def update_education(self, edu_id: int, user_id: int, **kwargs) -> httpx.Response:
        """Update an education record."""
        return self._put(
            f"/knowledge/credentials/educations/{edu_id}",
            params={"user_id": user_id},
            json=kwargs,
        )

    def delete_education(self, edu_id: int, user_id: int) -> httpx.Response:
        """Delete an education record."""
        return self._delete(
            f"/knowledge/credentials/educations/{edu_id}", params={"user_id": user_id}
        )

    # ==================== Awards ====================

    def list_awards(self, user_id: int) -> httpx.Response:
        """List all awards for a user."""
        return self._get("/knowledge/credentials/awards", params={"user_id": user_id})

    def create_award(
        self,
        user_id: int,
        name: str,
        issuer: Optional[str] = None,
        award_date: Optional[str] = None,
        description: Optional[str] = None,
        award_url: Optional[str] = None,
        **kwargs,
    ) -> httpx.Response:
        """Create a new award record."""
        data = {"name": name, **kwargs}
        if issuer:
            data["issuer"] = issuer
        if award_date:
            data["award_date"] = award_date
        if description:
            data["description"] = description
        if award_url:
            data["award_url"] = award_url

        return self._post(
            "/knowledge/credentials/awards", params={"user_id": user_id}, json=data
        )

    def update_award(self, award_id: int, user_id: int, **kwargs) -> httpx.Response:
        """Update an award record."""
        return self._put(
            f"/knowledge/credentials/awards/{award_id}",
            params={"user_id": user_id},
            json=kwargs,
        )

    def delete_award(self, award_id: int, user_id: int) -> httpx.Response:
        """Delete an award record."""
        return self._delete(
            f"/knowledge/credentials/awards/{award_id}", params={"user_id": user_id}
        )

    # ==================== Publications/Patents ====================

    def list_publications(self, user_id: int) -> httpx.Response:
        """List all publications/patents for a user."""
        return self._get(
            "/knowledge/credentials/publications", params={"user_id": user_id}
        )

    def create_publication(
        self,
        user_id: int,
        title: str,
        publication_type: Optional[str] = None,
        authors: Optional[str] = None,
        publisher: Optional[str] = None,
        publication_date: Optional[str] = None,
        doi: Optional[str] = None,
        url: Optional[str] = None,
        description: Optional[str] = None,
        **kwargs,
    ) -> httpx.Response:
        """Create a new publication/patent record."""
        data = {"title": title, **kwargs}
        if publication_type:
            data["publication_type"] = publication_type
        if authors:
            data["authors"] = authors
        if publisher:
            data["publisher"] = publisher
        if publication_date:
            data["publication_date"] = publication_date
        if doi:
            data["doi"] = doi
        if url:
            data["url"] = url
        if description:
            data["description"] = description

        return self._post(
            "/knowledge/credentials/publications",
            params={"user_id": user_id},
            json=data,
        )

    def update_publication(self, pub_id: int, user_id: int, **kwargs) -> httpx.Response:
        """Update a publication record."""
        return self._put(
            f"/knowledge/credentials/publications/{pub_id}",
            params={"user_id": user_id},
            json=kwargs,
        )

    def delete_publication(self, pub_id: int, user_id: int) -> httpx.Response:
        """Delete a publication record."""
        return self._delete(
            f"/knowledge/credentials/publications/{pub_id}", params={"user_id": user_id}
        )

    # ==================== Volunteer Activities ====================

    def list_activities(self, user_id: int) -> httpx.Response:
        """List all volunteer activities for a user."""
        return self._get(
            "/knowledge/credentials/volunteer_activities", params={"user_id": user_id}
        )

    def create_activity(
        self,
        user_id: int,
        name: str,
        activity_type: Optional[str] = None,
        organization: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        role: Optional[str] = None,
        hours: Optional[int] = None,
        description: Optional[str] = None,
        **kwargs,
    ) -> httpx.Response:
        """Create a new volunteer activity record."""
        data = {"name": name, **kwargs}
        if activity_type:
            data["activity_type"] = activity_type
        if organization:
            data["organization"] = organization
        if start_date:
            data["start_date"] = start_date
        if end_date:
            data["end_date"] = end_date
        if role:
            data["role"] = role
        if hours:
            data["hours"] = hours
        if description:
            data["description"] = description

        return self._post(
            "/knowledge/credentials/volunteer_activities",
            params={"user_id": user_id},
            json=data,
        )

    def update_activity(
        self, activity_id: int, user_id: int, **kwargs
    ) -> httpx.Response:
        """Update a volunteer activity record."""
        return self._put(
            f"/knowledge/credentials/volunteer_activities/{activity_id}",
            params={"user_id": user_id},
            json=kwargs,
        )

    def delete_activity(self, activity_id: int, user_id: int) -> httpx.Response:
        """Delete a volunteer activity record."""
        return self._delete(
            f"/knowledge/credentials/volunteer_activities/{activity_id}",
            params={"user_id": user_id},
        )
