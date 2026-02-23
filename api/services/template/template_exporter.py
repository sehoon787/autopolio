"""
Template Exporter - Export templates to HTML, Markdown, DOCX formats

Supports platform-specific export formats:
- Saramin (사람인): Template 2 (경력) + Template 3 (경력기술서)
- Remember (리멤버): Template 4 (회사+프로젝트 통합)
- Wanted (원티드): Template 3 (프로젝트 상세만)
- Jumpit (점핏): Template 3 (프로젝트 상세만)
"""

import os
import re
from typing import Tuple, Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path

from api.schemas.platform import RenderDataRequest
from api.config import get_settings
from api.services.docx.docx_styles import (
    DocxStyler,
    DocxStyleConfig,
    DEFAULT_DOCX_STYLE,
)

# Import extracted modules
from api.services.core.mustache_helpers import render_or_clean_mustache
from api.services.export.export_helpers import (
    get_key_tasks_list,
    get_achievements_list,
    group_projects_by_company,
    categorize_skills_by_domain_detailed,
)
from api.services.core.markdown_generator import MarkdownGenerator
from .template_exporter_docx import (
    create_docx_from_render_data,
    create_unified_docx,
)

settings = get_settings()


class TemplateExporter:
    """Handles exporting templates to various formats"""

    def __init__(
        self, result_dir: Path = None, style_config: Optional[DocxStyleConfig] = None
    ):
        self.result_dir = result_dir or Path(settings.result_dir)
        self.styler = DocxStyler(style_config or DEFAULT_DOCX_STYLE)
        self._markdown_generator = MarkdownGenerator()

    def generate_filename(self, platform_key: str, name: str, ext: str) -> str:
        """Generate a safe filename with timestamp"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = (
            re.sub(r"[^\w\s-]", "", name or "resume").strip().replace(" ", "_")[:20]
        )
        return f"{platform_key}_{safe_name}_{timestamp}.{ext}"

    def save_file(self, filename: str, content: str) -> str:
        """Save content to file and return path"""
        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return str(file_path)

    def export_html(
        self, html_content: str, platform_key: str, name: str
    ) -> Tuple[str, str]:
        """Export to HTML file"""
        filename = self.generate_filename(platform_key, name, "html")
        file_path = self.save_file(filename, html_content)
        return file_path, html_content

    def export_markdown(
        self, data: RenderDataRequest, platform_key: str, template_name: str
    ) -> Tuple[str, str]:
        """Export to Markdown file"""
        md_content = self.generate_markdown(data, template_name)
        filename = self.generate_filename(platform_key, data.name, "md")
        file_path = self.save_file(filename, md_content)
        return file_path, md_content

    def export_docx(self, data: RenderDataRequest, platform_key: str) -> str:
        """Export to Word document with proper styling

        Uses DocxStyler for consistent formatting:
        - Title (대제목): 24pt, bold, black
        - Heading1 (중제목): 18pt, bold, black
        - Heading2 (소제목): 14pt, bold, black
        - Normal text: 11pt, black
        """
        filename = self.generate_filename(platform_key, data.name, "docx")
        return create_docx_from_render_data(
            data=data, styler=self.styler, result_dir=self.result_dir, filename=filename
        )

    def generate_markdown(
        self, data: RenderDataRequest, template_name: str, platform_key: str = None
    ) -> str:
        """Generate Markdown from RenderDataRequest user data

        Args:
            data: RenderDataRequest Pydantic model
            template_name: Template name for footer
            platform_key: Platform key for format selection

        Note: For platform-specific formatting with dict data, use generate_markdown_from_dict
        """
        # Convert RenderDataRequest to dict for platform-specific generation
        data_dict = self._render_data_to_dict(data)
        return self.generate_markdown_from_dict(data_dict, template_name, platform_key)

    def _render_data_to_dict(self, data: RenderDataRequest) -> Dict[str, Any]:
        """Convert RenderDataRequest Pydantic model to dict for processing"""
        result = {
            "name": data.name,
            "email": data.email,
            "phone": data.phone,
            "photo_url": data.photo_url,
            "desired_position": data.desired_position,
            "summary": data.summary,
            "introduction": data.summary,  # Alias
            "github_url": data.github_url,
            "portfolio_url": data.portfolio_url,
        }

        # Convert experiences
        if data.experiences:
            result["experiences"] = [
                {
                    "company_name": exp.company_name,
                    "position": exp.position,
                    "start_date": exp.start_date,
                    "end_date": exp.end_date,
                    "description": exp.description,
                    "achievements": exp.achievements,
                }
                for exp in data.experiences
            ]
        else:
            result["experiences"] = []

        # Convert projects
        if data.projects:
            result["projects"] = [
                {
                    "name": proj.name,
                    "company_name": proj.company_name,
                    "company": proj.company_name,  # Alias
                    "start_date": proj.start_date,
                    "end_date": proj.end_date,
                    "description": proj.description,
                    "role": proj.role,
                    "technologies": proj.technologies,
                    "technologies_list": proj.technologies,
                    "achievements": proj.achievements,
                    # Extended fields for platform-specific exports
                    "key_tasks_list": proj.key_tasks_list or [],
                    "team_size": proj.team_size,
                    "implementation_details": proj.implementation_details or [],
                    "achievements_summary_list": proj.achievements_summary_list
                    or [],  # [{category, title}]
                    "achievements_detailed_list": proj.achievements_detailed_list
                    or [],  # [{category, title, description}]
                }
                for proj in data.projects
            ]
        else:
            result["projects"] = []

        # Convert skills
        if data.skills:
            result["skills_categorized"] = {
                "languages": data.skills.languages or [],
                "frameworks": data.skills.frameworks or [],
                "databases": data.skills.databases or [],
                "tools": data.skills.tools or [],
            }
            # Flatten skills list
            result["skills"] = (
                (data.skills.languages or [])
                + (data.skills.frameworks or [])
                + (data.skills.databases or [])
                + (data.skills.tools or [])
            )
        else:
            result["skills_categorized"] = {}
            result["skills"] = []

        # Convert education
        if data.educations:
            result["education"] = [
                {
                    "school_name": edu.school_name,
                    "major": edu.major,
                    "degree": edu.degree,
                    "start_date": edu.start_date,
                    "end_date": edu.end_date,
                    "description": edu.description,
                }
                for edu in data.educations
            ]
        else:
            result["education"] = []

        # Convert certifications
        if data.certifications:
            result["certifications"] = [
                {
                    "name": cert.name,
                    "issuer": cert.issuer,
                    "date": cert.date,
                }
                for cert in data.certifications
            ]
        else:
            result["certifications"] = []

        return result

    def export_markdown_from_dict(
        self, data: dict, platform_key: str, template_name: str
    ) -> Tuple[str, str]:
        """Export to Markdown file from dict data with platform-specific format"""
        md_content = self.generate_markdown_from_dict(data, template_name, platform_key)
        filename = self.generate_filename(platform_key, data.get("name", "user"), "md")
        file_path = self.save_file(filename, md_content)
        return file_path, md_content

    def export_docx_from_dict(self, data: dict, platform_key: str) -> str:
        """Export to Word document from dict data with unified format

        All platforms use the same Word format:
        - 경력: Company-based with domain-categorized skills
        - 경력기술서: Detailed project information
        """
        filename = self.generate_filename(
            platform_key, data.get("name", "user"), "docx"
        )
        return create_unified_docx(
            data=data, styler=self.styler, result_dir=self.result_dir, filename=filename
        )

    def generate_markdown_from_dict(
        self, data: dict, template_name: str, platform_key: str = None
    ) -> str:
        """Generate unified Markdown from dict data

        Delegates to MarkdownGenerator for actual generation.

        Args:
            data: User data dictionary
            template_name: Template name for footer
            platform_key: Platform key (not used for format selection, only for footer)

        Returns:
            Markdown string with unified format
        """
        return self._markdown_generator.generate_markdown_from_dict(
            data, template_name, platform_key
        )

    # Backward compatibility aliases - delegate to helper functions
    def _render_or_clean_mustache(self, text: str, context: dict = None) -> str:
        """Backward compatibility wrapper for render_or_clean_mustache"""
        return render_or_clean_mustache(text, context)

    def _get_key_tasks_list(self, proj: dict) -> List[str]:
        """Backward compatibility wrapper for get_key_tasks_list"""
        return get_key_tasks_list(proj)

    def _get_achievements_list(
        self, proj: dict, use_detailed: bool = False
    ) -> List[str]:
        """Backward compatibility wrapper for get_achievements_list"""
        return get_achievements_list(proj, use_detailed)

    def _group_projects_by_company(
        self, projects: List[Dict[str, Any]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Backward compatibility wrapper for group_projects_by_company"""
        return group_projects_by_company(projects)

    def _categorize_skills_by_domain_detailed(
        self, projects: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """Backward compatibility wrapper for categorize_skills_by_domain_detailed"""
        return categorize_skills_by_domain_detailed(projects)
