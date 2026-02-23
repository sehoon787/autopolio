"""
DOCX Style Configuration - Configurable styles for Word document generation

Provides centralized styling for:
- Title (대제목): 24pt
- Heading1 (중제목): 18pt
- Heading2 (소제목): 14pt
- Heading3 (소소제목): 12pt
- Normal (본문): 11pt
- Bullet (목록): 11pt
"""

from dataclasses import dataclass, field
from typing import Optional
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


@dataclass
class FontStyle:
    """Individual font style configuration"""

    size: int = 11  # in points
    bold: bool = False
    italic: bool = False
    color: tuple = (0, 0, 0)  # RGB tuple (black)

    @property
    def pt_size(self) -> Pt:
        """Get size as Pt object"""
        return Pt(self.size)

    @property
    def rgb_color(self) -> RGBColor:
        """Get color as RGBColor object"""
        return RGBColor(*self.color)


@dataclass
class DocxStyleConfig:
    """Configuration for DOCX document styles

    All text colors default to black for professional appearance.
    Font sizes follow a clear hierarchy:
    - Title (대제목): 24pt - Document title
    - Heading1 (중제목): 18pt - Major sections
    - Heading2 (소제목): 14pt - Sub-sections
    - Heading3 (소소제목): 12pt - Minor sections
    - Normal (본문): 11pt - Body text
    - Bullet (목록): 11pt - List items
    """

    # Font name (Korean-friendly)
    font_name: str = "Malgun Gothic"

    # Title style (대제목) - e.g., document title, report name
    title: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=24,
            bold=True,
            color=(0, 0, 0),  # Black
        )
    )

    # Heading1 style (중제목) - e.g., "경력", "프로젝트", "기술스택"
    heading1: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=18,
            bold=True,
            color=(0, 0, 0),  # Black
        )
    )

    # Heading2 style (소제목) - e.g., company name, project name
    heading2: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=14,
            bold=True,
            color=(0, 0, 0),  # Black
        )
    )

    # Heading3 style (소소제목) - e.g., sub-sections within projects
    heading3: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=12,
            bold=True,
            color=(0, 0, 0),  # Black
        )
    )

    # Normal text style (본문)
    normal: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=11,
            bold=False,
            color=(0, 0, 0),  # Black
        )
    )

    # Bullet list item style (목록)
    bullet: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=11,
            bold=False,
            color=(0, 0, 0),  # Black
        )
    )

    # Bold text style (강조)
    bold_text: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=11,
            bold=True,
            color=(0, 0, 0),  # Black
        )
    )

    # Subtitle style (부제목) - e.g., position, role
    subtitle: FontStyle = field(
        default_factory=lambda: FontStyle(
            size=14,
            bold=True,
            color=(0, 0, 0),  # Black
        )
    )


# Default configuration instance
DEFAULT_DOCX_STYLE = DocxStyleConfig()


def create_style_config_from_settings(settings: dict) -> DocxStyleConfig:
    """Create a DocxStyleConfig from template style_settings dict

    Expected settings keys:
    - font_name: str (default: "Malgun Gothic")
    - title_size: int (default: 24)
    - heading1_size: int (default: 18)
    - heading2_size: int (default: 14)
    - heading3_size: int (default: 12)
    - normal_size: int (default: 11)

    Args:
        settings: Dict with style settings from template

    Returns:
        DocxStyleConfig instance with custom settings
    """
    if not settings:
        return DEFAULT_DOCX_STYLE

    font_name = settings.get("font_name", "Malgun Gothic")
    title_size = settings.get("title_size", 24)
    heading1_size = settings.get("heading1_size", 18)
    heading2_size = settings.get("heading2_size", 14)
    heading3_size = settings.get("heading3_size", 12)
    normal_size = settings.get("normal_size", 11)

    return DocxStyleConfig(
        font_name=font_name,
        title=FontStyle(size=title_size, bold=True, color=(0, 0, 0)),
        heading1=FontStyle(size=heading1_size, bold=True, color=(0, 0, 0)),
        heading2=FontStyle(size=heading2_size, bold=True, color=(0, 0, 0)),
        heading3=FontStyle(size=heading3_size, bold=True, color=(0, 0, 0)),
        normal=FontStyle(size=normal_size, bold=False, color=(0, 0, 0)),
        bullet=FontStyle(size=normal_size, bold=False, color=(0, 0, 0)),
        bold_text=FontStyle(size=normal_size, bold=True, color=(0, 0, 0)),
        subtitle=FontStyle(size=heading2_size, bold=True, color=(0, 0, 0)),
    )


class DocxStyler:
    """Helper class to apply styles to Word documents

    Usage:
        styler = DocxStyler()
        styler.add_title(doc, "이력서")
        styler.add_heading1(doc, "경력사항")
        styler.add_heading2(doc, "회사명")
        styler.add_paragraph(doc, "본문 내용")
        styler.add_bullet(doc, "목록 항목")
    """

    def __init__(self, config: Optional[DocxStyleConfig] = None):
        self.config = config or DEFAULT_DOCX_STYLE

    def setup_document(self, doc) -> None:
        """Set up default document styles

        Args:
            doc: python-docx Document object
        """
        # Set Normal style as base
        style = doc.styles["Normal"]
        font = style.font
        font.name = self.config.font_name
        font.size = self.config.normal.pt_size
        font.color.rgb = self.config.normal.rgb_color

        # Configure heading styles to use black color
        self._configure_heading_styles(doc)

    def _configure_heading_styles(self, doc) -> None:
        """Configure heading styles to remove default colors"""
        heading_configs = [
            ("Heading 1", self.config.heading1),
            ("Heading 2", self.config.heading2),
            ("Heading 3", self.config.heading3),
        ]

        for style_name, font_config in heading_configs:
            try:
                style = doc.styles[style_name]
                font = style.font
                font.name = self.config.font_name
                font.size = font_config.pt_size
                font.bold = font_config.bold
                font.color.rgb = font_config.rgb_color
            except KeyError:
                # Style doesn't exist, skip
                pass

    def add_title(self, doc, text: str, center: bool = True):
        """Add a title (대제목) to the document

        Args:
            doc: python-docx Document object
            text: Title text
            center: Whether to center the title

        Returns:
            Paragraph object
        """
        para = doc.add_paragraph()
        run = para.add_run(text)
        run.bold = self.config.title.bold
        run.font.size = self.config.title.pt_size
        run.font.name = self.config.font_name
        run.font.color.rgb = self.config.title.rgb_color

        if center:
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        return para

    def add_heading1(self, doc, text: str):
        """Add a heading1 (중제목) to the document

        Args:
            doc: python-docx Document object
            text: Heading text

        Returns:
            Paragraph object
        """
        # Use add_heading but override the color
        para = doc.add_heading(text, level=1)

        # Override the default color to black
        for run in para.runs:
            run.font.color.rgb = self.config.heading1.rgb_color
            run.font.size = self.config.heading1.pt_size
            run.font.name = self.config.font_name

        return para

    def add_heading2(self, doc, text: str):
        """Add a heading2 (소제목) to the document

        Args:
            doc: python-docx Document object
            text: Heading text

        Returns:
            Paragraph object
        """
        para = doc.add_heading(text, level=2)

        # Override the default color to black
        for run in para.runs:
            run.font.color.rgb = self.config.heading2.rgb_color
            run.font.size = self.config.heading2.pt_size
            run.font.name = self.config.font_name

        return para

    def add_heading3(self, doc, text: str):
        """Add a heading3 (소소제목) to the document

        Args:
            doc: python-docx Document object
            text: Heading text

        Returns:
            Paragraph object
        """
        para = doc.add_heading(text, level=3)

        # Override the default color to black
        for run in para.runs:
            run.font.color.rgb = self.config.heading3.rgb_color
            run.font.size = self.config.heading3.pt_size
            run.font.name = self.config.font_name

        return para

    def add_section_title(self, doc, text: str):
        """Add a section title (bold, normal size) - for items like "[프로젝트 1]"

        Args:
            doc: python-docx Document object
            text: Title text

        Returns:
            Paragraph object
        """
        para = doc.add_paragraph()
        run = para.add_run(text)
        run.bold = True
        run.font.size = self.config.bold_text.pt_size
        run.font.name = self.config.font_name
        run.font.color.rgb = self.config.bold_text.rgb_color

        return para

    def add_paragraph(self, doc, text: str):
        """Add a normal paragraph to the document

        Args:
            doc: python-docx Document object
            text: Paragraph text

        Returns:
            Paragraph object
        """
        para = doc.add_paragraph()
        run = para.add_run(text)
        run.font.size = self.config.normal.pt_size
        run.font.name = self.config.font_name
        run.font.color.rgb = self.config.normal.rgb_color

        return para

    def add_bullet(self, doc, text: str):
        """Add a bullet list item to the document

        Args:
            doc: python-docx Document object
            text: Bullet item text

        Returns:
            Paragraph object
        """
        para = doc.add_paragraph(text, style="List Bullet")

        # Apply styling to runs
        for run in para.runs:
            run.font.size = self.config.bullet.pt_size
            run.font.name = self.config.font_name
            run.font.color.rgb = self.config.bullet.rgb_color

        return para

    def add_key_value(self, doc, key: str, value: str, as_bullet: bool = False):
        """Add a key-value pair (e.g., "기간: 2024.01 ~ 2024.06")

        Args:
            doc: python-docx Document object
            key: Key text (will be bold)
            value: Value text
            as_bullet: Whether to format as a bullet point

        Returns:
            Paragraph object
        """
        if as_bullet:
            para = doc.add_paragraph(style="List Bullet")
        else:
            para = doc.add_paragraph()

        # Add bold key
        key_run = para.add_run(key)
        key_run.bold = True
        key_run.font.size = self.config.normal.pt_size
        key_run.font.name = self.config.font_name
        key_run.font.color.rgb = self.config.normal.rgb_color

        # Add value
        if value:
            value_run = para.add_run(f": {value}")
            value_run.font.size = self.config.normal.pt_size
            value_run.font.name = self.config.font_name
            value_run.font.color.rgb = self.config.normal.rgb_color

        return para

    def add_bold_text(self, doc, text: str):
        """Add bold text paragraph

        Args:
            doc: python-docx Document object
            text: Text to make bold

        Returns:
            Paragraph object
        """
        para = doc.add_paragraph()
        run = para.add_run(text)
        run.bold = True
        run.font.size = self.config.bold_text.pt_size
        run.font.name = self.config.font_name
        run.font.color.rgb = self.config.bold_text.rgb_color

        return para

    def add_subtitle(self, doc, text: str, center: bool = True):
        """Add a subtitle to the document

        Args:
            doc: python-docx Document object
            text: Subtitle text
            center: Whether to center the subtitle

        Returns:
            Paragraph object
        """
        para = doc.add_paragraph()
        run = para.add_run(text)
        run.bold = self.config.subtitle.bold
        run.font.size = self.config.subtitle.pt_size
        run.font.name = self.config.font_name
        run.font.color.rgb = self.config.subtitle.rgb_color

        if center:
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        return para

    def add_contact_info(self, doc, parts: list, center: bool = True):
        """Add contact information line

        Args:
            doc: python-docx Document object
            parts: List of contact info strings (email, phone, etc.)
            center: Whether to center the line

        Returns:
            Paragraph object
        """
        if not parts:
            return None

        para = doc.add_paragraph()
        run = para.add_run(" | ".join(parts))
        run.font.size = self.config.normal.pt_size
        run.font.name = self.config.font_name
        run.font.color.rgb = self.config.normal.rgb_color

        if center:
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        return para

    def add_spacing(self, doc):
        """Add an empty paragraph for spacing

        Args:
            doc: python-docx Document object

        Returns:
            Paragraph object
        """
        return doc.add_paragraph()
