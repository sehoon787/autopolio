"""
DOCX Table Builder - Table creation utilities for Word documents.

Extracted from docx_generator.py for better modularity.
Contains cell styling helpers and table creation methods.
"""

import re
from collections import OrderedDict
from typing import Dict, List, Any

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def _strip_markdown(text: str) -> str:
    """Strip markdown syntax from text for clean DOCX rendering."""
    # Remove heading prefixes
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bold markers
    text = text.replace("**", "")
    # Remove italic markers (single *)
    text = re.sub(r"(?<!\*)\*(?!\*)", "", text)
    return text.strip()


class DocxTableBuilder:
    """Build styled tables for Word documents matching Korean resume format."""

    def __init__(self, font_body: str = "나눔고딕OTF", size_table_content: int = 10):
        """Initialize table builder with font settings.

        Args:
            font_body: Body font name
            size_table_content: Default font size for table content
        """
        self.font_body = font_body
        self.size_table_content = size_table_content
        self.size_project_title = 14

    # ==========================================================================
    # Cell Styling Helpers
    # ==========================================================================

    def set_cell_borders(self, cell, color: str = "auto", size: int = 12):
        """Set cell borders matching original template.

        Original uses sz=12 (0.5pt), color=auto
        """
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()

        # Remove existing borders
        for old_border in tcPr.findall(qn("w:tcBorders")):
            tcPr.remove(old_border)

        tcBorders = OxmlElement("w:tcBorders")
        for border_name in ["top", "left", "bottom", "right"]:
            border = OxmlElement(f"w:{border_name}")
            border.set(qn("w:val"), "single")
            border.set(qn("w:sz"), str(size))
            border.set(qn("w:color"), color)
            tcBorders.append(border)
        tcPr.append(tcBorders)

    def set_cell_shading(self, cell, color: str):
        """Set cell background color."""
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        shading = OxmlElement("w:shd")
        shading.set(qn("w:fill"), color)
        tcPr.append(shading)

    def merge_cells_vertically(self, table, col_idx: int, start_row: int, end_row: int):
        """Merge cells vertically in a column."""
        for row_idx in range(start_row, end_row + 1):
            cell = table.cell(row_idx, col_idx)
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()

            if row_idx == start_row:
                # First cell - vMerge restart
                vMerge = OxmlElement("w:vMerge")
                vMerge.set(qn("w:val"), "restart")
            else:
                # Subsequent cells - vMerge continue
                vMerge = OxmlElement("w:vMerge")
                # Clear the cell text
                cell.text = ""

            tcPr.append(vMerge)

    def set_table_column_widths(self, table, widths: list):
        """Set table column widths properly using XML.

        python-docx cell.width doesn't always work, so we set widths via XML.
        """
        tbl = table._tbl
        tblPr = tbl.tblPr if tbl.tblPr is not None else OxmlElement("w:tblPr")

        # Remove existing width settings
        for old_width in tblPr.findall(qn("w:tblW")):
            tblPr.remove(old_width)

        # Set table width to auto
        tblW = OxmlElement("w:tblW")
        tblW.set(qn("w:type"), "auto")
        tblPr.append(tblW)

        if tbl.tblPr is None:
            tbl.insert(0, tblPr)

        # Set column widths using tblGrid
        tblGrid = tbl.find(qn("w:tblGrid"))
        if tblGrid is None:
            tblGrid = OxmlElement("w:tblGrid")
            tbl.insert(1, tblGrid)
        else:
            # Clear existing gridCol elements
            for col in list(tblGrid):
                tblGrid.remove(col)

        for width in widths:
            gridCol = OxmlElement("w:gridCol")
            # Convert cm to twips (1 cm = 567 twips)
            if isinstance(width, Cm):
                twips = int(width.cm * 567)
            else:
                twips = int(width * 567)
            gridCol.set(qn("w:w"), str(twips))
            tblGrid.append(gridCol)

        # Also set cell widths directly
        for row in table.rows:
            for idx, cell in enumerate(row.cells):
                if idx < len(widths):
                    width = widths[idx]
                    if isinstance(width, Cm):
                        cell.width = width
                    else:
                        cell.width = Cm(width)

    def set_run_font(self, run, font_size: int, bold: bool = False):
        """Set font properties for a run."""
        run.font.name = self.font_body
        run.font.size = Pt(font_size)
        run.font.bold = bold
        run.font.color.rgb = RGBColor(0, 0, 0)
        # Set East Asian font
        run._element.rPr.rFonts.set(qn("w:eastAsia"), self.font_body)

    # ==========================================================================
    # Table Creation Methods
    # ==========================================================================

    def create_info_table(
        self,
        doc: Document,
        section_title: str,
        rows: List[tuple],
        title_rows: int = None,
        value_bold: bool = False,
    ):
        """Create a standard info table with section header in first column.

        Args:
            doc: Document to add table to
            section_title: Title for the section (e.g., "인적사항")
            rows: List of (label, value) tuples
            title_rows: Number of rows to merge for title (default: all rows)
            value_bold: Whether to bold the value column (for company names etc.)
        """
        if not rows:
            return None

        num_rows = len(rows)
        title_rows = title_rows or num_rows

        # Create 3-column table
        table = doc.add_table(rows=num_rows, cols=3)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Set column widths - exact match to original [3.24cm, 3.50cm, 9.16cm]
        self.set_table_column_widths(table, [3.24, 3.50, 9.16])

        # Fill in the table
        for row_idx, (label, value) in enumerate(rows):
            # Section header (first column)
            cell0 = table.cell(row_idx, 0)
            if row_idx == 0:
                cell0.text = ""
                para = cell0.paragraphs[0]
                run = para.add_run(section_title)
                self.set_run_font(run, self.size_table_content, bold=True)
                para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            cell0.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

            # Label (second column)
            cell1 = table.cell(row_idx, 1)
            cell1.text = ""
            para = cell1.paragraphs[0]
            run = para.add_run(label)
            self.set_run_font(run, self.size_table_content, bold=False)
            cell1.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

            # Value (third column)
            cell2 = table.cell(row_idx, 2)
            cell2.text = ""
            para = cell2.paragraphs[0]
            value_text = str(value) if value else ""
            run = para.add_run(value_text)
            self.set_run_font(run, self.size_table_content, bold=value_bold)
            cell2.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

            # Set borders for all cells
            self.set_cell_borders(cell0)
            self.set_cell_borders(cell1)
            self.set_cell_borders(cell2)

        # Merge title cells vertically
        if num_rows > 1:
            self.merge_cells_vertically(table, 0, 0, min(title_rows - 1, num_rows - 1))

        doc.add_paragraph()  # Add spacing after table
        return table

    def create_career_table_with_bold_company(
        self, doc: Document, section_title: str, rows: List[tuple]
    ):
        """Create career table with bold company name in first row's value.

        Args:
            doc: Document to add table to
            section_title: Title for the section (e.g., "경력사항")
            rows: List of (label, value) tuples - first row value will be bold
        """
        if not rows:
            return None

        num_rows = len(rows)

        # Create 3-column table
        table = doc.add_table(rows=num_rows, cols=3)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Set column widths - exact match to original [3.24cm, 3.50cm, 9.16cm]
        self.set_table_column_widths(table, [3.24, 3.50, 9.16])

        # Fill in the table
        for row_idx, (label, value) in enumerate(rows):
            # Section header (first column)
            cell0 = table.cell(row_idx, 0)
            if row_idx == 0:
                cell0.text = ""
                para = cell0.paragraphs[0]
                run = para.add_run(section_title)
                self.set_run_font(run, self.size_table_content, bold=True)
                para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            cell0.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

            # Label (second column)
            cell1 = table.cell(row_idx, 1)
            cell1.text = ""
            para = cell1.paragraphs[0]
            run = para.add_run(label)
            self.set_run_font(run, self.size_table_content, bold=False)
            cell1.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

            # Value (third column) - first row (company name) is bold
            cell2 = table.cell(row_idx, 2)
            cell2.text = ""
            para = cell2.paragraphs[0]
            value_text = str(value) if value else ""
            is_company_row = row_idx == 0
            run = para.add_run(value_text)
            self.set_run_font(run, self.size_table_content, bold=is_company_row)
            cell2.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

            # Set borders for all cells
            self.set_cell_borders(cell0)
            self.set_cell_borders(cell1)
            self.set_cell_borders(cell2)

        # Merge title cells vertically
        if num_rows > 1:
            self.merge_cells_vertically(table, 0, 0, num_rows - 1)

        doc.add_paragraph()  # Add spacing after table
        return table

    def create_project_table(
        self,
        doc: Document,
        projects: List[Dict[str, Any]],
        section_title: str = "주요 프로젝트",
    ):
        """Create project section table in 2-column format matching original layout."""
        if not projects:
            return None

        # Create 2-column table - exact widths from original
        table = doc.add_table(rows=1, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Set column widths - exact match [2.75cm, 13.15cm]
        self.set_table_column_widths(table, [2.75, 13.15])

        # First row - section header
        cell0 = table.cell(0, 0)
        cell0.text = ""
        para = cell0.paragraphs[0]
        run = para.add_run(section_title)
        self.set_run_font(run, self.size_table_content, bold=True)
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell0.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

        # Project content cell
        cell1 = table.cell(0, 1)
        cell1.text = ""

        # Build project content
        for p_idx, project in enumerate(projects):
            if p_idx > 0:
                para = cell1.add_paragraph()
                para.paragraph_format.space_before = Pt(6)
                para.paragraph_format.space_after = Pt(6)

            # Project header
            company_info = project.get("company_name", "")
            if project.get("department"):
                company_info += f" / {project['department']}"
            if project.get("position"):
                company_info += f" / {project['position']}"

            if company_info:
                if p_idx == 0:
                    para = cell1.paragraphs[0]
                else:
                    para = cell1.add_paragraph()
                run = para.add_run(company_info)
                self.set_run_font(run, self.size_project_title, bold=True)

            # Company description
            if project.get("company_description"):
                para = cell1.add_paragraph()
                run = para.add_run(f"회사 소개: {project['company_description']}")
                self.set_run_font(run, self.size_table_content, bold=False)

            # Project name with period
            para = cell1.add_paragraph()
            period = (
                f"{project.get('start_date', '')} ~ {project.get('end_date', '진행중')}"
            )
            project_line = f"프로젝트: {project.get('name', '')} ({period})"
            run = para.add_run(project_line)
            self.set_run_font(run, self.size_table_content, bold=True)

            # Role
            if project.get("role"):
                para = cell1.add_paragraph()
                run = para.add_run(f"역할: {project['role']}")
                self.set_run_font(run, self.size_table_content, bold=False)

            # Technologies
            if project.get("technologies"):
                para = cell1.add_paragraph()
                run = para.add_run(f"기술스택: {project['technologies']}")
                self.set_run_font(run, self.size_table_content, bold=False)

            # Description (strip any markdown syntax)
            if project.get("description"):
                clean_desc = _strip_markdown(project["description"])
                if clean_desc:
                    para = cell1.add_paragraph()
                    run = para.add_run(clean_desc)
                    self.set_run_font(run, self.size_table_content, bold=False)

            # Key tasks
            key_tasks = project.get("key_tasks", [])
            if key_tasks:
                para = cell1.add_paragraph()
                para.paragraph_format.space_before = Pt(3)
                run = para.add_run("주요 수행 업무:")
                self.set_run_font(run, self.size_table_content, bold=True)

                for task in key_tasks:
                    clean_task = _strip_markdown(str(task))
                    if clean_task:
                        para = cell1.add_paragraph()
                        run = para.add_run(f"• {clean_task}")
                        self.set_run_font(run, self.size_table_content, bold=False)

            # Achievements
            self._add_achievements_to_cell(cell1, project)

        # Set borders for all cells
        for row in table.rows:
            for cell in row.cells:
                self.set_cell_borders(cell)

        doc.add_paragraph()
        return table

    def _add_achievements_to_cell(self, cell, project: Dict[str, Any]):
        """Add achievements section to a cell, grouped by category."""

        achievements_detailed = project.get("achievements_detailed_list", [])
        achievements_summary = project.get("achievements_summary_list", [])

        use_detailed = achievements_detailed and len(achievements_detailed) > 0
        achievements_list = (
            achievements_detailed if use_detailed else achievements_summary
        )

        if not achievements_list:
            achievements_list = project.get("achievements", [])

        if not achievements_list:
            return

        para = cell.add_paragraph()
        para.paragraph_format.space_before = Pt(3)
        run = para.add_run("성과:")
        self.set_run_font(run, self.size_table_content, bold=True)

        # Group dict achievements by category
        if achievements_list and isinstance(achievements_list[0], dict):
            grouped = OrderedDict()
            for ach in achievements_list:
                category = ach.get("category", ach.get("metric_name", "성과"))
                title = ach.get("title", ach.get("metric_value", ""))
                description = ach.get("description", "")
                if category not in grouped:
                    grouped[category] = []
                grouped[category].append({"title": title, "description": description})

            for category, items in grouped.items():
                # Category header (bold)
                para = cell.add_paragraph()
                run = para.add_run(f"[{category}]")
                self.set_run_font(run, self.size_table_content, bold=True)

                for item in items:
                    title = item["title"].replace("**", "")
                    if title:
                        para = cell.add_paragraph()
                        para.paragraph_format.left_indent = Pt(12)
                        run = para.add_run(f"• {title}")
                        self.set_run_font(run, self.size_table_content, bold=False)

                        if use_detailed and item.get("description"):
                            desc = item["description"].replace("**", "")
                            para = cell.add_paragraph()
                            para.paragraph_format.left_indent = Pt(24)
                            run = para.add_run(f"→ {desc}")
                            self.set_run_font(
                                run, self.size_table_content - 1, bold=False
                            )
        else:
            for ach in achievements_list:
                ach_text = str(ach).replace("**", "")
                para = cell.add_paragraph()
                run = para.add_run(f"• {ach_text}")
                self.set_run_font(run, self.size_table_content, bold=False)

    def create_skills_table(
        self,
        doc: Document,
        skills_data: Dict[str, str],
        section_title: str = "기술스택",
    ):
        """Create skills table matching original format.

        Original format: 2 rows x 3 cols with widths [3.24cm, 4.51cm, 8.15cm]
        """
        if not skills_data:
            return None

        # Build content based on available data
        prog_lang = skills_data.get("programming_languages", "")
        frameworks = skills_data.get("frameworks", "")
        databases = skills_data.get("databases", "")
        cloud = skills_data.get("cloud", "") or skills_data.get("devops", "")
        tools = skills_data.get("tools", "") or skills_data.get("tooling", "")

        # Combine values for each row
        row1_label = "Programing Languages\nFramework"
        row1_value = ""
        if prog_lang:
            row1_value = prog_lang
        if frameworks:
            if row1_value:
                row1_value += "\n" + frameworks
            else:
                row1_value = frameworks

        row2_label = "Server Tooling/DevOps\nEnvironment"
        row2_value = ""
        if cloud:
            row2_value = cloud
        if tools:
            if row2_value:
                row2_value += "\n" + tools
            else:
                row2_value = tools
        if databases:
            if row2_value:
                row2_value += "\n" + databases
            else:
                row2_value = databases

        if not row1_value and not row2_value:
            return None

        num_rows = 0
        if row1_value:
            num_rows += 1
        if row2_value:
            num_rows += 1

        if num_rows == 0:
            return None

        table = doc.add_table(rows=num_rows, cols=3)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Set column widths for skills table [3.24cm, 4.51cm, 8.15cm]
        self.set_table_column_widths(table, [3.24, 4.51, 8.15])

        row_idx = 0

        if row1_value:
            self._fill_skills_row(
                table, row_idx, section_title, row1_label, row1_value, row_idx == 0
            )
            row_idx += 1

        if row2_value:
            self._fill_skills_row(
                table, row_idx, section_title, row2_label, row2_value, row_idx == 0
            )

        # Merge section header cells vertically if multiple rows
        if num_rows > 1:
            self.merge_cells_vertically(table, 0, 0, num_rows - 1)

        doc.add_paragraph()
        return table

    def _fill_skills_row(
        self,
        table,
        row_idx: int,
        section_title: str,
        label: str,
        value: str,
        add_title: bool,
    ):
        """Fill a single row in skills table."""
        cell0 = table.cell(row_idx, 0)
        if add_title:
            cell0.text = ""
            para = cell0.paragraphs[0]
            run = para.add_run(section_title)
            self.set_run_font(run, self.size_table_content, bold=True)
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell0.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

        cell1 = table.cell(row_idx, 1)
        cell1.text = ""
        para = cell1.paragraphs[0]
        run = para.add_run(label)
        self.set_run_font(run, self.size_table_content, bold=False)
        cell1.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

        cell2 = table.cell(row_idx, 2)
        cell2.text = ""
        para = cell2.paragraphs[0]
        run = para.add_run(value)
        self.set_run_font(run, self.size_table_content, bold=False)
        cell2.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

        self.set_cell_borders(cell0)
        self.set_cell_borders(cell1)
        self.set_cell_borders(cell2)
