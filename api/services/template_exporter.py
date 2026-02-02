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
from typing import Tuple, Dict, Any, List
from datetime import datetime
from pathlib import Path

from api.schemas.platform import RenderDataRequest
from api.config import get_settings

settings = get_settings()

# Domain categorization keywords for Template 2 style
DOMAIN_CATEGORIES = {
    "Backend": {
        "keywords": ["python", "fastapi", "django", "flask", "spring", "java", "kotlin", "express", "nodejs", "restful", "api", "jwt", "oauth"],
        "name_ko": "Backend",
    },
    "AI/ML": {
        "keywords": ["tensorflow", "pytorch", "scikit", "langchain", "llm", "gpt", "openai", "ml", "ai", "machine learning", "deep learning", "rag", "nlp"],
        "name_ko": "AI/ML",
    },
    "Frontend": {
        "keywords": ["react", "vue", "angular", "next", "typescript", "javascript", "html", "css", "tailwind", "shadcn"],
        "name_ko": "Frontend",
    },
    "Mobile": {
        "keywords": ["flutter", "dart", "swift", "kotlin", "react native", "android", "ios", "mobile"],
        "name_ko": "Mobile/Cross-Platform",
    },
    "Data": {
        "keywords": ["pandas", "numpy", "matplotlib", "data analysis", "데이터 분석", "excel", "visualization"],
        "name_ko": "데이터 분석",
    },
    "Database": {
        "keywords": ["postgresql", "mysql", "sqlite", "mongodb", "redis", "elasticsearch", "sql", "database", "db"],
        "name_ko": "Database",
    },
    "DevOps": {
        "keywords": ["docker", "kubernetes", "aws", "gcp", "azure", "ci/cd", "github action", "nginx", "linux"],
        "name_ko": "DevOps/인프라",
    },
    "IoT": {
        "keywords": ["iot", "embedded", "ble", "bluetooth", "sensor", "raspberry", "arduino", "임베디드"],
        "name_ko": "IoT/임베디드",
    },
}


class TemplateExporter:
    """Handles exporting templates to various formats"""

    def __init__(self, result_dir: Path = None):
        self.result_dir = result_dir or Path(settings.result_dir)

    def generate_filename(self, platform_key: str, name: str, ext: str) -> str:
        """Generate a safe filename with timestamp"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_name = re.sub(r'[^\w\s-]', '', name or "resume").strip().replace(' ', '_')[:20]
        return f"{platform_key}_{safe_name}_{timestamp}.{ext}"

    def save_file(self, filename: str, content: str) -> str:
        """Save content to file and return path"""
        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return str(file_path)

    def export_html(
        self,
        html_content: str,
        platform_key: str,
        name: str
    ) -> Tuple[str, str]:
        """Export to HTML file"""
        filename = self.generate_filename(platform_key, name, "html")
        file_path = self.save_file(filename, html_content)
        return file_path, html_content

    def export_markdown(
        self,
        data: RenderDataRequest,
        platform_key: str,
        template_name: str
    ) -> Tuple[str, str]:
        """Export to Markdown file"""
        md_content = self.generate_markdown(data, template_name)
        filename = self.generate_filename(platform_key, data.name, "md")
        file_path = self.save_file(filename, md_content)
        return file_path, md_content

    def export_docx(
        self,
        data: RenderDataRequest,
        platform_key: str
    ) -> str:
        """Export to Word document"""
        from docx import Document
        from docx.shared import Pt
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        filename = self.generate_filename(platform_key, data.name, "docx")
        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename

        doc = Document()

        # Set default font
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Malgun Gothic'
        font.size = Pt(11)

        # Header
        title = doc.add_heading(data.name or "이력서", level=0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        if data.desired_position:
            subtitle = doc.add_paragraph()
            subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = subtitle.add_run(data.desired_position)
            run.bold = True
            run.font.size = Pt(14)

        # Contact info
        contact_parts = []
        if data.email:
            contact_parts.append(data.email)
        if data.phone:
            contact_parts.append(data.phone)
        if data.github_url:
            contact_parts.append(data.github_url)

        if contact_parts:
            contact_para = doc.add_paragraph(" | ".join(contact_parts))
            contact_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        doc.add_paragraph()

        # Summary
        if data.summary:
            doc.add_heading("자기소개", level=1)
            doc.add_paragraph(data.summary)

        # Experience
        if data.experiences:
            doc.add_heading("경력사항", level=1)
            for exp in data.experiences:
                p = doc.add_paragraph()
                run = p.add_run(exp.company_name)
                run.bold = True
                period = f" ({exp.start_date or ''} ~ {exp.end_date or '현재'})"
                p.add_run(period)

                if exp.position:
                    doc.add_paragraph(exp.position, style='List Bullet')
                if exp.description:
                    doc.add_paragraph(exp.description)
                if exp.achievements:
                    for ach in exp.achievements:
                        doc.add_paragraph(ach, style='List Bullet')

        # Projects
        if data.projects:
            doc.add_heading("프로젝트", level=1)
            for proj in data.projects:
                p = doc.add_paragraph()
                run = p.add_run(proj.name)
                run.bold = True
                period = f" ({proj.start_date or ''} ~ {proj.end_date or '현재'})"
                p.add_run(period)

                if proj.company_name:
                    doc.add_paragraph(f"소속: {proj.company_name}")
                if proj.description:
                    doc.add_paragraph(proj.description)
                if proj.role:
                    doc.add_paragraph(f"역할: {proj.role}")
                if proj.technologies:
                    doc.add_paragraph(f"기술: {', '.join(proj.technologies)}")
                if proj.achievements:
                    for ach in proj.achievements:
                        doc.add_paragraph(ach, style='List Bullet')

        # Skills
        if data.skills:
            doc.add_heading("기술 스택", level=1)
            skills = data.skills
            if skills.languages:
                doc.add_paragraph(f"Languages: {', '.join(skills.languages)}")
            if skills.frameworks:
                doc.add_paragraph(f"Frameworks: {', '.join(skills.frameworks)}")
            if skills.databases:
                doc.add_paragraph(f"Databases: {', '.join(skills.databases)}")
            if skills.tools:
                doc.add_paragraph(f"Tools: {', '.join(skills.tools)}")

        # Education
        if data.educations:
            doc.add_heading("학력", level=1)
            for edu in data.educations:
                p = doc.add_paragraph()
                run = p.add_run(edu.school_name)
                run.bold = True
                if edu.major:
                    p.add_run(f" - {edu.major}")
                period = f" ({edu.start_date or ''} ~ {edu.end_date or ''})"
                p.add_run(period)

        # Certifications
        if data.certifications:
            doc.add_heading("자격증", level=1)
            for cert in data.certifications:
                doc.add_paragraph(
                    f"{cert.name} ({cert.issuer or ''}) - {cert.date or ''}",
                    style='List Bullet'
                )

        doc.save(file_path)
        return str(file_path)

    def generate_markdown(
        self,
        data: RenderDataRequest,
        template_name: str,
        platform_key: str = None
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
                (data.skills.languages or []) +
                (data.skills.frameworks or []) +
                (data.skills.databases or []) +
                (data.skills.tools or [])
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
        self,
        data: dict,
        platform_key: str,
        template_name: str
    ) -> Tuple[str, str]:
        """Export to Markdown file from dict data with platform-specific format"""
        md_content = self.generate_markdown_from_dict(data, template_name, platform_key)
        filename = self.generate_filename(platform_key, data.get("name", "user"), "md")
        file_path = self.save_file(filename, md_content)
        return file_path, md_content

    def export_docx_from_dict(
        self,
        data: dict,
        platform_key: str
    ) -> str:
        """Export to Word document from dict data with unified format

        All platforms use the same Word format:
        - 경력: Company-based with domain-categorized skills
        - 경력기술서: Detailed project information
        """
        return self._export_unified_docx(data, platform_key)

    def _export_unified_docx(self, data: dict, platform_key: str) -> str:
        """Unified Word format for all platforms

        Structure:
        - 경력: Company-based with domain-categorized skills
        - 경력기술서: Detailed project information
        """
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        filename = self.generate_filename(platform_key, data.get("name", "user"), "docx")
        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename

        doc = Document()
        self._setup_document_styles(doc)

        # Header
        title = doc.add_heading(data.get("name", "이력서"), level=0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Contact info
        self._add_contact_info_docx(doc, data)

        experiences = data.get("experiences", [])
        projects = data.get("projects", [])

        # Calculate total experience
        total_years = data.get("total_experience_years", 0)

        # === Part 1: 경력 ===
        if experiences or projects:
            heading_text = f"경력 (총 {total_years}년)" if total_years else "경력"
            doc.add_heading(heading_text, level=1)

            company_projects = self._group_projects_by_company(projects)

            for exp in experiences:
                company_name = exp.get("company_name", "")
                position = exp.get("position", "")
                start_date = exp.get("start_date", "")
                end_date = exp.get("end_date", "")
                is_current = exp.get("is_current", not end_date)
                duration = exp.get("duration", "")
                description = exp.get("description", "")

                # Company header
                p = doc.add_paragraph()
                run = p.add_run(company_name)
                run.bold = True
                run.font.size = doc.styles['Normal'].font.size

                if position:
                    doc.add_paragraph(position)

                period_str = f"{start_date} ~ {end_date if end_date else ''}"
                if is_current:
                    period_str += " 재직중" if not end_date else ""
                if duration:
                    period_str += f" ({duration})"
                doc.add_paragraph(period_str)

                if description:
                    doc.add_paragraph(f"- 주요 직무: {description}")

                # Domain skills
                company_projs = company_projects.get(company_name, [])
                skills_by_domain = self._categorize_skills_by_domain_detailed(company_projs)

                domain_idx = 1
                for domain_name, domain_data in skills_by_domain.items():
                    if not domain_data.get("technologies") and not domain_data.get("implementations"):
                        continue

                    p = doc.add_paragraph()
                    run = p.add_run(f"{domain_idx}. {domain_name}")
                    run.bold = True

                    if domain_data.get("technologies"):
                        doc.add_paragraph("주요 사용 기술")
                        for tech_line in domain_data["technologies"]:
                            doc.add_paragraph(f"- {tech_line}")

                    if domain_data.get("implementations"):
                        doc.add_paragraph("구현 내용")
                        for impl in domain_data["implementations"]:
                            doc.add_paragraph(f"- {impl}")

                    if domain_data.get("databases"):
                        doc.add_paragraph("DB")
                        for db_line in domain_data["databases"]:
                            doc.add_paragraph(f"- {db_line}")

                    domain_idx += 1

                doc.add_paragraph()

            # Side projects
            side_projects = company_projects.get(None, []) + company_projects.get("", []) + company_projects.get("사이드 프로젝트", [])
            if side_projects:
                p = doc.add_paragraph()
                run = p.add_run("사이드 프로젝트")
                run.bold = True

                skills_by_domain = self._categorize_skills_by_domain_detailed(side_projects)

                domain_idx = 1
                for domain_name, domain_data in skills_by_domain.items():
                    if not domain_data.get("implementations"):
                        continue

                    p = doc.add_paragraph()
                    run = p.add_run(f"{domain_idx}. {domain_name}")
                    run.bold = True

                    for impl in domain_data["implementations"]:
                        doc.add_paragraph(f"- {impl}")

                    domain_idx += 1

        # === Part 2: 경력기술서 ===
        if projects:
            doc.add_heading("경력기술서", level=1)

            for idx, proj in enumerate(projects, 1):
                self._add_project_detail_unified_docx(doc, proj, idx)

        doc.save(file_path)
        return str(file_path)

    def _setup_document_styles(self, doc) -> None:
        """Setup document styles for Word export"""
        from docx.shared import Pt

        style = doc.styles['Normal']
        font = style.font
        font.name = 'Malgun Gothic'
        font.size = Pt(11)

    def _add_contact_info_docx(self, doc, data: dict) -> None:
        """Add contact info to Word document"""
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        contact_parts = []
        if data.get("email"):
            contact_parts.append(data["email"])
        if data.get("phone"):
            contact_parts.append(data["phone"])
        if data.get("github_url"):
            contact_parts.append(data["github_url"])

        if contact_parts:
            contact_para = doc.add_paragraph(" | ".join(contact_parts))
            contact_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        doc.add_paragraph()

    def _add_project_detail_unified_docx(self, doc, proj: dict, idx: int) -> None:
        """Add project in unified format to Word document"""
        # Project header
        p = doc.add_paragraph()
        run = p.add_run(f"[프로젝트 {idx}]")
        run.bold = True

        doc.add_paragraph(f"프로젝트명: {proj.get('name', '')}")

        company = proj.get("company_name") or proj.get("company")
        if company:
            doc.add_paragraph(f"연계/소속회사: {company}")
        else:
            doc.add_paragraph("연계/소속회사: 사이드 프로젝트")

        end_date = proj.get("end_date") or "진행중"
        doc.add_paragraph(f"기간: {proj.get('start_date', '')} ~ {end_date}")

        role = proj.get("role")
        if role:
            doc.add_paragraph(f"주요 업무: {role}")

        # 주요 구현 기능 (최대 8개)
        key_tasks = self._get_key_tasks_list(proj)
        if key_tasks:
            doc.add_paragraph("주요 구현 기능:")
            for task in key_tasks[:8]:
                doc.add_paragraph(f"• {task}")

        # 기술 스택
        tech = proj.get("technologies")
        if tech:
            tech_str = tech if isinstance(tech, str) else ", ".join(tech)
            doc.add_paragraph(f"기술 스택: {tech_str}")

        # 개발 인원
        team_size = proj.get("team_size")
        if team_size:
            doc.add_paragraph(f"개발 인원: {team_size}")

        # 상세 내용 (원문 그대로)
        description = proj.get("description", "")
        if description:
            doc.add_paragraph(f"상세 내용: {description}")

        # 성과 (최대 4개)
        achievements = self._get_achievements_list(proj)
        if achievements:
            doc.add_paragraph("성과:")
            for ach in achievements[:4]:
                doc.add_paragraph(f"• {ach}")

        doc.add_paragraph()

    def generate_markdown_from_dict(
        self,
        data: dict,
        template_name: str,
        platform_key: str = None
    ) -> str:
        """Generate unified Markdown from dict data

        All platforms use the same Markdown/Word format:
        - 경력: Company-based with domain-categorized skills
        - 경력기술서: Detailed project information

        Args:
            data: User data dictionary
            template_name: Template name for footer
            platform_key: Platform key (not used for format selection, only for footer)

        Returns:
            Markdown string with unified format
        """
        # All platforms use the same unified format
        return self._generate_unified_markdown(data, template_name)

    def _generate_unified_markdown(self, data: dict, template_name: str) -> str:
        """Generate unified Markdown format for all platforms

        Structure (based on user's detailed example):
        1. 경력: Company-based with domain-categorized skills
        2. 경력기술서: Detailed project information

        Format follows user's exact specification with:
        - Company header with period, position, job type
        - Domain sections (Backend, AI/ML, Mobile, etc.) with:
          - 주요 사용 기술
          - 구현 내용
          - DB (if applicable)
        - Project details with bullet points
        """
        lines = []

        # === Header ===
        lines.append(f"# {data.get('name', '이력서')}")
        lines.append("")

        # Contact info
        self._append_contact_info(lines, data)

        lines.append("---")
        lines.append("")

        experiences = data.get("experiences", [])
        projects = data.get("projects", [])

        # Calculate total experience
        total_years = data.get("total_experience_years", 0)
        if total_years:
            lines.append(f"## 경력")
            lines.append(f"총 {total_years}년")
            lines.append("")
        elif experiences:
            lines.append("## 경력")
            lines.append("")

        # Group projects by company
        company_projects = self._group_projects_by_company(projects)

        # === Part 1: 경력 (Company-based with domain skills) ===
        if experiences:
            for exp in experiences:
                company_name = exp.get("company_name", "")
                position = exp.get("position", "")
                start_date = exp.get("start_date", "")
                end_date = exp.get("end_date", "")
                is_current = exp.get("is_current", not end_date)
                duration = exp.get("duration", "")
                description = exp.get("description", "")

                # Company header
                lines.append(f"### {company_name}")
                if position:
                    lines.append(f"{position}")
                period_str = f"{start_date} ~ {end_date if end_date else ''}"
                if is_current:
                    period_str += " 재직중" if not end_date else ""
                if duration:
                    period_str += f" ({duration})"
                lines.append(period_str)
                lines.append("")

                # Main duties
                if description:
                    lines.append(f"- 주요 직무: {description}")
                    lines.append("")

                # Categorize skills by domain for this company's projects
                company_projs = company_projects.get(company_name, [])
                skills_by_domain = self._categorize_skills_by_domain_detailed(company_projs)

                domain_idx = 1
                for domain_name, domain_data in skills_by_domain.items():
                    if not domain_data.get("technologies") and not domain_data.get("implementations"):
                        continue

                    lines.append(f"**{domain_idx}. {domain_name}**")

                    # Technologies
                    if domain_data.get("technologies"):
                        lines.append("주요 사용 기술")
                        for tech_line in domain_data["technologies"]:
                            lines.append(f"- {tech_line}")

                    # Implementations
                    if domain_data.get("implementations"):
                        lines.append("")
                        lines.append("구현 내용")
                        for impl in domain_data["implementations"]:
                            lines.append(f"- {impl}")

                    # Databases
                    if domain_data.get("databases"):
                        lines.append("")
                        lines.append("DB")
                        for db_line in domain_data["databases"]:
                            lines.append(f"- {db_line}")

                    lines.append("")
                    domain_idx += 1

                lines.append("")

        # Handle side projects (projects without company in experiences)
        side_projects = company_projects.get(None, []) + company_projects.get("", []) + company_projects.get("사이드 프로젝트", [])
        if side_projects:
            lines.append("### 사이드 프로젝트")
            lines.append("")

            skills_by_domain = self._categorize_skills_by_domain_detailed(side_projects)

            domain_idx = 1
            for domain_name, domain_data in skills_by_domain.items():
                if not domain_data.get("technologies") and not domain_data.get("implementations"):
                    continue

                lines.append(f"**{domain_idx}. {domain_name}**")

                if domain_data.get("implementations"):
                    for impl in domain_data["implementations"]:
                        lines.append(f"- {impl}")

                lines.append("")
                domain_idx += 1

            lines.append("")

        # === Part 2: 경력기술서 (Project Details) ===
        if projects:
            lines.append("---")
            lines.append("")
            lines.append("## 경력기술서")
            lines.append("")

            for idx, proj in enumerate(projects, 1):
                self._append_project_detail_unified(lines, proj, idx)

        # Footer
        self._append_footer(lines, template_name)

        return "\n".join(lines)

    # ==================== Helper Methods ====================

    def _append_contact_info(self, lines: list, data: dict) -> None:
        """Append contact information to lines"""
        contact = []
        if data.get("email"):
            contact.append(data['email'])
        if data.get("phone"):
            contact.append(data['phone'])
        if data.get("github_url"):
            contact.append(data['github_url'])
        if data.get("portfolio_url") and data.get("portfolio_url") != data.get("github_url"):
            contact.append(data['portfolio_url'])

        if contact:
            lines.append(" | ".join(contact))
            lines.append("")

    def _append_footer(self, lines: list, template_name: str) -> None:
        """Append footer to lines"""
        lines.append("---")
        lines.append("")
        lines.append(f"*Generated by Autopolio ({template_name}) | {datetime.now().strftime('%Y-%m-%d')}*")

    def _append_project_detail_unified(self, lines: list, proj: dict, idx: int) -> None:
        """Append project in unified format (based on user's exact example)

        Format:
        [프로젝트 N]
        프로젝트명: ...
        연계/소속회사: ...
        기간: ...
        주요 업무: ...
        주요 구현 기능:
        • ...
        기술 스택: ...
        개발 인원: ...
        상세 내용: ...
        성과:
        • ...
        """
        lines.append(f"[프로젝트 {idx}]")
        lines.append(f"프로젝트명: {proj.get('name', '')}")

        company = proj.get("company_name") or proj.get("company")
        if company:
            lines.append(f"연계/소속회사: {company}")
        else:
            lines.append("연계/소속회사: 사이드 프로젝트")

        end_date = proj.get("end_date") or "진행중"
        lines.append(f"기간: {proj.get('start_date', '')} ~ {end_date}")

        role = proj.get("role")
        if role:
            lines.append(f"주요 업무: {role}")

        # 주요 구현 기능 (최대 8개)
        key_tasks = self._get_key_tasks_list(proj)
        if key_tasks:
            lines.append("주요 구현 기능:")
            for task in key_tasks[:8]:
                lines.append(f"• {task}")

        # 기술 스택
        tech = proj.get("technologies")
        if tech:
            tech_str = tech if isinstance(tech, str) else ", ".join(tech)
            lines.append(f"기술 스택: {tech_str}")

        # 개발 인원
        team_size = proj.get("team_size")
        if team_size:
            lines.append(f"개발 인원: {team_size}")

        # 상세 내용 (원문 그대로)
        description = proj.get("description", "")
        if description:
            lines.append(f"상세 내용: {description}")

        # 성과 (최대 4개)
        achievements = self._get_achievements_list(proj)
        if achievements:
            lines.append("성과:")
            for ach in achievements[:4]:
                lines.append(f"• {ach}")

        lines.append("")

    def _get_key_tasks_list(self, proj: dict) -> List[str]:
        """Extract key tasks as a list of strings"""
        key_tasks = proj.get("key_tasks_list", [])
        if not key_tasks:
            key_tasks_str = proj.get("key_tasks", "")
            if key_tasks_str:
                key_tasks = [t.strip().lstrip("•").strip()
                            for t in key_tasks_str.split("\n") if t.strip()]
        return key_tasks

    def _get_achievements_list(self, proj: dict) -> List[str]:
        """Extract achievements as a list of strings"""
        achievements = proj.get("achievements")
        if isinstance(achievements, str):
            return [a.strip().lstrip("•").lstrip("-").strip()
                    for a in achievements.split("\n") if a.strip()]
        elif isinstance(achievements, list):
            result = []
            for ach in achievements:
                if isinstance(ach, dict):
                    metric = ach.get("metric_name", ach.get("title", ""))
                    value = ach.get("metric_value", ach.get("description", ""))
                    if metric and value:
                        result.append(f"{metric}: {value}")
                    elif metric:
                        result.append(metric)
                elif isinstance(ach, str):
                    result.append(ach.strip().lstrip("•").lstrip("-").strip())
            return result
        return []

    def _group_projects_by_company(self, projects: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Group projects by company name"""
        company_projects = {}
        for proj in projects:
            company = proj.get("company_name") or proj.get("company") or ""
            if company not in company_projects:
                company_projects[company] = []
            company_projects[company].append(proj)
        return company_projects

    def _categorize_skills_by_domain_detailed(self, projects: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Categorize skills by domain with detailed format (based on user's example)

        Returns dict with:
        - technologies: List of technology lines (can be multiple items per line)
        - implementations: List of implementation details
        - databases: List of database-related items

        Example output for Backend domain:
        {
            "technologies": [
                "FastAPI, Spring Boot, RESTful API, JWT 인증",
                "ORM (SQLAlchemy, JPA/Hibernate)",
                "Linux (Rocky Linux, Ubuntu), Nginx, Docker"
            ],
            "implementations": [
                "RESTful API 서버 개발 (10개 이상 프로젝트)",
                "데이터 수집 파이프라인 구축",
                ...
            ],
            "databases": [
                "MySQL, PostgreSQL, SQLite, Elasticsearch",
                "DB 설계, ERD 작성, 테이블 정의서 작성"
            ]
        }
        """
        domain_data = {}

        for proj in projects:
            # Get technologies
            tech = proj.get("technologies")
            if isinstance(tech, str):
                techs = [t.strip() for t in tech.split(",") if t.strip()]
            elif isinstance(tech, list):
                techs = tech
            else:
                techs = []

            # Get key tasks and implementation details
            key_tasks = self._get_key_tasks_list(proj)
            implementation_details = proj.get("implementation_details", [])

            # Find primary domain
            project_primary_domain = None
            domain_tech_count = {}

            # Categorize technologies
            for tech_name in techs:
                tech_lower = tech_name.lower()
                matched_domain = None

                for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                    if any(kw in tech_lower for kw in domain_info["keywords"]):
                        matched_domain = domain_info["name_ko"]
                        break

                if not matched_domain:
                    matched_domain = "기타"

                if matched_domain not in domain_data:
                    domain_data[matched_domain] = {
                        "technologies": [],
                        "implementations": [],
                        "databases": [],
                        "_tech_set": set(),
                        "_impl_set": set(),
                        "_db_set": set(),
                    }

                domain_data[matched_domain]["_tech_set"].add(tech_name)
                domain_tech_count[matched_domain] = domain_tech_count.get(matched_domain, 0) + 1

                # Check if it's a database tech
                if any(kw in tech_lower for kw in DOMAIN_CATEGORIES.get("Database", {}).get("keywords", [])):
                    domain_data[matched_domain]["_db_set"].add(tech_name)

            # Find primary domain
            if domain_tech_count:
                project_primary_domain = max(domain_tech_count.items(), key=lambda x: x[1])[0]

            # Process implementation_details from LLM analysis
            for detail in implementation_details:
                if isinstance(detail, dict):
                    title = detail.get("title", "")
                    items = detail.get("items", [])
                    title_lower = title.lower()

                    matched_domain = None
                    for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                        if any(kw in title_lower for kw in domain_info["keywords"]):
                            matched_domain = domain_info["name_ko"]
                            break

                    if not matched_domain:
                        matched_domain = project_primary_domain or "기타"

                    if matched_domain not in domain_data:
                        domain_data[matched_domain] = {
                            "technologies": [],
                            "implementations": [],
                            "databases": [],
                            "_tech_set": set(),
                            "_impl_set": set(),
                            "_db_set": set(),
                        }

                    for item in items:
                        if isinstance(item, str):
                            stripped = item.strip()
                            if stripped:
                                domain_data[matched_domain]["_impl_set"].add(stripped)

            # Add key_tasks to implementations
            for task in key_tasks:
                task_lower = task.lower()
                task_assigned = False

                for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                    if any(kw in task_lower for kw in domain_info["keywords"]):
                        domain_name = domain_info["name_ko"]
                        if domain_name not in domain_data:
                            domain_data[domain_name] = {
                                "technologies": [],
                                "implementations": [],
                                "databases": [],
                                "_tech_set": set(),
                                "_impl_set": set(),
                                "_db_set": set(),
                            }
                        domain_data[domain_name]["_impl_set"].add(task)
                        task_assigned = True
                        break

                if not task_assigned and project_primary_domain:
                    domain_data[project_primary_domain]["_impl_set"].add(task)

        # Convert sets to lists and format technologies
        for domain_name in domain_data:
            techs = sorted(domain_data[domain_name]["_tech_set"])
            # Group technologies into comma-separated lines (max 4-5 per line)
            if techs:
                domain_data[domain_name]["technologies"] = [", ".join(techs)]

            domain_data[domain_name]["implementations"] = list(domain_data[domain_name]["_impl_set"])[:10]

            dbs = sorted(domain_data[domain_name]["_db_set"])
            if dbs:
                domain_data[domain_name]["databases"] = [", ".join(dbs)]

            # Clean up internal sets
            del domain_data[domain_name]["_tech_set"]
            del domain_data[domain_name]["_impl_set"]
            del domain_data[domain_name]["_db_set"]

        # Sort by priority
        priority_order = ["Backend", "AI/ML", "Frontend", "Mobile/Cross-Platform", "데이터 분석", "Database", "DevOps/인프라", "IoT/임베디드", "기타"]
        sorted_data = {}
        for domain in priority_order:
            if domain in domain_data:
                sorted_data[domain] = domain_data[domain]
        for domain in domain_data:
            if domain not in sorted_data:
                sorted_data[domain] = domain_data[domain]

        return sorted_data
