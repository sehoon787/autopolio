"""
Markdown Generator - Generate Markdown content for resume exports

Provides unified Markdown generation for all platforms.
"""

from datetime import datetime
from typing import List

from .mustache_helpers import render_or_clean_mustache
from api.services.export.export_helpers import (
    get_key_tasks_list,
    get_achievements_list,
    group_projects_by_company,
    categorize_skills_by_domain_detailed,
)


class MarkdownGenerator:
    """Generates Markdown content for resume exports"""

    def generate_markdown_from_dict(
        self, data: dict, template_name: str, platform_key: str = None
    ) -> str:
        """Generate unified Markdown from dict data

        All platforms use the same Markdown/Word format:
        - 경력: Company-based with domain-categorized skills
        - 경력기술서: Detailed project information

        Args:
            data: User data dictionary
            template_name: Template name for footer
            platform_key: Platform key (not used for format selection, only for footer)

        Returns:
            Markdown string with unified format
        """
        # All platforms use the same unified format
        return self._generate_unified_markdown(data, template_name)

    def _generate_unified_markdown(self, data: dict, template_name: str) -> str:
        """Generate unified Markdown format for all platforms

        Structure (based on user's detailed example):
        1. 경력: Company-based with domain-categorized skills
        2. 경력기술서: Detailed project information

        Format follows user's exact specification with:
        - Company header with period, position, job type
        - Domain sections (Backend, AI/ML, Mobile, etc.) with:
          - 주요 사용 기술
          - 구현 내용
          - DB (if applicable)
        - Project details with bullet points
        """
        lines: List[str] = []

        # === Header ===
        lines.append(f"# {data.get('name', '이력서')}")
        lines.append("")

        # Contact info
        self._append_contact_info(lines, data)

        lines.append("---")
        lines.append("")

        experiences = data.get("experiences", [])
        projects = data.get("projects", [])

        # Calculate total experience
        total_years = data.get("total_experience_years", 0)
        if total_years:
            lines.append("## 경력")
            lines.append(f"총 {total_years}년")
            lines.append("")
        elif experiences:
            lines.append("## 경력")
            lines.append("")

        # Group projects by company
        company_projects = group_projects_by_company(projects)

        # === Part 1: 경력 (Company-based with domain skills) ===
        if experiences:
            for exp in experiences:
                company_name = exp.get("company_name", "")
                position = exp.get("position", "")
                start_date = exp.get("start_date", "")
                end_date = exp.get("end_date", "")
                is_current = exp.get("is_current", not end_date)
                duration = exp.get("duration", "")
                description = exp.get("description", "")

                # Company header
                lines.append(f"### {company_name}")
                if position:
                    lines.append(f"{position}")
                period_str = f"{start_date} ~ {end_date if end_date else ''}"
                if is_current:
                    period_str += " 재직중" if not end_date else ""
                if duration:
                    period_str += f" ({duration})"
                lines.append(period_str)
                lines.append("")

                # Main duties
                if description:
                    lines.append(f"- 주요 직무: {description}")
                    lines.append("")

                # Categorize skills by domain for this company's projects
                company_projs = company_projects.get(company_name, [])
                skills_by_domain = categorize_skills_by_domain_detailed(company_projs)

                domain_idx = 1
                for domain_name, domain_data in skills_by_domain.items():
                    if not domain_data.get("technologies") and not domain_data.get(
                        "implementations"
                    ):
                        continue

                    lines.append(f"**{domain_idx}. {domain_name}**")

                    # Technologies
                    if domain_data.get("technologies"):
                        lines.append("주요 사용 기술")
                        for tech_line in domain_data["technologies"]:
                            lines.append(f"- {tech_line}")

                    # Implementations
                    if domain_data.get("implementations"):
                        lines.append("")
                        lines.append("구현 내용")
                        for impl in domain_data["implementations"]:
                            lines.append(f"- {impl}")

                    # Databases
                    if domain_data.get("databases"):
                        lines.append("")
                        lines.append("DB")
                        for db_line in domain_data["databases"]:
                            lines.append(f"- {db_line}")

                    lines.append("")
                    domain_idx += 1

                lines.append("")

        # Handle side projects (projects without company in experiences)
        side_projects = (
            company_projects.get(None, [])
            + company_projects.get("", [])
            + company_projects.get("사이드 프로젝트", [])
        )
        if side_projects:
            lines.append("### 사이드 프로젝트")
            lines.append("")

            skills_by_domain = categorize_skills_by_domain_detailed(side_projects)

            domain_idx = 1
            for domain_name, domain_data in skills_by_domain.items():
                if not domain_data.get("technologies") and not domain_data.get(
                    "implementations"
                ):
                    continue

                lines.append(f"**{domain_idx}. {domain_name}**")

                if domain_data.get("implementations"):
                    for impl in domain_data["implementations"]:
                        lines.append(f"- {impl}")

                lines.append("")
                domain_idx += 1

            lines.append("")

        # === Part 2: 경력기술서 (Project Details) ===
        if projects:
            lines.append("---")
            lines.append("")
            lines.append("## 경력기술서")
            lines.append("")

            for idx, proj in enumerate(projects, 1):
                self._append_project_detail_unified(lines, proj, idx)

        # Footer
        self._append_footer(lines, template_name)

        return "\n".join(lines)

    def _append_contact_info(self, lines: List[str], data: dict) -> None:
        """Append contact information to lines"""
        contact = []
        if data.get("email"):
            contact.append(data["email"])
        if data.get("phone"):
            contact.append(data["phone"])
        if data.get("github_url"):
            contact.append(data["github_url"])
        if data.get("portfolio_url") and data.get("portfolio_url") != data.get(
            "github_url"
        ):
            contact.append(data["portfolio_url"])

        if contact:
            lines.append(" | ".join(contact))
            lines.append("")

    def _append_footer(self, lines: List[str], template_name: str) -> None:
        """Append footer to lines"""
        lines.append("---")
        lines.append("")
        lines.append(
            f"*Generated by Autopolio ({template_name}) | {datetime.now().strftime('%Y-%m-%d')}*"
        )

    def _append_project_detail_unified(
        self, lines: List[str], proj: dict, idx: int
    ) -> None:
        """Append project in unified format (based on user's exact example)

        Format:
        [프로젝트 N]
        프로젝트명: ...
        연계/소속회사: ...
        기간: ...
        주요 업무: ...
        주요 구현 기능:
        ...
        기술 스택: ...
        개발 인원: ...
        상세 내용: ...
        성과:
        ...

        Note: Uses render_or_clean_mustache to handle any Mustache template
        syntax that may be in the text fields (e.g., {{key_tasks}}, {{#achievements}})
        """
        lines.append(f"[프로젝트 {idx}]")
        lines.append(f"프로젝트명: {proj.get('name', '')}")

        company = proj.get("company_name") or proj.get("company")
        if company:
            lines.append(f"연계/소속회사: {company}")
        else:
            lines.append("연계/소속회사: 사이드 프로젝트")

        end_date = proj.get("end_date") or "진행중"
        lines.append(f"기간: {proj.get('start_date', '')} ~ {end_date}")

        role = proj.get("role")
        if role:
            # Clean any Mustache syntax from role
            clean_role = render_or_clean_mustache(role, proj)
            if clean_role:
                lines.append(f"주요 업무: {clean_role}")

        # 주요 구현 기능 (최대 8개)
        key_tasks = get_key_tasks_list(proj)
        if key_tasks:
            lines.append("주요 구현 기능:")
            for task in key_tasks[:8]:
                # Clean any Mustache syntax from each task
                clean_task = render_or_clean_mustache(task, proj)
                if clean_task:
                    lines.append(f"• {clean_task}")

        # 기술 스택
        tech = proj.get("technologies")
        if tech:
            tech_str = tech if isinstance(tech, str) else ", ".join(tech)
            lines.append(f"기술 스택: {tech_str}")

        # 개발 인원
        team_size = proj.get("team_size")
        if team_size:
            lines.append(f"개발 인원: {team_size}")

        # 상세 내용 - clean any Mustache template syntax
        description = proj.get("description", "")
        if description:
            # Render or clean Mustache syntax from description
            clean_description = render_or_clean_mustache(description, proj)
            if clean_description:
                lines.append(f"상세 내용: {clean_description}")

        # 성과 (최대 4개)
        achievements = get_achievements_list(proj)
        if achievements:
            lines.append("성과:")
            for ach in achievements[:4]:
                # Clean any Mustache syntax from each achievement
                clean_ach = render_or_clean_mustache(ach, proj)
                if clean_ach:
                    lines.append(f"• {clean_ach}")

        lines.append("")
