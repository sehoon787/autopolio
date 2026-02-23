"""
Mustache Template Helpers - Render or clean Mustache syntax from text

Provides utilities for handling Mustache template syntax in export content.
"""

import re
from typing import Optional

try:
    import chevron
except ImportError:
    chevron = None


def render_or_clean_mustache(text: str, context: Optional[dict] = None) -> str:
    """Render Mustache template syntax or clean it from text

    Handles cases like:
    - {{key_tasks}} -> renders with context or removes
    - {{#achievements}}...{{/achievements}} -> renders loop or removes section

    Args:
        text: Text that may contain Mustache syntax
        context: Data context for rendering (e.g., project dict)

    Returns:
        Cleaned text with Mustache syntax rendered or removed
    """
    if not text:
        return ""

    # Check if text contains Mustache syntax
    if "{{" not in text:
        return text

    # Try to render with chevron if available and context provided
    if chevron and context:
        try:
            rendered = chevron.render(text, context)
            # Clean up any remaining empty lines from unresolved sections
            lines = [line for line in rendered.split("\n") if line.strip()]
            return "\n".join(lines)
        except Exception:
            pass

    # Fallback: Remove Mustache syntax patterns
    result = _clean_mustache_syntax(text)
    return result.strip()


def _clean_mustache_syntax(text: str) -> str:
    """Remove all Mustache syntax patterns from text

    Args:
        text: Text containing Mustache syntax

    Returns:
        Text with all Mustache syntax removed
    """
    # Remove section blocks: {{#section}}...{{/section}} (including multiline)
    result = re.sub(r"\{\{[#^]\w+\}\}.*?\{\{/\w+\}\}", "", text, flags=re.DOTALL)

    # Remove unclosed/malformed section blocks: {{#section}}... or {{/section}}
    result = re.sub(r"\{\{[#^/]\w+\}\}", "", result)

    # Remove single variables: {{variable}}, {{&variable}}, {{{variable}}}
    result = re.sub(r"\{{2,3}[&]?\w+\}{2,3}", "", result)

    # Remove partial includes: {{>partial}}
    result = re.sub(r"\{\{>\w+\}\}", "", result)

    # Remove any remaining {{ or }} fragments
    result = re.sub(r"\{\{[^}]*\}?\}?", "", result)

    # Clean up lines that only have bullet points or headers without content
    lines = []
    for line in result.split("\n"):
        stripped = line.strip()
        # Skip empty lines and lines with only bullet point markers
        if stripped and stripped not in ["", "-", "*", "####", "###", "##", "#"]:
            # Skip lines that are just headers with no following content
            if stripped.startswith("#") and ":" not in stripped and len(stripped) < 50:
                continue
            lines.append(line)

    # Clean up multiple consecutive empty lines
    result = "\n".join(lines)
    result = re.sub(r"\n\s*\n\s*\n", "\n\n", result)

    return result
