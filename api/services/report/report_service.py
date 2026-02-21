"""
ReportService - Generate user-level report formats
Based on portfolio project's report styles:
- PROJECTS.md - Project listing with details
- PROJECT_PERFORMANCE_SUMMARY.md - Performance-focused summary
- Company integrated report - By company grouping

Project-level reports are in report_project_service.py (ReportProjectService).
"""

from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.project import Project
from .report_base import ReportBaseService
from .report_strings import get_strings
from .report_project_service import ReportProjectService


class ReportService(ReportBaseService):
    """Service for generating various report formats"""

    def __init__(self, db: AsyncSession, language: str = "ko"):
        super().__init__(db, language=language)

    async def generate_projects_md(self, user_id: int) -> str:
        """
        Generate PROJECTS.md style report
        Format:
        # 프로젝트 목록

        ## 1. 프로젝트명
        - 기간: 2024.01 ~ 2024.06
        - 소속: 회사명
        - 투입인원: 5명
        - 역할: Backend Developer
        - 설명: 프로젝트 설명
        - Git: https://github.com/...
        - 기술스택: Python, FastAPI, React
        """
        s = get_strings(self.language)
        data = await self._get_user_data(user_id)
        projects = data["projects"]
        companies = {c.id: c for c in data["companies"]}

        lines = [
            f"# {s['project_list_title']}",
            "",
            s["total_projects"].format(count=len(projects)),
            "",
        ]

        for idx, project in enumerate(projects, 1):
            company = companies.get(project.company_id) if project.company_id else None
            company_name = company.name if company else s["freelancer"]

            tech_names = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []
            tech_str = ", ".join(tech_names) if tech_names else s["unspecified"]

            lines.append(f"## {idx}. {project.name}")
            lines.append("")
            lines.append(f"- **{s['period']}**: {self._format_date_range(project.start_date, project.end_date)}")
            lines.append(f"- **{s['company']}**: {company_name}")
            if project.team_size:
                lines.append(f"- **{s['team_size']}**: {s['team_size_value'].format(count=project.team_size)}")
            if project.role:
                lines.append(f"- **{s['role']}**: {project.role}")
            if project.description:
                lines.append(f"- **{s['description']}**: {project.description}")
            if project.git_url:
                lines.append(f"- **{s['git']}**: {project.git_url}")
            lines.append(f"- **{s['tech_stack']}**: {tech_str}")
            lines.append("")

        return "\n".join(lines)

    async def generate_performance_summary(self, user_id: int) -> str:
        """
        Generate PROJECT_PERFORMANCE_SUMMARY.md style report
        Focus on quantitative achievements
        Format:
        # 프로젝트 성과 요약

        ## 프로젝트명
        - 성과1: 80% 성능 향상
        - 성과2: 96배 생산성 증가
        """
        s = get_strings(self.language)
        data = await self._get_user_data(user_id)
        projects = data["projects"]

        lines = [
            f"# {s['performance_title']}",
            "",
            s["performance_subtitle"],
            "",
        ]

        projects_with_achievements = [
            p for p in projects
            if p.achievements and len(p.achievements) > 0
        ]

        if not projects_with_achievements:
            lines.append(s["no_achievements"])
            return "\n".join(lines)

        for project in projects_with_achievements:
            lines.append(f"## {project.name}")
            lines.append("")

            if project.description:
                lines.append(f"> {project.description[:100]}...")
                lines.append("")

            for achievement in project.achievements:
                value_str = f" ({achievement.metric_value})" if achievement.metric_value else ""
                lines.append(f"- **{achievement.metric_name}**{value_str}")
                if achievement.description:
                    lines.append(f"  - {achievement.description}")

            lines.append("")

        return "\n".join(lines)

    async def generate_company_integrated_report(self, user_id: int) -> str:
        """
        Generate company-integrated report
        Format:
        ■ 회사명 (시작 ~ 종료)
          주요 직무: 포지션

          [담당 기술 스택]
          Backend: FastAPI, Spring
          Frontend: React, Vue

          [주요 프로젝트]
          1. 프로젝트명 (기간)
             설명
             역할: PM, 백엔드
        """
        s = get_strings(self.language)
        data = await self._get_user_data(user_id)
        companies = data["companies"]
        projects = data["projects"]

        # Group projects by company
        projects_by_company: Dict[int, List[Project]] = {}
        freelance_projects: List[Project] = []

        for project in projects:
            if project.company_id:
                if project.company_id not in projects_by_company:
                    projects_by_company[project.company_id] = []
                projects_by_company[project.company_id].append(project)
            else:
                freelance_projects.append(project)

        # Technology categorization
        TECH_CATEGORIES = {
            "Backend": [
                "Python", "FastAPI", "Django", "Flask", "Spring", "Spring Boot", "Java", "Kotlin",
                "Node.js", "Express", "NestJS", "Go", "Rust", "Ruby", "Rails", "PHP", "Laravel"
            ],
            "Frontend": [
                "React", "Vue", "Angular", "Next.js", "Nuxt.js", "Svelte", "TypeScript", "JavaScript"
            ],
            "Mobile": [
                "Flutter", "React Native", "Swift", "SwiftUI", "Kotlin", "Android", "iOS"
            ],
            "Database": [
                "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Oracle", "SQL Server"
            ],
            "DevOps": [
                "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Jenkins", "GitHub Actions"
            ],
        }

        def categorize_tech(tech_names: List[str]) -> Dict[str, List[str]]:
            result = {}
            categorized = set()
            for tech in tech_names:
                for category, techs in TECH_CATEGORIES.items():
                    if tech in techs:
                        if category not in result:
                            result[category] = []
                        result[category].append(tech)
                        categorized.add(tech)
                        break
            # Add uncategorized to "Other"
            uncategorized = [t for t in tech_names if t not in categorized]
            if uncategorized:
                result[s["category_other"]] = uncategorized
            return result

        lines = [
            f"# {s['career_title']}",
            "",
        ]

        for company in companies:
            company_projects = projects_by_company.get(company.id, [])

            # Aggregate technologies
            all_techs = set()
            for project in company_projects:
                if project.technologies:
                    all_techs.update(pt.technology.name for pt in project.technologies if pt.technology)

            tech_categories = categorize_tech(list(all_techs))
            date_range = self._format_date_range(company.start_date, company.end_date, company.is_current)

            lines.append(f"## ■ {company.name} ({date_range})")
            if company.position:
                lines.append(f"   주요 직무: {company.position}")
            lines.append("")

            if tech_categories:
                lines.append(f"   **[{s['tech_stack_label']}]**")
                for category, techs in tech_categories.items():
                    lines.append(f"   - {category}: {', '.join(sorted(techs))}")
                lines.append("")

            if company_projects:
                lines.append(f"   **[{s['main_projects']}]**")
                for idx, project in enumerate(company_projects, 1):
                    project_date_range = self._format_date_range(project.start_date, project.end_date)
                    lines.append(f"   {idx}. **{project.name}** ({project_date_range})")
                    if project.description:
                        # Truncate long descriptions
                        desc = project.description[:150] + "..." if len(project.description) > 150 else project.description
                        lines.append(f"      {desc}")
                    if project.role:
                        lines.append(f"      {s['role']}: {project.role}")
                    lines.append("")
            else:
                lines.append(f"   {s['no_projects']}")
                lines.append("")

            lines.append("---")
            lines.append("")

        # Freelance/Personal projects
        if freelance_projects:
            lines.append(f"## ■ {s['freelancer_section']}")
            lines.append("")
            for idx, project in enumerate(freelance_projects, 1):
                project_date_range = self._format_date_range(project.start_date, project.end_date)
                lines.append(f"   {idx}. **{project.name}** ({project_date_range})")
                if project.description:
                    desc = project.description[:150] + "..." if len(project.description) > 150 else project.description
                    lines.append(f"      {desc}")
                if project.role:
                    lines.append(f"      {s['role']}: {project.role}")
                lines.append("")

        return "\n".join(lines)

    async def generate_full_report(self, user_id: int) -> Dict[str, str]:
        """Generate all report formats at once"""
        return {
            "projects_md": await self.generate_projects_md(user_id),
            "performance_summary": await self.generate_performance_summary(user_id),
            "company_integrated": await self.generate_company_integrated_report(user_id),
        }
