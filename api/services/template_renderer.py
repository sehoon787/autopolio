"""
Template Renderer - Mustache-based template rendering for platform templates
"""

from typing import Dict, Any
from datetime import datetime

try:
    import chevron
except ImportError:
    chevron = None


class TemplateRenderer:
    """Handles template rendering with Mustache syntax"""

    def render(self, html_content: str, data: Dict[str, Any]) -> str:
        """
        Render a template with Mustache syntax using chevron

        Args:
            html_content: HTML template with Mustache placeholders
            data: Data to fill in the template

        Returns:
            Rendered HTML string
        """
        if not html_content:
            return ""

        # Add generated_date if not provided
        if "generated_date" not in data:
            data["generated_date"] = datetime.now().strftime("%Y-%m-%d")

        # Process list lengths for conditional rendering
        for key in ["experiences", "projects", "educations", "certifications"]:
            if key in data and data[key]:
                data[f"{key}.length"] = len(data[key]) > 0

        # Handle skills object
        if "skills" in data and data["skills"]:
            skills = data["skills"]
            for skill_key in ["languages", "frameworks", "databases", "tools"]:
                if skill_key in skills and skills[skill_key]:
                    skills[f"{skill_key}.length"] = len(skills[skill_key]) > 0

        # Use chevron for Mustache rendering if available
        if chevron:
            try:
                return chevron.render(html_content, data)
            except Exception:
                # Fallback to simple replacement
                return self._simple_render(html_content, data)
        else:
            return self._simple_render(html_content, data)

    def _simple_render(self, html_content: str, data: Dict[str, Any]) -> str:
        """Simple template rendering (fallback when chevron is not available)"""
        result = html_content

        # Simple variable replacement {{variable}}
        for key, value in data.items():
            if isinstance(value, str):
                result = result.replace(f"{{{{{key}}}}}", value)
            elif value is None:
                result = result.replace(f"{{{{{key}}}}}", "")

        return result


# Singleton instance for convenience
_renderer = TemplateRenderer()


def render_template(html_content: str, data: Dict[str, Any]) -> str:
    """Convenience function for template rendering"""
    return _renderer.render(html_content, data)
