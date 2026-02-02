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

    def export_markdown_from_dict(
        self,
        data: dict,
        platform_key: str,
        template_name: str
    ) -> Tuple[str, str]:
        """Export to Markdown file from dict data"""
        md_content = self.generate_markdown_from_dict(data, template_name)
        filename = self.generate_filename(platform_key, data.get("name", "user"), "md")
        file_path = self.save_file(filename, md_content)
        return file_path, md_content

    def export_docx_from_dict(
        self,
        data: dict,
        platform_key: str
    ) -> str:
        """Export to Word document from dict data"""
        from docx import Document
        from docx.shared import Pt
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        filename = self.generate_filename(platform_key, data.get("name", "user"), "docx")
        os.makedirs(self.result_dir, exist_ok=True)
        file_path = self.result_dir / filename

        doc = Document()

        # Set default font
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Malgun Gothic'
        font.size = Pt(11)

        # Header
        title = doc.add_heading(data.get("name", "이력서"), level=0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Contact info
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

        # Summary/Introduction
        if data.get("introduction"):
            doc.add_heading("자기소개", level=1)
            doc.add_paragraph(data["introduction"])

        # Experience
        experiences = data.get("experiences", [])
        if experiences:
            doc.add_heading("경력사항", level=1)
            for exp in experiences:
                p = doc.add_paragraph()
                run = p.add_run(exp.get("company_name", ""))
                run.bold = True
                period = f" ({exp.get('start_date', '')} ~ {exp.get('end_date', '') or '현재'})"
                p.add_run(period)

                if exp.get("position"):
                    doc.add_paragraph(exp["position"], style='List Bullet')
                if exp.get("description"):
                    doc.add_paragraph(exp["description"])
                if exp.get("achievements"):
                    for ach in exp["achievements"]:
                        doc.add_paragraph(ach, style='List Bullet')

        # Projects
        projects = data.get("projects", [])
        if projects:
            doc.add_heading("프로젝트", level=1)
            for proj in projects:
                p = doc.add_paragraph()
                run = p.add_run(proj.get("name", ""))
                run.bold = True
                period = f" ({proj.get('start_date', '')} ~ {proj.get('end_date', '') or '현재'})"
                p.add_run(period)

                if proj.get("company_name"):
                    doc.add_paragraph(f"소속: {proj['company_name']}")
                if proj.get("description"):
                    doc.add_paragraph(proj["description"])
                if proj.get("role"):
                    doc.add_paragraph(f"역할: {proj['role']}")

                # Technologies (can be string or list)
                tech = proj.get("technologies")
                if tech:
                    tech_str = tech if isinstance(tech, str) else ", ".join(tech)
                    doc.add_paragraph(f"기술: {tech_str}")

                # Key tasks
                key_tasks = proj.get("key_tasks_list", [])
                if key_tasks:
                    doc.add_paragraph("주요 수행 업무:")
                    for task in key_tasks:
                        doc.add_paragraph(task, style='List Bullet')

                # Achievements
                achievements = proj.get("achievements")
                if achievements:
                    if isinstance(achievements, str) and achievements:
                        doc.add_paragraph("성과:")
                        for line in achievements.split('\n'):
                            if line.strip():
                                doc.add_paragraph(line.strip().lstrip('• '), style='List Bullet')
                    elif isinstance(achievements, list):
                        doc.add_paragraph("성과:")
                        for ach in achievements:
                            doc.add_paragraph(str(ach), style='List Bullet')

        # Skills
        skills_categorized = data.get("skills_categorized", {})
        skills_list = data.get("skills", [])
        if skills_categorized or skills_list:
            doc.add_heading("기술 스택", level=1)
            if skills_categorized:
                if skills_categorized.get("languages"):
                    doc.add_paragraph(f"Languages: {', '.join(skills_categorized['languages'])}")
                if skills_categorized.get("frameworks"):
                    doc.add_paragraph(f"Frameworks: {', '.join(skills_categorized['frameworks'])}")
                if skills_categorized.get("databases"):
                    doc.add_paragraph(f"Databases: {', '.join(skills_categorized['databases'])}")
                if skills_categorized.get("tools"):
                    doc.add_paragraph(f"Tools: {', '.join(skills_categorized['tools'])}")
            elif skills_list:
                doc.add_paragraph(", ".join(skills_list))

        # Education
        education = data.get("education", [])
        if education:
            doc.add_heading("학력", level=1)
            for edu in education:
                p = doc.add_paragraph()
                run = p.add_run(edu.get("school_name", ""))
                run.bold = True
                if edu.get("major"):
                    p.add_run(f" - {edu['major']}")
                period = f" ({edu.get('start_date', '')} ~ {edu.get('end_date', '')})"
                p.add_run(period)

        # Certifications
        certifications = data.get("certifications", [])
        if certifications:
            doc.add_heading("자격증", level=1)
            for cert in certifications:
                doc.add_paragraph(
                    f"{cert.get('name', '')} ({cert.get('issuer', '')}) - {cert.get('date', '')}",
                    style='List Bullet'
                )

        doc.save(file_path)
        return str(file_path)

    def generate_markdown_from_dict(self, data: dict, template_name: str) -> str:
        """Generate Markdown from dict data"""
        lines = []

        # Header
        lines.append(f"# {data.get('name', 'Resume')}")
        lines.append("")

        # Contact info
        contact = []
        if data.get("email"):
            contact.append(f"📧 {data['email']}")
        if data.get("phone"):
            contact.append(f"📱 {data['phone']}")
        if data.get("github_url"):
            contact.append(f"💻 [{data['github_url']}]({data['github_url']})")
        if data.get("portfolio_url"):
            contact.append(f"🔗 [{data['portfolio_url']}]({data['portfolio_url']})")

        if contact:
            lines.append(" | ".join(contact))
            lines.append("")

        lines.append("---")
        lines.append("")

        # Summary/Introduction
        if data.get("introduction"):
            lines.append("## 자기소개")
            lines.append("")
            lines.append(data["introduction"])
            lines.append("")

        # Experience
        experiences = data.get("experiences", [])
        if experiences:
            lines.append("## 경력사항")
            lines.append("")
            for exp in experiences:
                period = f"{exp.get('start_date', '')} ~ {exp.get('end_date', '') or '현재'}"
                lines.append(f"### {exp.get('company_name', '')}")
                lines.append(f"**{exp.get('position', '')}** | {period}")
                lines.append("")
                if exp.get("description"):
                    lines.append(exp["description"])
                    lines.append("")
                if exp.get("achievements"):
                    for ach in exp["achievements"]:
                        lines.append(f"- {ach}")
                    lines.append("")

        # Projects
        projects = data.get("projects", [])
        if projects:
            lines.append("## 프로젝트")
            lines.append("")
            for proj in projects:
                period = f"{proj.get('start_date', '')} ~ {proj.get('end_date', '') or '현재'}"
                lines.append(f"### {proj.get('name', '')}")
                if proj.get("company_name"):
                    lines.append(f"*{proj['company_name']}* | {period}")
                else:
                    lines.append(f"{period}")
                lines.append("")

                if proj.get("description"):
                    lines.append(proj["description"])
                    lines.append("")

                if proj.get("role"):
                    lines.append(f"**담당 역할**: {proj['role']}")
                    lines.append("")

                # Technologies
                tech = proj.get("technologies")
                if tech:
                    tech_str = tech if isinstance(tech, str) else ", ".join(tech)
                    lines.append(f"**기술 스택**: {tech_str}")
                    lines.append("")

                # Key tasks
                key_tasks = proj.get("key_tasks_list", [])
                if key_tasks:
                    lines.append("**주요 수행 업무**:")
                    for task in key_tasks:
                        lines.append(f"- {task}")
                    lines.append("")

                # Achievements
                achievements = proj.get("achievements")
                if achievements:
                    lines.append("**성과**:")
                    if isinstance(achievements, str):
                        for line in achievements.split('\n'):
                            if line.strip():
                                lines.append(f"- {line.strip().lstrip('• ')}")
                    elif isinstance(achievements, list):
                        for ach in achievements:
                            lines.append(f"- {ach}")
                    lines.append("")

        # Skills
        skills_categorized = data.get("skills_categorized", {})
        skills_list = data.get("skills", [])
        if skills_categorized or skills_list:
            lines.append("## 기술 스택")
            lines.append("")
            if skills_categorized:
                if skills_categorized.get("languages"):
                    lines.append(f"**Languages**: {', '.join(skills_categorized['languages'])}")
                if skills_categorized.get("frameworks"):
                    lines.append(f"**Frameworks**: {', '.join(skills_categorized['frameworks'])}")
                if skills_categorized.get("databases"):
                    lines.append(f"**Databases**: {', '.join(skills_categorized['databases'])}")
                if skills_categorized.get("tools"):
                    lines.append(f"**Tools**: {', '.join(skills_categorized['tools'])}")
            elif skills_list:
                lines.append(", ".join(skills_list))
            lines.append("")

        # Education
        education = data.get("education", [])
        if education:
            lines.append("## 학력")
            lines.append("")
            for edu in education:
                period = f"{edu.get('start_date', '')} ~ {edu.get('end_date', '')}"
                lines.append(f"### {edu.get('school_name', '')}")
                if edu.get("major"):
                    lines.append(f"{edu['major']} | {period}")
                else:
                    lines.append(period)
                lines.append("")
                if edu.get("description"):
                    lines.append(edu["description"])
                    lines.append("")

        # Certifications
        certifications = data.get("certifications", [])
        if certifications:
            lines.append("## 자격증")
            lines.append("")
            for cert in certifications:
                lines.append(f"- **{cert.get('name', '')}** ({cert.get('issuer', '')}) - {cert.get('date', '')}")
            lines.append("")

        # Footer
        lines.append("---")
        lines.append("")
        lines.append(f"*Generated by Autopolio ({template_name}) | {datetime.now().strftime('%Y-%m-%d')}*")

        return "\n".join(lines)
