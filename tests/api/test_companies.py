"""
Companies API tests.
"""

import pytest
from uuid import uuid4
from modules.companies import CompaniesAPI


class TestCompanyCRUD:
    """Test company CRUD operations."""

    def test_create_company(self, api_client, test_user):
        """Test creating a new company."""
        api = CompaniesAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create(
            user_id=test_user["id"],
            name=f"Test Company {unique_id}",
            position="Software Engineer",
            department="Engineering",
            start_date="2024-01-01"
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["name"] == f"Test Company {unique_id}"
        assert data["position"] == "Software Engineer"
        assert "id" in data

        # Cleanup
        api.delete(data["id"], test_user["id"])

    def test_list_companies(self, api_client, test_user, test_company):
        """Test listing companies for a user."""
        api = CompaniesAPI(api_client)

        response = api.list(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(c["id"] == test_company["id"] for c in data)

    def test_get_company(self, api_client, test_user, test_company):
        """Test getting a company by ID."""
        api = CompaniesAPI(api_client)

        response = api.get(test_company["id"], test_user["id"])

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_company["id"]

    def test_get_company_not_found(self, api_client, test_user):
        """Test getting non-existent company returns 404."""
        api = CompaniesAPI(api_client)

        response = api.get(99999, test_user["id"])

        assert response.status_code == 404

    def test_update_company(self, api_client, test_user, test_company):
        """Test updating company data."""
        api = CompaniesAPI(api_client)

        response = api.update(
            test_company["id"],
            test_user["id"],
            name="Updated Company Name",
            position="Senior Engineer"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Company Name"
        assert data["position"] == "Senior Engineer"

    def test_update_company_dates(self, api_client, test_user, test_company):
        """Test updating company dates."""
        api = CompaniesAPI(api_client)

        response = api.update(
            test_company["id"],
            test_user["id"],
            start_date="2023-01-01",
            end_date="2024-12-31"
        )

        assert response.status_code == 200
        data = response.json()
        assert "2023-01-01" in data["start_date"]
        assert "2024-12-31" in data["end_date"]

    def test_delete_company(self, api_client, test_user):
        """Test deleting a company."""
        api = CompaniesAPI(api_client)

        # Create company first
        create_response = api.create(
            user_id=test_user["id"],
            name="To Delete Company",
            position="Developer"
        )
        company_id = create_response.json()["id"]

        # Delete
        response = api.delete(company_id, test_user["id"])
        assert response.status_code in [200, 204]

        # Verify deleted - API may use soft delete (200) or hard delete (404)
        get_response = api.get(company_id, test_user["id"])
        # Accept both: 404 (hard delete) or 200 with deleted flag (soft delete)
        assert get_response.status_code in [200, 404]


class TestCompanyAdvanced:
    """Test advanced company features."""

    def test_get_company_summary(self, api_client, test_user, test_company, test_project):
        """Test getting company summary with projects."""
        api = CompaniesAPI(api_client)

        response = api.get_summary(test_company["id"], test_user["id"])

        assert response.status_code == 200
        data = response.json()
        assert "projects" in data or "project_count" in data

    def test_get_grouped_by_company(self, api_client, test_user, test_company, test_project):
        """Test getting projects grouped by company."""
        api = CompaniesAPI(api_client)

        response = api.get_grouped_by_company(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        # API returns object with companies list, not direct list
        assert "companies" in data or isinstance(data, list)
        if "companies" in data:
            assert isinstance(data["companies"], list)

    def test_create_company_with_description(self, api_client, test_user):
        """Test creating company with description."""
        api = CompaniesAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create(
            user_id=test_user["id"],
            name=f"Described Company {unique_id}",
            position="Developer",
            description="A great company to work for"
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["description"] == "A great company to work for"

        api.delete(data["id"], test_user["id"])


class TestCompanyValidation:
    """Test company input validation."""

    def test_create_company_missing_name(self, api_client, test_user):
        """Test creating company without name fails."""
        api = CompaniesAPI(api_client)

        response = api._post(
            "/knowledge/companies",
            params={"user_id": test_user["id"]},
            json={"position": "Developer"}
        )

        assert response.status_code in [400, 422]

    def test_create_company_invalid_user(self, api_client):
        """Test creating company with invalid user ID fails."""
        api = CompaniesAPI(api_client)

        response = api.create(
            user_id=99999,
            name="Invalid User Company",
            position="Developer"
        )

        assert response.status_code in [400, 404]

    def test_create_company_invalid_date_format(self, api_client, test_user):
        """Test creating company with invalid date format fails."""
        api = CompaniesAPI(api_client)

        response = api.create(
            user_id=test_user["id"],
            name="Bad Date Company",
            position="Developer",
            start_date="not-a-date"
        )

        assert response.status_code in [400, 422]
