"""
Word Document Generator - Creates properly formatted DOCX files matching original templates.

This module generates Word documents with actual tables (not markdown conversion)
that match the exact format of the original Korean resume/career templates.

Delegates table creation to docx_table_builder.py for better modularity.
"""
from typing import Dict, List, Any, Optional
from pathlib import Path
from datetime import datetime
import os

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

from .docx_table_builder import DocxTableBuilder


class DocxGenerator:
    """Generate Word documents matching original Korean resume format."""

    def __init__(self):
        # Font settings - match original templates
        self.font_title = "나눔고딕OTF"
        self.font_body = "나눔고딕OTF"
        self.font_fallback = "맑은 고딕"

        # Font sizes (in points) - exact match to original
        self.size_document_title = 26
        self.size_name = 18
        self.size_summary = 8
        self.size_section_header = 12
        self.size_table_content = 10
        self.size_project_title = 14
        self.size_subsection_title = 16

        # Page margins (in cm)
        self.margin_top = Cm(3.0)
        self.margin_bottom = Cm(2.54)
        self.margin_left = Cm(2.54)
        self.margin_right = Cm(2.54)

        # Initialize table builder
        self._table_builder = DocxTableBuilder(self.font_body, self.size_table_content)

    # ==========================================================================
    # Document Setup Helpers
    # ==========================================================================

    def _set_page_margins(self, doc: Document):
        """Set page margins and size to match original template (A4)."""
        for section in doc.sections:
            section.page_width = Cm(21.0)
            section.page_height = Cm(29.7)
            section.top_margin = self.margin_top
            section.bottom_margin = self.margin_bottom
            section.left_margin = self.margin_left
            section.right_margin = self.margin_right

    def _set_run_font(self, run, font_size: int, bold: bool = False):
        """Set font properties for a run."""
        run.font.name = self.font_body
        run.font.size = Pt(font_size)
        run.font.bold = bold
        run.font.color.rgb = RGBColor(0, 0, 0)
        run._element.rPr.rFonts.set(qn('w:eastAsia'), self.font_body)

    def _set_paragraph_spacing(self, para, space_before: int = 0, space_after: int = 0):
        """Set paragraph spacing to match original template."""
        pPr = para._p.get_or_add_pPr()

        spacing = OxmlElement('w:spacing')
        spacing.set(qn('w:before'), str(int(space_before * 20)))
        spacing.set(qn('w:after'), str(int(space_after * 20)))
        spacing.set(qn('w:line'), '240')
        spacing.set(qn('w:lineRule'), 'auto')

        for old_spacing in pPr.findall(qn('w:spacing')):
            pPr.remove(old_spacing)
        pPr.append(spacing)

    def _add_paragraph_with_style(
        self,
        doc: Document,
        text: str,
        font_size: int,
        bold: bool = False,
        alignment=WD_ALIGN_PARAGRAPH.LEFT,
        space_after: int = 0
    ):
        """Add a paragraph with specific styling."""
        para = doc.add_paragraph()
        para.alignment = alignment
        self._set_paragraph_spacing(para, space_before=0, space_after=space_after)
        run = para.add_run(text)
        self._set_run_font(run, font_size, bold)
        return para

    # ==========================================================================
    # Delegated Table Methods (backward compatibility)
    # ==========================================================================

    def _set_cell_borders(self, cell, color: str = "auto", size: int = 12):
        """Set cell borders matching original template."""
        self._table_builder.set_cell_borders(cell, color, size)

    def _set_cell_shading(self, cell, color: str):
        """Set cell background color."""
        self._table_builder.set_cell_shading(cell, color)

    def _merge_cells_vertically(self, table, col_idx: int, start_row: int, end_row: int):
        """Merge cells vertically in a column."""
        self._table_builder.merge_cells_vertically(table, col_idx, start_row, end_row)

    def _set_table_column_widths(self, table, widths: list):
        """Set table column widths properly using XML."""
        self._table_builder.set_table_column_widths(table, widths)

    def _create_info_table(
        self,
        doc: Document,
        section_title: str,
        rows: List[tuple],
        title_rows: int = None,
        value_bold: bool = False
    ):
        """Create a standard info table with section header in first column."""
        return self._table_builder.create_info_table(doc, section_title, rows, title_rows, value_bold)

    def _create_career_table_with_bold_company(
        self,
        doc: Document,
        section_title: str,
        rows: List[tuple]
    ):
        """Create career table with bold company name in first row's value."""
        return self._table_builder.create_career_table_with_bold_company(doc, section_title, rows)

    def _create_project_table(
        self,
        doc: Document,
        projects: List[Dict[str, Any]],
        section_title: str = "주요 프로젝트"
    ):
        """Create project section table in 2-column format."""
        return self._table_builder.create_project_table(doc, projects, section_title)

    def _create_skills_table(
        self,
        doc: Document,
        skills_data: Dict[str, str],
        section_title: str = "기술스택"
    ):
        """Create skills table matching original format."""
        return self._table_builder.create_skills_table(doc, skills_data, section_title)

    # ==========================================================================
    # Document Generation Methods
    # ==========================================================================

    def generate_career_description(
        self,
        data: Dict[str, Any],
        output_path: Path,
        include_personal_info: bool = True
    ) -> int:
        """Generate 경력기술서 document.

        Args:
            data: Template data with user, companies, projects info
            output_path: Path to save the document
            include_personal_info: Whether to include personal info section

        Returns:
            File size in bytes
        """
        doc = Document()
        self._set_page_margins(doc)

        # Set default font
        style = doc.styles['Normal']
        style.font.name = self.font_body
        style.font.size = Pt(self.size_table_content)
        style._element.rPr.rFonts.set(qn('w:eastAsia'), self.font_body)

        # Title: 경력기술서
        self._add_paragraph_with_style(
            doc, "경력기술서",
            self.size_document_title,
            bold=False,
            alignment=WD_ALIGN_PARAGRAPH.CENTER,
            space_after=12
        )

        # Name
        name = data.get("name", "")
        name_en = data.get("name_en", "")
        full_name = f"{name} {name_en}" if name_en else name
        self._add_paragraph_with_style(
            doc, full_name,
            self.size_name,
            bold=True,
            alignment=WD_ALIGN_PARAGRAPH.CENTER,
            space_after=6
        )

        # Summary
        summary = data.get("summary", "")
        if summary:
            self._add_paragraph_with_style(
                doc, summary,
                self.size_summary,
                alignment=WD_ALIGN_PARAGRAPH.CENTER,
                space_after=12
            )

        doc.add_paragraph()

        # Personal Info Table
        if include_personal_info:
            personal_rows = [
                ("성명", data.get("name", "")),
                ("생년월일", data.get("birthdate", "")),
                ("주소", data.get("address", "")),
                ("연락처", data.get("phone", "")),
                ("이메일", data.get("email", "")),
            ]
            self._create_info_table(doc, "인적사항", personal_rows)

        # Education Table
        self._add_education_section(doc, data)

        # Research Experience
        self._add_research_section(doc, data)

        # Career Table
        self._add_career_section(doc, data)

        # Freelance Experience
        self._add_freelance_section(doc, data)

        # Skills Table
        self._add_skills_section(doc, data)

        # Projects Table
        projects = data.get("projects", [])
        if projects:
            self._create_project_table(doc, projects)

        # Certifications and Awards
        self._add_certifications_section(doc, data)
        self._add_awards_section(doc, data)

        # Save document
        os.makedirs(output_path.parent, exist_ok=True)
        doc.save(output_path)
        return os.path.getsize(output_path)

    def generate_resume(
        self,
        data: Dict[str, Any],
        output_path: Path
    ) -> int:
        """Generate 이력서 document (includes salary info and self-introduction).

        Args:
            data: Template data
            output_path: Path to save the document

        Returns:
            File size in bytes
        """
        doc = Document()
        self._set_page_margins(doc)

        # Set default font
        style = doc.styles['Normal']
        style.font.name = self.font_body
        style.font.size = Pt(self.size_table_content)
        style._element.rPr.rFonts.set(qn('w:eastAsia'), self.font_body)

        # Title in header
        section = doc.sections[0]
        header = section.header
        header_para = header.paragraphs[0]
        run = header_para.add_run("이력서")
        self._set_run_font(run, self.size_document_title, bold=False)
        header_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Name
        name = data.get("name", "")
        name_en = data.get("name_en", "")
        full_name = f"{name} {name_en}" if name_en else name
        self._add_paragraph_with_style(
            doc, full_name,
            self.size_name,
            bold=True,
            alignment=WD_ALIGN_PARAGRAPH.CENTER,
            space_after=6
        )

        # Summary
        summary = data.get("summary", "")
        if summary:
            self._add_paragraph_with_style(
                doc, summary,
                self.size_summary,
                alignment=WD_ALIGN_PARAGRAPH.CENTER,
                space_after=12
            )

        # Salary Info
        self._add_salary_info(doc, data)

        # Personal Info Table
        personal_rows = [
            ("성명", data.get("name", "")),
            ("생년월일", data.get("birthdate", "")),
            ("주소", data.get("address", "")),
            ("연락처", data.get("phone", "")),
            ("이메일", data.get("email", "")),
        ]
        self._create_info_table(doc, "인적사항", personal_rows)

        # Education, Research, Career, Freelance, Skills
        self._add_education_section(doc, data)
        self._add_research_section(doc, data)
        self._add_career_section(doc, data)
        self._add_freelance_section(doc, data)
        self._add_skills_section(doc, data)

        # 경력기술서 Section Title
        self._add_paragraph_with_style(
            doc, "경력기술서",
            self.size_subsection_title,
            bold=True,
            alignment=WD_ALIGN_PARAGRAPH.LEFT,
            space_after=12
        )

        # Projects Table
        projects = data.get("projects", [])
        if projects:
            self._create_project_table(doc, projects)

        # Certifications and Awards
        self._add_certifications_section(doc, data)
        self._add_awards_section(doc, data)

        # Self Introduction Section
        self._add_self_introduction_section(doc, data)

        # Save document
        os.makedirs(output_path.parent, exist_ok=True)
        doc.save(output_path)
        return os.path.getsize(output_path)

    # ==========================================================================
    # Section Helper Methods
    # ==========================================================================

    def _add_education_section(self, doc: Document, data: Dict[str, Any]):
        """Add education section to document."""
        educations = data.get("educations", [])
        if not educations:
            return

        edu_rows = []
        for edu in educations:
            edu_rows.append(("학교명", edu.get("school_name", "")))
            edu_rows.append(("입학일/졸업일", edu.get("period", "")))
            edu_rows.append(("전공", edu.get("major", "")))
            if edu.get("gpa"):
                edu_rows.append(("학점", edu.get("gpa", "")))

        if edu_rows:
            self._create_info_table(doc, "학력사항", edu_rows)

    def _add_research_section(self, doc: Document, data: Dict[str, Any]):
        """Add research/lab experience section."""
        research = data.get("research", [])
        for res in research:
            res_rows = [
                ("연구실명", res.get("name", "")),
                ("입학일/퇴학일", res.get("period", "")),
                ("연구 분야", res.get("research_area", "")),
            ]
            self._create_info_table(doc, "연구실 경력", res_rows)

    def _add_career_section(self, doc: Document, data: Dict[str, Any]):
        """Add career section to document."""
        companies = data.get("companies", [])
        for company in companies:
            end_date = company.get("end_date", "")
            if not end_date or end_date.lower() == "none":
                end_date = "현재근무"

            career_rows = [
                ("회사명", company.get("name", "")),
                ("입사일/퇴사일", f"{company.get('start_date', '')} ~ {end_date}"),
                ("소속부서/직급", f"{company.get('department', '')} / {company.get('position', '')}"),
                ("직무", company.get("description", "")),
            ]
            self._create_career_table_with_bold_company(doc, "경력사항", career_rows)

    def _add_freelance_section(self, doc: Document, data: Dict[str, Any]):
        """Add freelance experience section."""
        freelance = data.get("freelance", [])
        for fl in freelance:
            end_date = fl.get("end_date", "")
            if not end_date or end_date.lower() == "none":
                end_date = "종료"

            fl_rows = [
                ("회사명", fl.get("company_name", "")),
                ("입사일/퇴사일", f"{fl.get('start_date', '')} ~ {end_date}"),
                ("소속부서/직급", fl.get("position", "")),
                ("직무", fl.get("description", "")),
            ]
            self._create_career_table_with_bold_company(doc, "프리랜서 경력", fl_rows)

    def _add_skills_section(self, doc: Document, data: Dict[str, Any]):
        """Add skills table to document."""
        skills_data = {
            "programming_languages": data.get("programming_languages", ""),
            "frameworks": data.get("frameworks", ""),
            "databases": data.get("databases", ""),
            "cloud": data.get("cloud", ""),
            "tools": data.get("tools", ""),
        }
        self._create_skills_table(doc, skills_data)

    def _add_certifications_section(self, doc: Document, data: Dict[str, Any]):
        """Add certifications section."""
        certifications = data.get("certifications", [])
        if not certifications:
            return

        cert_rows = []
        for cert in certifications:
            cert_text = f"{cert.get('name', '')} - {cert.get('issuer', '')} ({cert.get('issue_date', '')})"
            cert_rows.append(("", cert_text))

        if cert_rows:
            self._create_info_table(doc, "자격사항", cert_rows)

    def _add_awards_section(self, doc: Document, data: Dict[str, Any]):
        """Add awards section."""
        awards = data.get("awards", [])
        if not awards:
            return

        award_rows = []
        for award in awards:
            award_text = f"{award.get('name', '')} - {award.get('issuer', '')} ({award.get('award_date', '')})"
            award_rows.append(("", award_text))

        if award_rows:
            self._create_info_table(doc, "수상내역", award_rows)

    def _add_salary_info(self, doc: Document, data: Dict[str, Any]):
        """Add salary information section."""
        salary_info = []
        if data.get("current_salary"):
            salary_info.append(f"현재연봉: {data['current_salary']}")
        if data.get("desired_salary"):
            salary_info.append(f"희망연봉: {data['desired_salary']}")
        if data.get("job_change_reason"):
            salary_info.append(f"이직사유: {data['job_change_reason']}")
        if data.get("available_date"):
            salary_info.append(f"입사 가능일: {data['available_date']}")

        if salary_info:
            for info in salary_info:
                self._add_paragraph_with_style(doc, info, self.size_table_content)
            doc.add_paragraph()

    def _add_self_introduction_section(self, doc: Document, data: Dict[str, Any]):
        """Add self-introduction section (자기소개)."""
        self._add_paragraph_with_style(
            doc, "자기소개",
            self.size_subsection_title,
            bold=True,
            alignment=WD_ALIGN_PARAGRAPH.LEFT,
            space_after=12
        )

        intro_content = []
        if data.get("motivation"):
            intro_content.append(("지원 동기", data["motivation"]))
        if data.get("competencies"):
            intro_content.append(("업무 수행 역량", data["competencies"]))
        if data.get("personality"):
            intro_content.append(("성격 및 가치관", data["personality"]))

        if intro_content:
            table = doc.add_table(rows=1, cols=1)
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            cell = table.cell(0, 0)
            cell.width = Cm(15.9)

            for idx, (label, content) in enumerate(intro_content):
                if idx == 0:
                    para = cell.paragraphs[0]
                else:
                    para = cell.add_paragraph()
                    para.paragraph_format.space_before = Pt(6)

                run = para.add_run(f"{label}\n")
                self._set_run_font(run, 11, bold=True)

                run = para.add_run(content)
                self._set_run_font(run, self.size_table_content, bold=False)

            self._set_cell_borders(cell)
