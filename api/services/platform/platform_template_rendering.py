"""
Platform Template Rendering

Handles rendering templates with user data or sample data.
"""

from typing import Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from api.models.platform_template import PlatformTemplate
from api.schemas.platform import (
    RenderDataRequest,
    ExperienceData,
    ProjectData,
    SkillsData,
)
from .platform_logos import get_platform_logo_svg, get_platform_logo, get_platform_color
from api.services.template import TemplateRenderer
from api.services.template import TemplateExporter
from api.services.user_data import UserDataCollector
from .platform_sample_data import get_sample_data
from .platform_template_crud import PlatformTemplateCRUD


class PlatformTemplateRendering:
    """Handles template rendering operations"""

    def __init__(
        self,
        db: AsyncSession,
        crud: PlatformTemplateCRUD,
        renderer: TemplateRenderer,
        exporter: TemplateExporter,
        data_collector: UserDataCollector
    ):
        self.db = db
        self.crud = crud
        self.renderer = renderer
        self.exporter = exporter
        self.data_collector = data_collector

    async def render_with_user_data(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> str:
        """
        Render a template with user-provided data

        Args:
            template_id: Platform template ID
            data: User data to render

        Returns:
            Rendered HTML string
        """
        template = await self.crud.get_by_id(template_id)
        if not template or not template.html_content:
            raise ValueError(f"Template {template_id} not found or has no content")

        # Convert Pydantic model to dict
        render_data = data.model_dump()

        return self.renderer.render(template.html_content, render_data)

    async def render_with_sample_data(
        self,
        template_id: int
    ) -> str:
        """
        Render a template with sample data for preview without connected projects

        Args:
            template_id: Platform template ID

        Returns:
            Rendered HTML string with sample data
        """
        template = await self.crud.get_by_id(template_id)
        if not template or not template.html_content:
            raise ValueError(f"Template {template_id} not found or has no content")

        # Sample data for preview
        sample_data = get_sample_data(template.platform_key)

        # Add platform logo (Wanted uses smaller padding for larger logo)
        logo_padding = 3 if template.platform_key == "wanted" else 8
        sample_data["platform_logo"] = get_platform_logo(template.platform_key)
        sample_data["platform_logo_svg"] = get_platform_logo_svg(template.platform_key, 40, logo_padding)
        sample_data["platform_color"] = get_platform_color(template.platform_key)
        sample_data["platform_name"] = template.name

        return self.renderer.render(template.html_content, sample_data)

    async def render_from_db(
        self,
        template_id: int,
        user_id: int
    ) -> str:
        """
        Render a template with data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Rendered HTML string

        Raises:
            ValueError: If template not found, user not found, or no data available
        """
        template = await self.crud.get_by_id(template_id)
        if not template or not template.html_content:
            raise ValueError(f"Template {template_id} not found or has no content")

        # Fetch user data from database using data collector
        try:
            render_data = await self.data_collector.collect(user_id)
        except ValueError as e:
            # Re-raise with more context
            raise ValueError(f"Failed to collect user data: {str(e)}")

        # Check if user has any meaningful data
        has_companies = len(render_data.get("experiences", [])) > 0
        has_projects = len(render_data.get("projects", [])) > 0

        if not has_companies and not has_projects:
            raise ValueError("No companies or projects found. Please add your career information first.")

        # Add platform logo (Wanted uses smaller padding for larger logo)
        logo_padding = 3 if template.platform_key == "wanted" else 8
        render_data["platform_logo"] = get_platform_logo(template.platform_key)
        render_data["platform_logo_svg"] = get_platform_logo_svg(template.platform_key, 40, logo_padding)
        render_data["platform_color"] = get_platform_color(template.platform_key)
        render_data["platform_name"] = template.name

        return self.renderer.render(template.html_content, render_data)

    async def render_markdown_from_db(
        self,
        template_id: int,
        user_id: int
    ) -> str:
        """
        Render a template as Markdown with data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Rendered Markdown string
        """
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        # Fetch user data from database
        render_data = await self.data_collector.collect(user_id)

        # Build experiences
        experiences = []
        for exp in render_data.get("experiences", []):
            # achievements can be a list or string, ensure it's a list
            exp_achievements = exp.get("achievements_list") or exp.get("achievements")
            if isinstance(exp_achievements, str):
                exp_achievements = [a.strip() for a in exp_achievements.split("\n") if a.strip()]

            experiences.append(ExperienceData(
                company_name=exp.get("company_name", ""),
                position=exp.get("position"),
                start_date=exp.get("start_date"),
                end_date=exp.get("end_date"),
                description=exp.get("description"),
                achievements=exp_achievements if exp_achievements else None,
            ))

        # Build projects
        projects = self._build_projects_from_data(render_data.get("projects", []))

        # Build skills
        skills_data = render_data.get("skills_categorized", {})
        skills = SkillsData(
            languages=skills_data.get("languages", []),
            frameworks=skills_data.get("frameworks", []),
            databases=skills_data.get("databases", []),
            tools=skills_data.get("tools", []),
        ) if skills_data else None

        data = RenderDataRequest(
            name=render_data.get("name", ""),
            email=render_data.get("email"),
            phone=render_data.get("phone"),
            photo_url=render_data.get("photo_url"),
            desired_position=render_data.get("desired_position"),
            summary=render_data.get("summary"),
            github_url=render_data.get("github_url"),
            portfolio_url=render_data.get("portfolio_url"),
            experiences=experiences if experiences else None,
            projects=projects if projects else None,
            skills=skills,
            educations=None,
            certifications=None,
        )

        # Pass platform_key for platform-specific formatting
        return self.exporter.generate_markdown(data, template.name, template.platform_key)

    async def render_markdown_with_sample_data(
        self,
        template_id: int
    ) -> str:
        """
        Render a template as Markdown with sample data for preview

        Args:
            template_id: Platform template ID

        Returns:
            Rendered Markdown string with sample data
        """
        template = await self.crud.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        # Use the same sample data as HTML preview
        sample_data = get_sample_data(template.platform_key)

        # Build experiences from sample data
        experiences = []
        for exp in sample_data.get("experiences", []):
            experiences.append(ExperienceData(
                company_name=exp.get("company_name", exp.get("company", "")),
                position=exp.get("position"),
                start_date=exp.get("start_date"),
                end_date=exp.get("end_date") if not exp.get("is_current") else None,
                description=exp.get("description"),
                achievements=exp.get("achievements"),
            ))

        # Build projects from sample data
        projects = []
        for proj in sample_data.get("projects", []):
            # Handle technologies_list or technologies (list in sample data)
            tech_list = proj.get("technologies_list") or proj.get("technologies")
            if isinstance(tech_list, bool):
                tech_list = None  # Sample data has technologies: True as flag

            # Handle achievements (can be string in sample data)
            ach = proj.get("achievements")
            ach_list = None
            if isinstance(ach, str):
                ach_list = [a.strip().lstrip("• ") for a in ach.split("\n") if a.strip()]
            elif isinstance(ach, list):
                ach_list = ach

            projects.append(ProjectData(
                name=proj.get("name", ""),
                company_name=proj.get("company"),
                start_date=proj.get("start_date"),
                end_date=proj.get("end_date"),
                description=proj.get("description"),
                role=proj.get("role"),
                technologies=tech_list if tech_list else None,
                achievements=ach_list if ach_list else None,
            ))

        # Build skills from sample data
        skills_cat = sample_data.get("skills_categorized", {})
        skills = SkillsData(
            languages=skills_cat.get("languages", []),
            frameworks=skills_cat.get("frameworks", []),
            databases=skills_cat.get("databases", []),
            tools=skills_cat.get("tools", []),
        ) if skills_cat else None

        data = RenderDataRequest(
            name=sample_data.get("name", "홍길동"),
            email=sample_data.get("email"),
            phone=sample_data.get("phone"),
            photo_url=sample_data.get("photo_url"),
            desired_position=sample_data.get("desired_position"),
            summary=sample_data.get("summary"),
            github_url=sample_data.get("github_url"),
            portfolio_url=sample_data.get("portfolio_url"),
            experiences=experiences if experiences else None,
            projects=projects if projects else None,
            skills=skills,
            educations=None,
            certifications=None,
        )

        # Pass platform_key for platform-specific formatting
        return self.exporter.generate_markdown(data, template.name, template.platform_key)

    def _build_projects_from_data(self, projects_data: list) -> list:
        """Build ProjectData list from raw project data"""
        projects = []
        for proj in projects_data:
            # Use list versions or convert strings to lists
            tech_list = proj.get("technologies_list") or proj.get("technologies")
            if isinstance(tech_list, str):
                tech_list = [t.strip() for t in tech_list.split(",") if t.strip()]

            # Get achievements - prefer string version, convert list of dicts if needed
            ach_list = proj.get("achievements")  # String version
            if isinstance(ach_list, str):
                # Strip bullet prefixes (• or -) since markdown will add its own
                ach_list = [a.strip().lstrip("•").lstrip("-").strip() for a in ach_list.split("\n") if a.strip()]
            elif not ach_list:
                # Fall back to achievements_list (list of dicts)
                ach_list_raw = proj.get("achievements_list")
                if isinstance(ach_list_raw, list):
                    ach_list = []
                    for ach in ach_list_raw:
                        if isinstance(ach, dict):
                            # Convert dict to string
                            metric = ach.get("metric_name", ach.get("title", ""))
                            value = ach.get("metric_value", ach.get("description", ""))
                            if metric and value:
                                ach_list.append(f"{metric}: {value}")
                            elif metric:
                                ach_list.append(metric)
                        elif isinstance(ach, str):
                            ach_list.append(ach)

            key_tasks = proj.get("key_tasks_list", [])
            projects.append(ProjectData(
                name=proj.get("name", ""),
                company_name=proj.get("company_name"),
                start_date=proj.get("start_date"),
                end_date=proj.get("end_date"),
                description=proj.get("description"),
                role=proj.get("role"),
                technologies=tech_list if tech_list else None,
                achievements=ach_list if ach_list else None,
                # Extended fields for platform-specific exports
                key_tasks_list=key_tasks if key_tasks else None,
                has_key_tasks=len(key_tasks) > 0 if key_tasks else False,
                team_size=proj.get("team_size"),
                implementation_details=proj.get("implementation_details"),
                has_achievements=bool(ach_list),
            ))
        return projects
