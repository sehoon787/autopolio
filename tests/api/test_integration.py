"""
Integration tests for complete workflows.
"""

import pytest
from uuid import uuid4
from modules.users import UsersAPI
from modules.companies import CompaniesAPI
from modules.projects import ProjectsAPI
from modules.credentials import CredentialsAPI
from modules.templates import TemplatesAPI
from modules.platforms import PlatformsAPI, _get_template_list
from modules.documents import DocumentsAPI


class TestCompleteWorkflow:
    """Test complete user workflow from setup to document generation."""

    def test_full_portfolio_workflow(self, api_client):
        """Test complete workflow: create user -> company -> project -> export."""
        unique_id = uuid4().hex[:8]

        # 1. Create user
        users_api = UsersAPI(api_client)
        user_response = users_api.create(
            name=f"Integration Test User {unique_id}",
            email=f"integration_{unique_id}@example.com"
        )
        assert user_response.status_code in [200, 201]
        user = user_response.json()
        user_id = user["id"]

        try:
            # 2. Create company
            companies_api = CompaniesAPI(api_client)
            company_response = companies_api.create(
                user_id=user_id,
                name=f"Integration Test Company {unique_id}",
                position="Software Engineer",
                department="Engineering",
                start_date="2020-01-01",
                end_date="2024-12-31"
            )
            assert company_response.status_code in [200, 201]
            company = company_response.json()

            # 3. Create projects
            projects_api = ProjectsAPI(api_client)

            # Company project
            project1_response = projects_api.create(
                user_id=user_id,
                company_id=company["id"],
                name=f"Company Project {unique_id}",
                description="A major project at the company",
                role="Lead Developer",
                team_size=5,
                project_type="company",
                start_date="2022-01-01",
                end_date="2023-12-31",
                technologies=["Python", "FastAPI", "React", "PostgreSQL"]
            )
            assert project1_response.status_code in [200, 201]
            project1 = project1_response.json()

            # Personal project
            project2_response = projects_api.create(
                user_id=user_id,
                name=f"Personal Project {unique_id}",
                description="A side project",
                role="Solo Developer",
                project_type="personal",
                start_date="2023-06-01",
                technologies=["TypeScript", "Node.js"]
            )
            assert project2_response.status_code in [200, 201]

            # 4. Add achievements
            achievement_response = projects_api.add_achievement(
                project_id=project1["id"],
                user_id=user_id,
                metric_name="Performance Improvement",
                metric_value="50%",
                description="Improved API response time by 50%"
            )
            assert achievement_response.status_code in [200, 201]

            # 5. Add credentials
            creds_api = CredentialsAPI(api_client)

            # Education
            edu_response = creds_api.create_education(
                user_id=user_id,
                school_name="Test University",
                degree="Bachelor of Science",
                major="Computer Science",
                start_date="2016-03-01",
                end_date="2020-02-28"
            )
            assert edu_response.status_code in [200, 201]

            # Certification
            cert_response = creds_api.create_certification(
                user_id=user_id,
                name="AWS Solutions Architect",
                issuer="Amazon Web Services",
                issue_date="2023-06-15"
            )
            assert cert_response.status_code in [200, 201]

            # 6. Generate reports
            docs_api = DocumentsAPI(api_client)

            # Projects report
            projects_report = docs_api.generate_projects_report(user_id)
            assert projects_report.status_code == 200

            # Performance report
            perf_report = docs_api.generate_performance_report(user_id)
            assert perf_report.status_code == 200

            # 7. Export to markdown (uses query params)
            export_response = docs_api.export_markdown(
                user_id=user_id,
                report_type="summary"
            )
            assert export_response.status_code == 200

            # 8. Platform template preview
            platforms_api = PlatformsAPI(api_client)
            templates = _get_template_list(platforms_api)
            if len(templates) > 0:
                preview_response = platforms_api.preview(
                    platform_id=templates[0]["id"],
                    use_sample=True
                )
                assert preview_response.status_code == 200

        finally:
            # Cleanup
            users_api.delete(user_id)

    def test_template_workflow(self, api_client, test_user, test_project):
        """Test template creation and usage workflow."""
        unique_id = uuid4().hex[:8]

        templates_api = TemplatesAPI(api_client)

        # 1. Create custom template
        template_response = templates_api.create(
            user_id=test_user["id"],
            name=f"Custom Template {unique_id}",
            platform="custom",
            template_content="""# {{name}}

## Projects

{{#projects}}
### {{name}}
{{description}}

**Technologies:** {{#technologies}}{{.}}, {{/technologies}}
{{/projects}}
"""
        )
        assert template_response.status_code in [200, 201]
        template = template_response.json()

        try:
            # 2. Preview template
            preview_response = templates_api.preview(
                template_content=template["template_content"],
                user_id=test_user["id"],
                project_ids=[test_project["id"]]
            )
            assert preview_response.status_code == 200

            # 3. Clone template
            clone_response = templates_api.clone(
                template["id"],
                f"Cloned Template {unique_id}",
                user_id=test_user["id"]
            )
            assert clone_response.status_code in [200, 201]
            cloned = clone_response.json()

            # 4. Update cloned template
            update_response = templates_api.update(
                cloned["id"],
                template_content=template["template_content"] + "\n\n*Updated*"
            )
            assert update_response.status_code == 200

            # Cleanup cloned template
            templates_api.delete(cloned["id"])

        finally:
            # Cleanup original template
            templates_api.delete(template["id"])

    def test_company_timeline_workflow(self, api_client, test_user):
        """Test company timeline and grouping workflow."""
        unique_id = uuid4().hex[:8]

        companies_api = CompaniesAPI(api_client)
        projects_api = ProjectsAPI(api_client)

        created_companies = []
        created_projects = []

        try:
            # 1. Create multiple companies with dates
            for i in range(2):
                company_response = companies_api.create(
                    user_id=test_user["id"],
                    name=f"Timeline Company {i+1} {unique_id}",
                    position=f"Position {i+1}",
                    start_date=f"202{i}-01-01",
                    end_date=f"202{i+1}-12-31" if i < 1 else None
                )
                assert company_response.status_code in [200, 201]
                company = company_response.json()
                created_companies.append(company)

                # Create project for each company
                project_response = projects_api.create(
                    user_id=test_user["id"],
                    company_id=company["id"],
                    name=f"Project at Company {i+1} {unique_id}",
                    project_type="company",
                    start_date=f"202{i}-06-01"
                )
                assert project_response.status_code in [200, 201]
                created_projects.append(project_response.json())

            # 2. Test grouped by company
            grouped_response = companies_api.get_grouped_by_company(test_user["id"])
            assert grouped_response.status_code == 200
            grouped_data = grouped_response.json()
            # API returns CompanyGroupedResponse: {"companies": [...], "total_companies": N, "total_projects": N}
            assert "companies" in grouped_data
            assert isinstance(grouped_data["companies"], list)

            # 3. Test company summary
            for company in created_companies:
                summary_response = companies_api.get_summary(
                    company["id"], user_id=test_user["id"]
                )
                assert summary_response.status_code == 200

        finally:
            # Cleanup
            for project in created_projects:
                projects_api.delete(project["id"], user_id=test_user["id"])
            for company in created_companies:
                companies_api.delete(company["id"], user_id=test_user["id"])


class TestDataIntegrity:
    """Test data integrity across operations."""

    def test_cascade_delete_company(self, api_client, test_user):
        """Test that deleting company handles related projects."""
        unique_id = uuid4().hex[:8]

        companies_api = CompaniesAPI(api_client)
        projects_api = ProjectsAPI(api_client)

        # Create company
        company_response = companies_api.create(
            user_id=test_user["id"],
            name=f"Cascade Test Company {unique_id}",
            position="Developer"
        )
        assert company_response.status_code in [200, 201]
        company = company_response.json()

        # Create project linked to company
        project_response = projects_api.create(
            user_id=test_user["id"],
            company_id=company["id"],
            name=f"Linked Project {unique_id}",
            project_type="company"
        )
        assert project_response.status_code in [200, 201]
        project = project_response.json()

        # Delete company
        delete_response = companies_api.delete(company["id"], user_id=test_user["id"])
        assert delete_response.status_code in [200, 204]

        # Check project status (should either be deleted or have company_id set to null)
        project_check = projects_api.get(project["id"])
        if project_check.status_code == 200:
            # Project exists but company_id should be null
            project_data = project_check.json()
            assert project_data.get("company_id") is None
            # Cleanup project
            projects_api.delete(project["id"], user_id=test_user["id"])

    def test_user_data_isolation(self, api_client):
        """Test that users cannot see each other's data."""
        unique_id = uuid4().hex[:8]

        users_api = UsersAPI(api_client)
        companies_api = CompaniesAPI(api_client)

        # Create two users
        user1 = users_api.create(
            name=f"User 1 {unique_id}",
            email=f"user1_{unique_id}@example.com"
        ).json()

        user2 = users_api.create(
            name=f"User 2 {unique_id}",
            email=f"user2_{unique_id}@example.com"
        ).json()

        try:
            # Create company for user1
            company = companies_api.create(
                user_id=user1["id"],
                name=f"User1 Company {unique_id}",
                position="Developer"
            ).json()

            # List companies for user2 - should not see user1's company
            user2_companies = companies_api.list(user2["id"]).json()
            company_ids = [c["id"] for c in user2_companies]
            assert company["id"] not in company_ids

            # Cleanup
            companies_api.delete(company["id"], user_id=user1["id"])

        finally:
            users_api.delete(user1["id"])
            users_api.delete(user2["id"])
