"""
Document Template Helpers - Template rendering and data preparation utilities.

Provides functions for template rendering, data flattening, and skill categorization.
"""
from typing import Dict, List, Any
from datetime import datetime
import re


def flatten_dict(d: Dict, parent_key: str = '', sep: str = '.') -> Dict:
    """Flatten nested dictionary."""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def render_template(template: str, data: Dict[str, Any]) -> str:
    """Render template with data (simple mustache-like syntax)."""
    result = template

    # Handle simple variables {{variable}}
    for key, value in flatten_dict(data).items():
        placeholder = f"{{{{{key}}}}}"
        if isinstance(value, list):
            # If it's a list of simple strings, render as bullet points
            if all(isinstance(v, str) for v in value):
                value = "\n".join(f"- {v}" for v in value) if value else ""
            else:
                # For lists of dicts, just convert to string (sections handle these)
                value = ", ".join(str(v) for v in value)
        elif value is None:
            value = ""
        result = result.replace(placeholder, str(value))

    # Handle sections {{#section}}...{{/section}}
    result = render_sections(result, data)

    return result


def render_sections(template: str, data: Dict[str, Any]) -> str:
    """Render section loops in template with recursive support for nested sections."""
    # Pattern for sections: {{#section}}...{{/section}}
    # Using non-greedy matching for innermost sections first
    section_pattern = r'\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}'

    def render_item(item_data: Dict[str, Any], content: str) -> str:
        """Recursively render a single item with its nested sections."""
        result = content

        # First, handle boolean conditional sections at the current item level
        # e.g., {{#has_description}}...{{/has_description}}
        for key, value in item_data.items():
            if isinstance(value, bool):
                bool_pattern = rf'\{{\{{#{key}\}}\}}(.*?)\{{\{{/{key}\}}\}}'
                if value:
                    # True - keep the content inside
                    result = re.sub(bool_pattern, r'\1', result, flags=re.DOTALL)
                else:
                    # False - remove the entire section
                    result = re.sub(bool_pattern, '', result, flags=re.DOTALL)

        # Then, recursively process any nested sections within this item
        for key, value in item_data.items():
            if isinstance(value, list) and len(value) > 0 and isinstance(value[0], dict):
                # This is a nested section (like achievements inside projects)
                nested_pattern = rf'\{{\{{#{key}\}}\}}(.*?)\{{\{{/{key}\}}\}}'
                nested_match = re.search(nested_pattern, result, flags=re.DOTALL)
                if nested_match:
                    nested_content = nested_match.group(1)
                    nested_rendered = []
                    for nested_item in value:
                        nested_item_content = nested_content
                        # First handle boolean conditional sections
                        for nkey, nvalue in nested_item.items():
                            if isinstance(nvalue, bool):
                                bool_pattern = rf'\{{\{{#{nkey}\}}\}}(.*?)\{{\{{/{nkey}\}}\}}'
                                if nvalue:
                                    # True - keep the content inside
                                    nested_item_content = re.sub(
                                        bool_pattern, r'\1', nested_item_content, flags=re.DOTALL
                                    )
                                else:
                                    # False - remove the entire section
                                    nested_item_content = re.sub(
                                        bool_pattern, '', nested_item_content, flags=re.DOTALL
                                    )
                        # Then replace simple placeholders
                        for nkey, nvalue in nested_item.items():
                            placeholder = f"{{{{{nkey}}}}}"
                            nested_item_content = nested_item_content.replace(
                                placeholder,
                                str(nvalue if nvalue is not None and not isinstance(nvalue, bool) else '')
                            )
                        nested_rendered.append(nested_item_content.strip())
                    result = re.sub(
                        nested_pattern, '\n'.join(nested_rendered), result, flags=re.DOTALL
                    )

        # Then replace simple field placeholders
        for key, value in item_data.items():
            placeholder = f"{{{{{key}}}}}"
            if isinstance(value, list):
                # Convert list to bullet points for simple string lists
                if value and all(isinstance(v, str) for v in value):
                    list_str = "\n".join(f"- {v}" for v in value)
                    result = result.replace(placeholder, list_str)
                elif not value:
                    # Empty list - remove placeholder
                    result = result.replace(placeholder, "")
                # Lists of dicts are handled by nested section logic above
            elif not isinstance(value, dict):
                result = result.replace(placeholder, str(value or ''))

        return result

    def replace_section(match):
        section_name = match.group(1)
        section_content = match.group(2)

        items = data.get(section_name, [])
        if not isinstance(items, list):
            items = [items] if items else []

        rendered_items = []
        for item in items:
            if isinstance(item, dict):
                item_content = render_item(item, section_content)
            else:
                item_content = section_content.replace("{{.}}", str(item))
            rendered_items.append(item_content.strip())

        return "\n".join(rendered_items)

    # Apply section replacement - may need multiple passes for complex nesting
    result = template
    prev_result = None
    max_iterations = 10  # Prevent infinite loops
    iterations = 0

    while result != prev_result and iterations < max_iterations:
        prev_result = result
        result = re.sub(section_pattern, replace_section, result, flags=re.DOTALL)
        iterations += 1

    return result


def categorize_skills(projects: List[Dict[str, Any]]) -> Dict[str, str]:
    """Categorize skills from projects into predefined categories."""
    # Skill category mappings
    categories = {
        "programming_languages": {
            "Python", "JavaScript", "TypeScript", "Java", "Kotlin", "Go", "Rust",
            "C", "C++", "C#", "PHP", "Ruby", "Swift", "Dart", "Scala", "R",
            "MATLAB", "Perl", "Shell", "Bash", "PowerShell", "SQL", "HTML", "CSS"
        },
        "frameworks": {
            "React", "Vue", "Angular", "Next.js", "Nuxt.js", "Svelte", "Django",
            "Flask", "FastAPI", "Spring", "Spring Boot", "Express", "NestJS",
            "Rails", "Laravel", "ASP.NET", "Flutter", "React Native", "Electron",
            "Tailwind CSS", "Bootstrap", "Material-UI", "MUI", "Ant Design",
            "Redux", "MobX", "Zustand", "TanStack Query", "jQuery"
        },
        "databases": {
            "PostgreSQL", "MySQL", "MariaDB", "MongoDB", "Redis", "SQLite",
            "Oracle", "SQL Server", "DynamoDB", "Cassandra", "Elasticsearch",
            "InfluxDB", "Neo4j", "Firebase", "Supabase", "CockroachDB"
        },
        "tools": {
            "Git", "GitHub", "GitLab", "Bitbucket", "Docker", "Kubernetes",
            "Jenkins", "CircleCI", "GitHub Actions", "Terraform", "Ansible",
            "Webpack", "Vite", "Babel", "ESLint", "Prettier", "Jest", "Pytest",
            "Playwright", "Cypress", "Selenium", "Postman", "Swagger", "Grafana",
            "Prometheus", "Nginx", "Apache", "VS Code", "IntelliJ", "Figma"
        },
        "cloud": {
            "AWS", "GCP", "Google Cloud", "Azure", "Heroku", "Vercel", "Netlify",
            "DigitalOcean", "Cloudflare", "Firebase", "Supabase", "Render"
        }
    }

    result = {cat: set() for cat in categories}

    for project in projects:
        techs = project.get("technologies", [])
        if isinstance(techs, str):
            techs = [t.strip() for t in techs.split(",")]

        for tech in techs:
            tech_normalized = tech.strip()
            for category, keywords in categories.items():
                if tech_normalized in keywords:
                    result[category].add(tech_normalized)
                    break

    return {cat: ", ".join(sorted(skills)) for cat, skills in result.items()}


def build_project_company_data(
    projects: List[Dict[str, Any]],
    companies: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Build project data enriched with company info."""
    # Build company lookup by ID
    company_lookup = {c.get("id"): c for c in companies if c.get("id")}

    enriched_projects = []
    for p in projects:
        # Get company info for project
        company_id = p.get("company_id")
        company = company_lookup.get(company_id, {}) if company_id else {}

        # Use achievements_summary_list as default (title only, no description)
        # achievements_detailed_list is kept for templates that need description
        raw_achievements = p.get("achievements", [])
        achievements_summary_list = p.get("achievements_summary_list", [])
        achievements_detailed_list = p.get("achievements_detailed_list", [])

        # If achievements lists not provided, build from raw achievements
        if not achievements_summary_list and not achievements_detailed_list and raw_achievements:
            achievements_summary_list = []
            achievements_detailed_list = []
            for a in raw_achievements:
                # Check if already in correct format (has 'category' and 'title')
                if "category" in a and "title" in a:
                    # Summary: title only, no description
                    achievements_summary_list.append({
                        "category": a.get("category", "성과"),
                        "title": a.get("title", ""),
                    })
                    # Detailed: with description
                    achievements_detailed_list.append({
                        "category": a.get("category", "성과"),
                        "title": a.get("title", ""),
                        "description": a.get("description", ""),
                        "has_description": bool(a.get("description"))
                    })
                else:
                    # Legacy format: metric_name/metric_value
                    display_category = a.get("metric_name", "성과")
                    title = a.get("metric_value", "")
                    description = a.get("description", "")
                    # Summary: title only
                    achievements_summary_list.append({
                        "category": display_category,
                        "title": title,
                    })
                    # Detailed: with description
                    achievements_detailed_list.append({
                        "category": display_category,
                        "title": title,
                        "description": description,
                        "has_description": bool(description)
                    })

        enriched_projects.append({
            "name": p.get("name", ""),
            "short_description": p.get("short_description", ""),
            "description": p.get("description", "") or p.get("ai_summary", ""),
            "start_date": str(p.get("start_date", "")),
            "end_date": str(p.get("end_date", "")) if p.get("end_date") else "진행중",
            "role": p.get("role", ""),
            "team_size": p.get("team_size", ""),
            "contribution_percent": p.get("contribution_percent", ""),
            "technologies": (
                ", ".join(p.get("technologies", []))
                if isinstance(p.get("technologies"), list)
                else p.get("technologies", "")
            ),
            "key_tasks": p.get("key_tasks", []),
            "achievements": raw_achievements,  # Keep original for backward compatibility
            "achievements_summary_list": achievements_summary_list,  # Default: title only
            "achievements_detailed_list": achievements_detailed_list,  # With description
            "links": p.get("links", {}),
            # Company info for project
            "company_name": company.get("name", ""),
            "department": company.get("department", ""),
            "position": company.get("position", ""),
        })

    return {"projects": enriched_projects}


def calculate_total_experience(companies: List[Dict[str, Any]]) -> str:
    """Calculate total career experience from companies."""
    if not companies:
        return ""

    total_months = 0
    for company in companies:
        start = company.get("start_date")
        end = company.get("end_date")

        if start:
            try:
                if isinstance(start, str):
                    start_date = datetime.strptime(start[:10], "%Y-%m-%d")
                else:
                    start_date = start

                if end:
                    if isinstance(end, str):
                        end_date = datetime.strptime(end[:10], "%Y-%m-%d")
                    else:
                        end_date = end
                else:
                    end_date = datetime.now()

                months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
                total_months += max(0, months)
            except (ValueError, TypeError):
                continue

    years = total_months // 12
    months = total_months % 12

    if years > 0 and months > 0:
        return f"{years}년 {months}개월"
    elif years > 0:
        return f"{years}년"
    elif months > 0:
        return f"{months}개월"
    return ""


def extract_all_skills(projects: List[Dict[str, Any]]) -> str:
    """Extract and deduplicate all skills from projects."""
    all_techs = set()
    for project in projects:
        techs = project.get("technologies", [])
        if isinstance(techs, str):
            techs = [t.strip() for t in techs.split(",")]
        all_techs.update(techs)
    return ", ".join(sorted(all_techs))
