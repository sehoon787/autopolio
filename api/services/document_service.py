"""
Document Service - Handles document generation (DOCX, PDF, Markdown).
"""
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import os
import re
from datetime import datetime

from api.config import get_settings

settings = get_settings()


class DocumentService:
    """Service for document generation and template parsing."""

    def __init__(self):
        self.result_dir = settings.result_dir

    async def parse_template(self, file_path: str) -> Tuple[str, Dict[str, str]]:
        """Parse a template file and extract field mappings."""
        ext = Path(file_path).suffix.lower()

        if ext in [".docx", ".doc"]:
            return await self._parse_docx_template(file_path)
        elif ext == ".pdf":
            return await self._parse_pdf_template(file_path)
        else:
            raise ValueError(f"Unsupported template format: {ext}")

    async def _parse_docx_template(self, file_path: str) -> Tuple[str, Dict[str, str]]:
        """Parse a Word document template."""
        from docx import Document

        doc = Document(file_path)
        content_parts = []
        field_mappings = {}

        # Pattern for placeholders like {{field_name}} or {field_name}
        placeholder_pattern = r'\{\{?\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}?\}'

        for para in doc.paragraphs:
            text = para.text
            content_parts.append(text)

            # Find all placeholders
            matches = re.findall(placeholder_pattern, text)
            for match in matches:
                field_mappings[f"{{{{{match}}}}}"] = match

        full_content = "\n".join(content_parts)
        return full_content, field_mappings

    async def _parse_pdf_template(self, file_path: str) -> Tuple[str, Dict[str, str]]:
        """Parse a PDF template (extract text and find placeholders)."""
        from PyPDF2 import PdfReader

        reader = PdfReader(file_path)
        content_parts = []
        field_mappings = {}

        placeholder_pattern = r'\{\{?\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}?\}'

        for page in reader.pages:
            text = page.extract_text()
            content_parts.append(text)

            matches = re.findall(placeholder_pattern, text)
            for match in matches:
                field_mappings[f"{{{{{match}}}}}"] = match

        full_content = "\n".join(content_parts)
        return full_content, field_mappings

    async def generate_document(
        self,
        template_content: str,
        data: Dict[str, Any],
        output_format: str,
        document_name: str
    ) -> Tuple[str, int]:
        """Generate a document from template and data."""
        # Apply data to template
        rendered_content = self._render_template(template_content, data)

        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = re.sub(r'[^\w\-_]', '_', document_name)
        filename = f"{safe_name}_{timestamp}.{output_format}"
        file_path = self.result_dir / filename

        os.makedirs(self.result_dir, exist_ok=True)

        if output_format == "docx":
            file_size = await self._generate_docx(rendered_content, file_path)
        elif output_format == "pdf":
            file_size = await self._generate_pdf(rendered_content, file_path)
        elif output_format == "md":
            file_size = await self._generate_markdown(rendered_content, file_path)
        elif output_format == "html":
            file_size = await self._generate_html(rendered_content, file_path)
        else:
            raise ValueError(f"Unsupported output format: {output_format}")

        return str(file_path), file_size

    def _render_template(self, template: str, data: Dict[str, Any]) -> str:
        """Render template with data (simple mustache-like syntax)."""
        result = template

        # Handle simple variables {{variable}}
        for key, value in self._flatten_dict(data).items():
            placeholder = f"{{{{{key}}}}}"
            if isinstance(value, list):
                value = ", ".join(str(v) for v in value)
            elif value is None:
                value = ""
            result = result.replace(placeholder, str(value))

        # Handle sections {{#section}}...{{/section}}
        result = self._render_sections(result, data)

        return result

    def _flatten_dict(self, d: Dict, parent_key: str = '', sep: str = '.') -> Dict:
        """Flatten nested dictionary."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def _render_sections(self, template: str, data: Dict[str, Any]) -> str:
        """Render section loops in template."""
        # Pattern for sections: {{#section}}...{{/section}}
        section_pattern = r'\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}'

        def replace_section(match):
            section_name = match.group(1)
            section_content = match.group(2)

            items = data.get(section_name, [])
            if not isinstance(items, list):
                items = [items] if items else []

            rendered_items = []
            for item in items:
                item_content = section_content
                if isinstance(item, dict):
                    for key, value in item.items():
                        placeholder = f"{{{{{key}}}}}"
                        item_content = item_content.replace(placeholder, str(value or ''))
                else:
                    item_content = item_content.replace("{{.}}", str(item))
                rendered_items.append(item_content)

            return "\n".join(rendered_items)

        return re.sub(section_pattern, replace_section, template, flags=re.DOTALL)

    async def _generate_docx(self, content: str, file_path: Path) -> int:
        """Generate a Word document."""
        from docx import Document
        from docx.shared import Pt, Inches
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        doc = Document()

        # Set default font
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Malgun Gothic'  # 맑은 고딕
        font.size = Pt(11)

        # Parse markdown-like content
        lines = content.split('\n')
        for line in lines:
            line = line.strip()

            if line.startswith('# '):
                # Heading 1
                para = doc.add_heading(line[2:], level=1)
            elif line.startswith('## '):
                # Heading 2
                para = doc.add_heading(line[3:], level=2)
            elif line.startswith('### '):
                # Heading 3
                para = doc.add_heading(line[4:], level=3)
            elif line.startswith('- '):
                # Bullet point
                para = doc.add_paragraph(line[2:], style='List Bullet')
            elif line.startswith('---'):
                # Horizontal line (add paragraph break)
                doc.add_paragraph()
            elif line:
                # Regular paragraph
                para = doc.add_paragraph(line)

        doc.save(file_path)
        return os.path.getsize(file_path)

    async def _generate_pdf(self, content: str, file_path: Path) -> int:
        """Generate a PDF document."""
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.units import inch
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        # Try to register Korean font
        try:
            # Windows font path
            font_path = "C:/Windows/Fonts/malgun.ttf"
            if os.path.exists(font_path):
                pdfmetrics.registerFont(TTFont('MalgunGothic', font_path))
                default_font = 'MalgunGothic'
            else:
                default_font = 'Helvetica'
        except Exception:
            default_font = 'Helvetica'

        doc = SimpleDocTemplate(str(file_path), pagesize=A4)
        styles = getSampleStyleSheet()

        # Create custom styles
        styles.add(ParagraphStyle(
            name='CustomBody',
            fontName=default_font,
            fontSize=11,
            leading=14
        ))
        styles.add(ParagraphStyle(
            name='CustomHeading1',
            fontName=default_font,
            fontSize=18,
            leading=22,
            spaceAfter=12
        ))
        styles.add(ParagraphStyle(
            name='CustomHeading2',
            fontName=default_font,
            fontSize=14,
            leading=18,
            spaceAfter=10
        ))

        elements = []

        lines = content.split('\n')
        for line in lines:
            line = line.strip()

            if line.startswith('# '):
                elements.append(Paragraph(line[2:], styles['CustomHeading1']))
            elif line.startswith('## '):
                elements.append(Paragraph(line[3:], styles['CustomHeading2']))
            elif line.startswith('### '):
                elements.append(Paragraph(f"<b>{line[4:]}</b>", styles['CustomBody']))
            elif line.startswith('- '):
                elements.append(Paragraph(f"• {line[2:]}", styles['CustomBody']))
            elif line == '---':
                elements.append(Spacer(1, 0.2 * inch))
            elif line:
                elements.append(Paragraph(line, styles['CustomBody']))
            else:
                elements.append(Spacer(1, 0.1 * inch))

        doc.build(elements)
        return os.path.getsize(file_path)

    async def _generate_markdown(self, content: str, file_path: Path) -> int:
        """Generate a Markdown document."""
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return os.path.getsize(file_path)

    async def _generate_html(self, content: str, file_path: Path) -> int:
        """Generate an HTML document from markdown-like content."""
        import markdown

        # Convert markdown to HTML
        html_body = markdown.markdown(content, extensions=['tables', 'fenced_code', 'toc'])

        # Wrap in a complete HTML document with basic styling
        html_content = f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume</title>
    <style>
        body {{
            font-family: 'Malgun Gothic', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            color: #333;
        }}
        h1 {{ font-size: 28px; border-bottom: 2px solid #333; padding-bottom: 10px; }}
        h2 {{ font-size: 20px; color: #0066cc; margin-top: 30px; }}
        h3 {{ font-size: 16px; margin-top: 20px; }}
        ul {{ padding-left: 20px; }}
        li {{ margin-bottom: 5px; }}
        hr {{ border: none; border-top: 1px solid #ddd; margin: 20px 0; }}
        table {{ border-collapse: collapse; width: 100%; margin: 15px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f5f5f5; }}
        @media print {{
            body {{ padding: 0; }}
        }}
    </style>
</head>
<body>
{html_body}
</body>
</html>"""

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        return os.path.getsize(file_path)

    def prepare_template_data(
        self,
        user_data: Dict[str, Any],
        companies: List[Dict[str, Any]],
        projects: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Prepare data structure for template rendering."""
        return {
            "name": user_data.get("name", ""),
            "email": user_data.get("email", ""),
            "github_username": user_data.get("github_username", ""),
            "summary": user_data.get("summary", ""),
            "companies": [
                {
                    "name": c.get("name", ""),
                    "position": c.get("position", ""),
                    "department": c.get("department", ""),
                    "start_date": str(c.get("start_date", "")),
                    "end_date": str(c.get("end_date", "")) if c.get("end_date") else "현재",
                    "description": c.get("description", ""),
                    "location": c.get("location", "")
                }
                for c in companies
            ],
            "projects": [
                {
                    "name": p.get("name", ""),
                    "short_description": p.get("short_description", ""),
                    "description": p.get("description", "") or p.get("ai_summary", ""),
                    "start_date": str(p.get("start_date", "")),
                    "end_date": str(p.get("end_date", "")) if p.get("end_date") else "진행중",
                    "role": p.get("role", ""),
                    "team_size": p.get("team_size", ""),
                    "contribution_percent": p.get("contribution_percent", ""),
                    "technologies": ", ".join(p.get("technologies", [])),
                    "achievements": p.get("achievements", []),
                    "links": p.get("links", {})
                }
                for p in projects
            ],
            "skills": self._extract_all_skills(projects)
        }

    def _extract_all_skills(self, projects: List[Dict[str, Any]]) -> str:
        """Extract and deduplicate all skills from projects."""
        all_techs = set()
        for project in projects:
            techs = project.get("technologies", [])
            if isinstance(techs, str):
                techs = [t.strip() for t in techs.split(",")]
            all_techs.update(techs)
        return ", ".join(sorted(all_techs))
