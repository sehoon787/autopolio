"""
Credentials API tests (certifications, education, awards, publications, volunteer activities).
Aligned with actual API schemas.
"""

from uuid import uuid4
from modules.credentials import CredentialsAPI


class TestCertificationsCRUD:
    """Test certification CRUD operations."""

    def test_create_certification(self, api_client, test_user):
        """Test creating a new certification."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_certification(
            user_id=test_user["id"],
            name=f"AWS Solutions Architect {unique_id}",
            issuer="Amazon Web Services",
            issue_date="2024-01-15",
            expiry_date="2027-01-15",
            credential_id=f"AWS-{unique_id}",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert "AWS Solutions Architect" in data["name"]

        # Cleanup
        api.delete_certification(data["id"], test_user["id"])

    def test_list_certifications(self, api_client, test_user):
        """Test listing certifications for a user."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        # Create certification first
        create_res = api.create_certification(
            user_id=test_user["id"], name=f"Test Cert {unique_id}", issuer="Test Issuer"
        )
        cert = create_res.json()

        response = api.list_certifications(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        certs = (
            data
            if isinstance(data, list)
            else data.get("certifications", data.get("items", []))
        )
        assert isinstance(certs, list)

        # Cleanup
        api.delete_certification(cert["id"], test_user["id"])

    def test_update_certification(self, api_client, test_user):
        """Test updating a certification."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        # Create first
        create_res = api.create_certification(
            user_id=test_user["id"],
            name=f"Original Cert {unique_id}",
            issuer="Original Issuer",
        )
        cert = create_res.json()

        # Update
        response = api.update_certification(
            cert["id"],
            test_user["id"],
            name=f"Updated Cert {unique_id}",
            issuer="Updated Issuer",
        )

        assert response.status_code == 200
        data = response.json()
        assert "Updated" in data["name"]

        # Cleanup
        api.delete_certification(cert["id"], test_user["id"])

    def test_delete_certification(self, api_client, test_user):
        """Test deleting a certification."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_certification(
            user_id=test_user["id"], name="To Delete", issuer="Test"
        )
        cert = create_res.json()

        # Delete
        response = api.delete_certification(cert["id"], test_user["id"])
        assert response.status_code in [200, 204]


class TestEducationCRUD:
    """Test education CRUD operations."""

    def test_create_education(self, api_client, test_user):
        """Test creating a new education record."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_education(
            user_id=test_user["id"],
            school_name=f"Test University {unique_id}",
            degree="Bachelor of Science",
            major="Computer Science",
            start_date="2016-03-01",
            end_date="2020-02-28",
            gpa="3.8",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert "Test University" in data["school_name"]

        # Cleanup
        api.delete_education(data["id"], test_user["id"])

    def test_list_education(self, api_client, test_user):
        """Test listing education records for a user."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        # Create first
        create_res = api.create_education(
            user_id=test_user["id"],
            school_name=f"Test School {unique_id}",
            degree="Master",
        )
        edu = create_res.json()

        response = api.list_education(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        items = (
            data
            if isinstance(data, list)
            else data.get("educations", data.get("items", []))
        )
        assert isinstance(items, list)

        # Cleanup
        api.delete_education(edu["id"], test_user["id"])

    def test_update_education(self, api_client, test_user):
        """Test updating an education record."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_education(
            user_id=test_user["id"], school_name="Original School", degree="Bachelor"
        )
        edu = create_res.json()

        # Update
        response = api.update_education(
            edu["id"], test_user["id"], school_name="Updated School", degree="Master"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["school_name"] == "Updated School"

        # Cleanup
        api.delete_education(edu["id"], test_user["id"])

    def test_delete_education(self, api_client, test_user):
        """Test deleting an education record."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_education(
            user_id=test_user["id"], school_name="To Delete School", degree="Bachelor"
        )
        edu = create_res.json()

        # Delete
        response = api.delete_education(edu["id"], test_user["id"])
        assert response.status_code in [200, 204]


class TestTrainingsCRUD:
    """Test trainings CRUD operations (bootcamp, course, certificate, workshop)."""

    def test_create_bootcamp(self, api_client, test_user):
        """Test creating a bootcamp training record."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_education(
            user_id=test_user["id"],
            school_name=f"FastCampus {unique_id}",
            degree="bootcamp",
            major="Python Backend Development",
            start_date="2023-03-01",
            end_date="2023-06-30",
            description="Backend development bootcamp",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["degree"] == "bootcamp"

        # Cleanup
        api.delete_education(data["id"], test_user["id"])

    def test_create_course(self, api_client, test_user):
        """Test creating a course training record."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_education(
            user_id=test_user["id"],
            school_name="Coursera",
            degree="course",
            major=f"Machine Learning {unique_id}",
            start_date="2023-07-01",
            end_date="2023-09-30",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["degree"] == "course"

        # Cleanup
        api.delete_education(data["id"], test_user["id"])

    def test_create_certificate(self, api_client, test_user):
        """Test creating a certificate training record."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_education(
            user_id=test_user["id"],
            school_name=f"Samsung Multicampus {unique_id}",
            degree="certificate",
            major="Cloud Architecture",
            start_date="2024-01-15",
            end_date="2024-01-19",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["degree"] == "certificate"

        # Cleanup
        api.delete_education(data["id"], test_user["id"])

    def test_create_workshop(self, api_client, test_user):
        """Test creating a workshop training record."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_education(
            user_id=test_user["id"],
            school_name="Google Developer",
            degree="workshop",
            major=f"Flutter Workshop {unique_id}",
            start_date="2024-03-20",
            end_date="2024-03-22",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["degree"] == "workshop"

        # Cleanup
        api.delete_education(data["id"], test_user["id"])

    def test_list_trainings_by_type(self, api_client, test_user):
        """Test listing and filtering trainings by degree type."""
        api = CredentialsAPI(api_client)

        # Create bootcamp and course
        bootcamp = api.create_education(
            user_id=test_user["id"], school_name="Test Bootcamp", degree="bootcamp"
        ).json()

        course = api.create_education(
            user_id=test_user["id"], school_name="Test Course", degree="course"
        ).json()

        # List all education
        response = api.list_education(test_user["id"])
        assert response.status_code == 200
        data = response.json()
        items = (
            data
            if isinstance(data, list)
            else data.get("educations", data.get("items", []))
        )

        # Filter trainings (bootcamp, course, certificate, workshop, other)
        training_types = ["bootcamp", "course", "certificate", "workshop", "other"]
        trainings = [e for e in items if e.get("degree") in training_types]
        assert len(trainings) >= 2

        # Cleanup
        api.delete_education(bootcamp["id"], test_user["id"])
        api.delete_education(course["id"], test_user["id"])


class TestAwardsCRUD:
    """Test awards CRUD operations."""

    def test_create_award(self, api_client, test_user):
        """Test creating a new award."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_award(
            user_id=test_user["id"],
            name=f"Best Developer Award {unique_id}",
            issuer="Tech Conference",
            award_date="2024-06-15",
            description="Awarded for outstanding contributions",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert "Best Developer Award" in data["name"]

        # Cleanup
        api.delete_award(data["id"], test_user["id"])

    def test_list_awards(self, api_client, test_user):
        """Test listing awards for a user."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_award(
            user_id=test_user["id"], name="Test Award", issuer="Test Org"
        )
        award = create_res.json()

        response = api.list_awards(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        items = (
            data
            if isinstance(data, list)
            else data.get("awards", data.get("items", []))
        )
        assert isinstance(items, list)

        # Cleanup
        api.delete_award(award["id"], test_user["id"])

    def test_update_award(self, api_client, test_user):
        """Test updating an award."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_award(
            user_id=test_user["id"], name="Original Award", issuer="Original Org"
        )
        award = create_res.json()

        # Update
        response = api.update_award(
            award["id"], test_user["id"], name="Updated Award", issuer="Updated Org"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Award"

        # Cleanup
        api.delete_award(award["id"], test_user["id"])

    def test_delete_award(self, api_client, test_user):
        """Test deleting an award."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_award(
            user_id=test_user["id"], name="To Delete Award", issuer="Test"
        )
        award = create_res.json()

        # Delete
        response = api.delete_award(award["id"], test_user["id"])
        assert response.status_code in [200, 204]


class TestPublicationsCRUD:
    """Test publications/patents CRUD operations."""

    def test_create_publication(self, api_client, test_user):
        """Test creating a new publication."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_publication(
            user_id=test_user["id"],
            title=f"Research Paper {unique_id}",
            publication_type="journal",
            publisher="IEEE",
            publication_date="2024-03-01",
            url="https://example.com/paper",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert "Research Paper" in data["title"]

        # Cleanup
        api.delete_publication(data["id"], test_user["id"])

    def test_create_patent(self, api_client, test_user):
        """Test creating a patent record."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_publication(
            user_id=test_user["id"],
            title=f"Innovative System Patent {unique_id}",
            publication_type="patent",
            publication_date="2024-01-01",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["publication_type"] == "patent"

        # Cleanup
        api.delete_publication(data["id"], test_user["id"])

    def test_list_publications(self, api_client, test_user):
        """Test listing publications for a user."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_publication(
            user_id=test_user["id"],
            title="Test Publication",
            publication_type="journal",
        )
        pub = create_res.json()

        response = api.list_publications(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        items = (
            data
            if isinstance(data, list)
            else data.get("publications", data.get("items", []))
        )
        assert isinstance(items, list)

        # Cleanup
        api.delete_publication(pub["id"], test_user["id"])

    def test_update_publication(self, api_client, test_user):
        """Test updating a publication."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_publication(
            user_id=test_user["id"], title="Original Paper", publication_type="journal"
        )
        pub = create_res.json()

        # Update
        response = api.update_publication(
            pub["id"],
            test_user["id"],
            title="Updated Paper",
            publisher="Updated Publisher",
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Paper"

        # Cleanup
        api.delete_publication(pub["id"], test_user["id"])

    def test_delete_publication(self, api_client, test_user):
        """Test deleting a publication."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_publication(
            user_id=test_user["id"], title="To Delete Paper", publication_type="journal"
        )
        pub = create_res.json()

        # Delete
        response = api.delete_publication(pub["id"], test_user["id"])
        assert response.status_code in [200, 204]


class TestVolunteerActivitiesCRUD:
    """Test volunteer activities CRUD operations."""

    def test_create_activity(self, api_client, test_user):
        """Test creating a new volunteer activity."""
        api = CredentialsAPI(api_client)
        unique_id = uuid4().hex[:8]

        response = api.create_activity(
            user_id=test_user["id"],
            name=f"Open Source Contribution {unique_id}",
            activity_type="volunteer",
            organization="Apache Foundation",
            start_date="2023-01-01",
            description="Contributing to open source projects",
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert "Open Source" in data["name"]

        # Cleanup
        api.delete_activity(data["id"], test_user["id"])

    def test_list_activities(self, api_client, test_user):
        """Test listing volunteer activities for a user."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_activity(
            user_id=test_user["id"], name="Test Activity", activity_type="volunteer"
        )
        activity = create_res.json()

        response = api.list_activities(test_user["id"])

        assert response.status_code == 200
        data = response.json()
        items = (
            data
            if isinstance(data, list)
            else data.get("volunteer_activities", data.get("items", []))
        )
        assert isinstance(items, list)

        # Cleanup
        api.delete_activity(activity["id"], test_user["id"])

    def test_update_activity(self, api_client, test_user):
        """Test updating a volunteer activity."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_activity(
            user_id=test_user["id"], name="Original Activity", activity_type="volunteer"
        )
        activity = create_res.json()

        # Update
        response = api.update_activity(
            activity["id"],
            test_user["id"],
            name="Updated Activity",
            description="Updated description",
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Activity"

        # Cleanup
        api.delete_activity(activity["id"], test_user["id"])

    def test_delete_activity(self, api_client, test_user):
        """Test deleting a volunteer activity."""
        api = CredentialsAPI(api_client)

        # Create first
        create_res = api.create_activity(
            user_id=test_user["id"],
            name="To Delete Activity",
            activity_type="volunteer",
        )
        activity = create_res.json()

        # Delete
        response = api.delete_activity(activity["id"], test_user["id"])
        assert response.status_code in [200, 204]


class TestCredentialsValidation:
    """Test credentials input validation."""

    def test_create_certification_invalid_user(self, api_client):
        """Test creating certification with invalid user fails."""
        api = CredentialsAPI(api_client)

        response = api.create_certification(
            user_id=99999, name="Invalid User Cert", issuer="Test"
        )

        assert response.status_code in [400, 404, 422]

    def test_create_education_empty_name(self, api_client, test_user):
        """Test creating education with empty school name fails."""
        api = CredentialsAPI(api_client)

        response = api._post(
            "/knowledge/credentials/educations",
            params={"user_id": test_user["id"]},
            json={"degree": "Bachelor"},  # Missing school_name
        )

        assert response.status_code in [400, 422]
