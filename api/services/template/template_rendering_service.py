"""
Template Rendering Service - Handles Mustache-like template rendering.

Extracted from api/routers/templates.py in v1.12 refactoring.

Supports:
- Simple field replacement: {{field}}
- Section iteration: {{#section}}...{{/section}}
- Boolean conditionals: {{#has_field}}...{{/has_field}}
- Nested sections
"""

import re
import logging
from typing import List, Dict, Any, Tuple

logger = logging.getLogger(__name__)


class TemplateRenderingService:
    """Service for rendering Mustache-like templates."""

    def __init__(self):
        self.field_pattern = r"\{\{([^}]+)\}\}"
        self.section_pattern = r"\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}"

    def extract_fields(self, template_content: str) -> List[str]:
        """Extract all field names used in a template.

        Args:
            template_content: Template string with {{field}} placeholders

        Returns:
            List of unique field names
        """
        return list(set(re.findall(self.field_pattern, template_content)))

    def render_section_item(self, item_text: str, item_data: dict) -> str:
        """Render a single section item with boolean and nested list handling.

        Args:
            item_text: Template text for the section item
            item_data: Data dictionary for the item

        Returns:
            Rendered text for the item
        """
        result = item_text

        # First handle boolean conditionals (e.g., {{#has_description}}...{{/has_description}})
        for key, value in item_data.items():
            if isinstance(value, bool):
                bool_pattern = rf"\{{\{{#{key}\}}\}}(.*?)\{{\{{/{key}\}}\}}"
                if value:
                    result = re.sub(bool_pattern, r"\1", result, flags=re.DOTALL)
                else:
                    result = re.sub(bool_pattern, "", result, flags=re.DOTALL)

        # Handle nested list sections (e.g., achievements_detailed_list inside projects)
        for key, value in item_data.items():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                nested_pattern = rf"\{{\{{#{key}\}}\}}(.*?)\{{\{{/{key}\}}\}}"
                nested_match = re.search(nested_pattern, result, flags=re.DOTALL)
                if nested_match:
                    nested_template = nested_match.group(1)
                    nested_output = []
                    for nested_item in value:
                        nested_text = self.render_section_item(
                            nested_template, nested_item
                        )
                        # Replace simple placeholders
                        for nkey, nvalue in nested_item.items():
                            if not isinstance(nvalue, (list, dict, bool)):
                                nested_text = nested_text.replace(
                                    f"{{{{{nkey}}}}}", str(nvalue) if nvalue else ""
                                )
                        nested_output.append(nested_text.strip())
                    result = re.sub(
                        nested_pattern,
                        "\n".join(nested_output),
                        result,
                        flags=re.DOTALL,
                    )

        # Replace simple field placeholders
        for key, value in item_data.items():
            if isinstance(value, list):
                if value and not isinstance(value[0], dict):
                    value = ", ".join(str(v) for v in value)
                else:
                    continue  # Already handled above
            elif isinstance(value, bool):
                continue  # Already handled above
            result = result.replace(f"{{{{{key}}}}}", str(value) if value else "")

        return result

    def render_template(
        self, template_content: str, data: Dict[str, Any], max_nesting_levels: int = 3
    ) -> Tuple[str, List[str]]:
        """Render a Mustache-like template with data.

        Args:
            template_content: Template string with Mustache-like syntax
            data: Data dictionary for rendering
            max_nesting_levels: Maximum levels of nested sections to process

        Returns:
            Tuple of (rendered_text, list of fields used)
        """
        fields_used = self.extract_fields(template_content)
        preview_text = template_content

        # Process sections FIRST (must happen before simple field replacement)
        # Process multiple times to handle nested sections
        for _ in range(max_nesting_levels):
            section_matches = list(
                re.finditer(self.section_pattern, preview_text, re.DOTALL)
            )
            if not section_matches:
                break

            for match in section_matches:
                section_name = match.group(1)
                section_template = match.group(2)

                if section_name in data and isinstance(data[section_name], list):
                    section_output = []
                    for item in data[section_name]:
                        item_text = self.render_section_item(section_template, item)
                        section_output.append(item_text)
                    preview_text = preview_text.replace(
                        match.group(0), "".join(section_output), 1
                    )
                elif section_name in data and isinstance(data[section_name], bool):
                    # Handle boolean conditional sections
                    if data[section_name]:
                        preview_text = preview_text.replace(
                            match.group(0), section_template, 1
                        )
                    else:
                        preview_text = preview_text.replace(match.group(0), "", 1)
                else:
                    preview_text = preview_text.replace(
                        match.group(0), f"[{section_name} 항목 없음]", 1
                    )

        # NOW replace simple fields (after section processing)
        for field in fields_used:
            if field.startswith("#") or field.startswith("/"):
                continue
            value = data.get(field, f"[{field}]")
            if isinstance(value, (list, dict)):
                value = str(value)
            preview_text = preview_text.replace(f"{{{{{field}}}}}", str(value))

        return preview_text, fields_used

    def render_to_html(
        self, template_content: str, data: Dict[str, Any]
    ) -> Tuple[str, str, List[str]]:
        """Render template and convert to HTML.

        Args:
            template_content: Template string with Mustache-like syntax
            data: Data dictionary for rendering

        Returns:
            Tuple of (html_output, text_output, fields_used)
        """
        import markdown

        preview_text, fields_used = self.render_template(template_content, data)

        # Convert markdown to HTML for preview
        try:
            preview_html = markdown.markdown(
                preview_text, extensions=["tables", "fenced_code"]
            )
        except Exception:
            preview_html = f"<pre>{preview_text}</pre>"

        return preview_html, preview_text, fields_used


# Default sample data for template preview
DEFAULT_SAMPLE_DATA = {
    "name": "홍길동",
    "email": "hong@example.com",
    "github_username": "honggildong",
    "summary": "5년차 풀스택 개발자입니다.",
    "skills": "React, TypeScript, Python, FastAPI, PostgreSQL",
    "companies": [
        {
            "name": "테크 스타트업",
            "position": "시니어 개발자",
            "department": "개발팀",
            "start_date": "2022.01",
            "end_date": "현재",
            "description": "웹 서비스 개발 및 팀 리드",
        }
    ],
    "projects": [
        {
            "name": "이커머스 플랫폼",
            "short_description": "B2C 이커머스 서비스",
            "description": "대규모 이커머스 플랫폼 개발",
            "role": "백엔드 리드",
            "team_size": 5,
            "contribution_percent": 40,
            "start_date": "2023.01",
            "end_date": "2023.12",
            "technologies": "FastAPI, PostgreSQL, Redis",
            "achievements": [
                {
                    "metric_name": "성능 향상",
                    "metric_value": "40% 개선",
                    "description": "API 응답 시간 최적화",
                }
            ],
            "achievements_summary_list": [
                {"category": "성능 향상", "title": "40% 개선"},
                {"category": "기능 개발", "title": "주문 시스템 구축"},
                {"category": "코드 품질", "title": "테스트 커버리지 85%"},
            ],
            "achievements_detailed_list": [
                {
                    "category": "성능 향상",
                    "title": "40% 개선",
                    "description": "API 응답 시간 최적화",
                    "has_description": True,
                },
                {
                    "category": "기능 개발",
                    "title": "주문 시스템 구축",
                    "description": "실시간 재고 관리 및 결제 시스템 구현",
                    "has_description": True,
                },
                {
                    "category": "코드 품질",
                    "title": "테스트 커버리지 85%",
                    "description": "",
                    "has_description": False,
                },
            ],
            "links": {"github": "https://github.com/example"},
        }
    ],
}
