"""
Template Exporter - Export templates to HTML, Markdown, DOCX formats
"""

import os
import re
from typing import Tuple
from datetime import datetime
from pathlib import Path

from api.schemas.platform import RenderDataRequest
from api.config import get_settings

settings = get_settings()


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

    def generate_markdown(self, data: RenderDataRequest, template_name: str) -> str:
        """Generate Markdown from user data"""
        lines = []

        # Header
        lines.append(f"# {data.name}")
        lines.append("")

        if data.desired_position:
            lines.append(f"**{data.desired_position}**")
            lines.append("")

        # Contact info
        contact = []
        if data.email:
            contact.append(f"📧 {data.email}")
        if data.phone:
            contact.append(f"📱 {data.phone}")
        if data.github_url:
            contact.append(f"💻 [{data.github_url}]({data.github_url})")
        if data.portfolio_url:
            contact.append(f"🔗 [{data.portfolio_url}]({data.portfolio_url})")

        if contact:
            lines.append(" | ".join(contact))
            lines.append("")

        lines.append("---")
        lines.append("")

        # Summary
        if data.summary:
            lines.append("## 자기소개")
            lines.append("")
            lines.append(data.summary)
            lines.append("")

        # Experience
        if data.experiences:
            lines.append("## 경력사항")
            lines.append("")
            for exp in data.experiences:
                period = f"{exp.start_date or ''} ~ {exp.end_date or '현재'}"
                lines.append(f"### {exp.company_name}")
                lines.append(f"**{exp.position or ''}** | {period}")
                lines.append("")
                if exp.description:
                    lines.append(exp.description)
                    lines.append("")
                if exp.achievements:
                    for ach in exp.achievements:
                        lines.append(f"- {ach}")
                    lines.append("")

        # Projects
        if data.projects:
            lines.append("## 프로젝트")
            lines.append("")
            for proj in data.projects:
                period = f"{proj.start_date or ''} ~ {proj.end_date or '현재'}"
                lines.append(f"### {proj.name}")
                if proj.company_name:
                    lines.append(f"*{proj.company_name}* | {period}")
                else:
                    lines.append(f"{period}")
                lines.append("")
                if proj.description:
                    lines.append(proj.description)
                    lines.append("")
                if proj.role:
                    lines.append(f"**담당 역할**: {proj.role}")
                    lines.append("")
                if proj.technologies:
                    lines.append(f"**기술 스택**: {', '.join(proj.technologies)}")
                    lines.append("")
                if proj.achievements:
                    for ach in proj.achievements:
                        lines.append(f"- {ach}")
                    lines.append("")

        # Skills
        if data.skills:
            lines.append("## 기술 스택")
            lines.append("")
            skills = data.skills
            if skills.languages:
                lines.append(f"**Languages**: {', '.join(skills.languages)}")
            if skills.frameworks:
                lines.append(f"**Frameworks**: {', '.join(skills.frameworks)}")
            if skills.databases:
                lines.append(f"**Databases**: {', '.join(skills.databases)}")
            if skills.tools:
                lines.append(f"**Tools**: {', '.join(skills.tools)}")
            lines.append("")

        # Education
        if data.educations:
            lines.append("## 학력")
            lines.append("")
            for edu in data.educations:
                period = f"{edu.start_date or ''} ~ {edu.end_date or ''}"
                lines.append(f"### {edu.school_name}")
                if edu.major:
                    lines.append(f"{edu.major} | {period}")
                else:
                    lines.append(period)
                lines.append("")
                if edu.description:
                    lines.append(edu.description)
                    lines.append("")

        # Certifications
        if data.certifications:
            lines.append("## 자격증")
            lines.append("")
            for cert in data.certifications:
                lines.append(f"- **{cert.name}** ({cert.issuer or ''}) - {cert.date or ''}")
            lines.append("")

        # Footer
        lines.append("---")
        lines.append("")
        lines.append(f"*Generated by Autopolio ({template_name}) | {datetime.now().strftime('%Y-%m-%d')}*")

        return "\n".join(lines)
