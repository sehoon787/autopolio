"""
ReportService - Generate various report formats
Based on portfolio project's report styles:
- PROJECTS.md - Project listing with details
- PROJECT_PERFORMANCE_SUMMARY.md - Performance-focused summary
- Company integrated report - By company grouping
"""

from typing import List, Dict, Any, Optional
from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.project import Project, ProjectTechnology
from api.models.company import Company
from api.models.repo_analysis import RepoAnalysis
from api.models.repo_analysis_edits import RepoAnalysisEdits
from .report_base import ReportBaseService


class ReportService(ReportBaseService):
    """Service for generating various report formats"""

    def __init__(self, db: AsyncSession):
        super().__init__(db)

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
        data = await self._get_user_data(user_id)
        projects = data["projects"]
        companies = {c.id: c for c in data["companies"]}

        lines = [
            "# 프로젝트 목록",
            "",
            f"총 {len(projects)}개 프로젝트",
            "",
        ]

        for idx, project in enumerate(projects, 1):
            company = companies.get(project.company_id) if project.company_id else None
            company_name = company.name if company else "개인/프리랜서"

            tech_names = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []
            tech_str = ", ".join(tech_names) if tech_names else "미지정"

            lines.append(f"## {idx}. {project.name}")
            lines.append("")
            lines.append(f"- **기간**: {self._format_date_range(project.start_date, project.end_date)}")
            lines.append(f"- **소속**: {company_name}")
            if project.team_size:
                lines.append(f"- **투입인원**: {project.team_size}명")
            if project.role:
                lines.append(f"- **역할**: {project.role}")
            if project.description:
                lines.append(f"- **설명**: {project.description}")
            if project.git_url:
                lines.append(f"- **Git**: {project.git_url}")
            lines.append(f"- **기술스택**: {tech_str}")
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
        data = await self._get_user_data(user_id)
        projects = data["projects"]

        lines = [
            "# 프로젝트 성과 요약",
            "",
            "정량적 성과 중심의 프로젝트 요약입니다.",
            "",
        ]

        projects_with_achievements = [
            p for p in projects
            if p.achievements and len(p.achievements) > 0
        ]

        if not projects_with_achievements:
            lines.append("*등록된 성과가 없습니다.*")
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
            # Add uncategorized to "기타"
            uncategorized = [t for t in tech_names if t not in categorized]
            if uncategorized:
                result["기타"] = uncategorized
            return result

        lines = [
            "# 경력 사항 (회사별 통합)",
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
                lines.append("   **[담당 기술 스택]**")
                for category, techs in tech_categories.items():
                    lines.append(f"   - {category}: {', '.join(sorted(techs))}")
                lines.append("")

            if company_projects:
                lines.append("   **[주요 프로젝트]**")
                for idx, project in enumerate(company_projects, 1):
                    project_date_range = self._format_date_range(project.start_date, project.end_date)
                    lines.append(f"   {idx}. **{project.name}** ({project_date_range})")
                    if project.description:
                        # Truncate long descriptions
                        desc = project.description[:150] + "..." if len(project.description) > 150 else project.description
                        lines.append(f"      {desc}")
                    if project.role:
                        lines.append(f"      역할: {project.role}")
                    lines.append("")
            else:
                lines.append("   *등록된 프로젝트 없음*")
                lines.append("")

            lines.append("---")
            lines.append("")

        # Freelance/Personal projects
        if freelance_projects:
            lines.append("## ■ 개인/프리랜서 프로젝트")
            lines.append("")
            for idx, project in enumerate(freelance_projects, 1):
                project_date_range = self._format_date_range(project.start_date, project.end_date)
                lines.append(f"   {idx}. **{project.name}** ({project_date_range})")
                if project.description:
                    desc = project.description[:150] + "..." if len(project.description) > 150 else project.description
                    lines.append(f"      {desc}")
                if project.role:
                    lines.append(f"      역할: {project.role}")
                lines.append("")

        return "\n".join(lines)

    async def generate_full_report(self, user_id: int) -> Dict[str, str]:
        """Generate all report formats at once"""
        return {
            "projects_md": await self.generate_projects_md(user_id),
            "performance_summary": await self.generate_performance_summary(user_id),
            "company_integrated": await self.generate_company_integrated_report(user_id),
        }

    async def _get_project_with_analysis(self, project_id: int) -> Dict[str, Any]:
        """Get project data with repo analysis and user edits applied"""
        # Get project with technologies and achievements
        project_result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(
                selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                selectinload(Project.achievements)
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Get repo analysis
        analysis_result = await self.db.execute(
            select(RepoAnalysis).where(RepoAnalysis.project_id == project_id)
        )
        analysis = analysis_result.scalar_one_or_none()

        # Get user edits if analysis exists
        edits = None
        if analysis:
            edits_result = await self.db.execute(
                select(RepoAnalysisEdits).where(RepoAnalysisEdits.repo_analysis_id == analysis.id)
            )
            edits = edits_result.scalar_one_or_none()

        # Get company if exists
        company = None
        if project.company_id:
            company_result = await self.db.execute(
                select(Company).where(Company.id == project.company_id)
            )
            company = company_result.scalar_one_or_none()

        return {
            "project": project,
            "analysis": analysis,
            "edits": edits,
            "company": company
        }

    def _get_effective_key_tasks(self, analysis: Any, edits: Any) -> List:
        """Get effective key_tasks (edited or original)"""
        if edits and edits.key_tasks_modified and edits.key_tasks is not None:
            return edits.key_tasks
        return analysis.key_tasks if analysis else []

    def _get_effective_implementation_details(self, analysis: Any, edits: Any) -> List:
        """Get effective implementation_details (edited or original)"""
        if edits and edits.implementation_details_modified and edits.implementation_details is not None:
            return edits.implementation_details
        return analysis.implementation_details if analysis else []

    def _get_effective_detailed_achievements(self, analysis: Any, edits: Any) -> Dict:
        """Get effective detailed_achievements (edited or original)"""
        if edits and edits.detailed_achievements_modified and edits.detailed_achievements is not None:
            return edits.detailed_achievements
        return analysis.detailed_achievements if analysis else {}

    async def generate_detailed_report(self, project_id: int) -> Dict[str, Any]:
        """
        Generate DETAILED_COMPLETION_REPORT style - 상세 기술 분석

        Returns structured data for:
        - 프로젝트 개요 (저장소, 커밋 수, 기간, 코드 변경량)
        - 기술 스택 (버전 포함)
        - 주요 구현 기능 (커밋 메시지 분석 기반)
        - 개발 타임라인 (커밋 히스토리 기반)
        - 주요 성과 (카테고리별 정리)
        """
        data = await self._get_project_with_analysis(project_id)
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        company = data["company"]

        # Repository info
        repo_info = {
            "name": project.name,
            "git_url": project.git_url or "",
            "total_commits": analysis.total_commits if analysis else 0,
            "user_commits": analysis.user_commits if analysis else 0,
            "contribution_percent": round((analysis.user_commits / analysis.total_commits * 100), 1) if analysis and analysis.total_commits > 0 else 0,
            "lines_added": analysis.lines_added if analysis else 0,
            "lines_deleted": analysis.lines_deleted if analysis else 0,
            "net_lines": (analysis.lines_added or 0) - (analysis.lines_deleted or 0) if analysis else 0,
            "files_changed": analysis.files_changed if analysis else 0,
            "analyzed_at": analysis.analyzed_at.strftime("%Y-%m-%d %H:%M") if analysis and analysis.analyzed_at else None,
        }

        # Commit analysis
        commit_analysis = {
            "total_commits": analysis.total_commits if analysis else 0,
            "user_commits": analysis.user_commits if analysis else 0,
            "contribution_percent": repo_info["contribution_percent"],
            "categories": analysis.commit_categories if analysis else {},
            "messages_summary": analysis.commit_messages_summary if analysis else "",
        }

        # Code analysis
        code_analysis = {
            "lines_added": analysis.lines_added if analysis else 0,
            "lines_deleted": analysis.lines_deleted if analysis else 0,
            "net_change": repo_info["net_lines"],
            "files_changed": analysis.files_changed if analysis else 0,
        }

        # Languages
        languages = []
        if analysis and analysis.languages:
            for lang, percent in sorted(analysis.languages.items(), key=lambda x: x[1], reverse=True):
                languages.append({"name": lang, "percent": round(percent, 1)})

        # Technologies
        technologies = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []
        detected_technologies = analysis.detected_technologies if analysis else []

        # Architecture patterns
        architecture_patterns = analysis.architecture_patterns if analysis else []

        # Key tasks (use effective - edited or original)
        key_tasks = self._get_effective_key_tasks(analysis, edits)

        # Achievements by category
        achievements_by_category: Dict[str, List[Dict]] = {}
        if project.achievements:
            for ach in project.achievements:
                category = ach.category or "기타"
                if category not in achievements_by_category:
                    achievements_by_category[category] = []
                achievements_by_category[category].append({
                    "metric_name": ach.metric_name,
                    "metric_value": ach.metric_value,
                    "description": ach.description,
                    "before_value": getattr(ach, 'before_value', None),
                    "after_value": getattr(ach, 'after_value', None),
                })

        # LLM-generated detailed content (v1.2) - use effective content
        implementation_details = self._get_effective_implementation_details(analysis, edits)
        development_timeline = analysis.development_timeline if analysis else []
        tech_stack_versions = analysis.tech_stack_versions if analysis else {}
        detailed_achievements = self._get_effective_detailed_achievements(analysis, edits)

        return {
            "report_type": "detailed",
            "project": {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "role": project.role,
                "team_size": project.team_size,
                "start_date": self._format_date(project.start_date),
                "end_date": self._format_date(project.end_date) if project.end_date else "진행중",
                "date_range": self._format_date_range(project.start_date, project.end_date),
            },
            "company": {
                "name": company.name if company else "개인/프리랜서",
                "position": company.position if company else None,
            } if company else None,
            "repository": repo_info,
            "commit_analysis": commit_analysis,
            "code_analysis": code_analysis,
            "languages": languages,
            "technologies": technologies,
            "detected_technologies": detected_technologies,
            "architecture_patterns": architecture_patterns,
            "key_tasks": key_tasks,
            "achievements_by_category": achievements_by_category,
            # LLM-generated detailed content (v1.2) - using effective content
            "implementation_details": implementation_details,
            "development_timeline": development_timeline,
            "tech_stack_versions": tech_stack_versions,
            "detailed_achievements": detailed_achievements,
        }

    async def generate_final_report(self, project_id: int) -> Dict[str, Any]:
        """
        Generate FINAL_PROJECT_REPORT style - 업무/성과 양식 정리

        Returns structured data for:
        - 프로젝트 개요 (기간, 소속, 역할, 기술 스택)
        - 주요 구현 내용 (bullet points)
        - 성과 (Before/After 비교 형식)
        """
        data = await self._get_project_with_analysis(project_id)
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        company = data["company"]

        # Overview
        overview = {
            "name": project.name,
            "date_range": self._format_date_range(project.start_date, project.end_date),
            "company": company.name if company else "개인/프리랜서",
            "role": project.role or "개발자",
            "team_size": project.team_size,
            "description": project.description,
        }

        # Technologies
        technologies = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []

        # Key implementations (use effective - edited or original)
        effective_key_tasks = self._get_effective_key_tasks(analysis, edits)
        key_implementations = []
        if effective_key_tasks:
            key_implementations = effective_key_tasks
        elif analysis and analysis.commit_categories:
            # Generate from commit categories
            categories = analysis.commit_categories
            if categories.get("feature", 0) > 0:
                key_implementations.append(f"신규 기능 {categories['feature']}개 개발")
            if categories.get("fix", 0) > 0:
                key_implementations.append(f"버그 수정 및 안정화 ({categories['fix']}건)")
            if categories.get("refactor", 0) > 0:
                key_implementations.append(f"코드 리팩토링 ({categories['refactor']}건)")

        # Achievements with Before/After format
        achievements = []
        if project.achievements:
            for ach in project.achievements:
                achievement_data = {
                    "metric_name": ach.metric_name,
                    "metric_value": ach.metric_value,
                    "description": ach.description,
                }
                # Check if has before/after values
                if hasattr(ach, 'before_value') and ach.before_value:
                    achievement_data["before_value"] = ach.before_value
                if hasattr(ach, 'after_value') and ach.after_value:
                    achievement_data["after_value"] = ach.after_value
                achievements.append(achievement_data)

        # Code contribution summary
        code_contribution = None
        if analysis:
            net_lines = (analysis.lines_added or 0) - (analysis.lines_deleted or 0)
            code_contribution = {
                "lines_added": analysis.lines_added or 0,
                "lines_deleted": analysis.lines_deleted or 0,
                "net_lines": net_lines,
                "files_changed": analysis.files_changed or 0,
                "commits": analysis.user_commits or 0,
                "contribution_percent": round((analysis.user_commits / analysis.total_commits * 100), 1) if analysis.total_commits > 0 else 0,
            }

        # AI summary if available
        ai_summary = {
            "summary": project.ai_summary,
            "key_features": project.ai_key_features,
        } if project.ai_summary else None

        return {
            "report_type": "final",
            "overview": overview,
            "technologies": technologies,
            "key_implementations": key_implementations,
            "achievements": achievements,
            "code_contribution": code_contribution,
            "ai_summary": ai_summary,
        }

    async def generate_performance_summary_for_project(self, project_id: int) -> Dict[str, Any]:
        """
        Generate PROJECT_PERFORMANCE_SUMMARY style for a single project

        Returns structured data for:
        - 프로젝트 기본 정보
        - 주요 수행 업무
        - 성과 (정량적)
        - 커밋/코드 통계
        """
        data = await self._get_project_with_analysis(project_id)
        project = data["project"]
        analysis = data["analysis"]
        edits = data.get("edits")
        company = data["company"]

        # Basic info
        basic_info = {
            "name": project.name,
            "date_range": self._format_date_range(project.start_date, project.end_date),
            "role": project.role or "개발자",
            "team_size": project.team_size,
            "git_url": project.git_url,
        }

        # Technologies
        technologies = [pt.technology.name for pt in project.technologies if pt.technology] if project.technologies else []

        # Key tasks (use effective - edited or original)
        key_tasks = self._get_effective_key_tasks(analysis, edits)

        # Achievements
        achievements = []
        if project.achievements:
            for ach in project.achievements:
                achievements.append({
                    "metric_name": ach.metric_name,
                    "metric_value": ach.metric_value,
                    "description": ach.description,
                    "category": ach.category,
                })

        # Statistics
        commit_stats = None
        code_stats = None
        if analysis:
            commit_stats = {
                "total_commits": analysis.total_commits or 0,
                "user_commits": analysis.user_commits or 0,
                "contribution_percent": round((analysis.user_commits / analysis.total_commits * 100), 1) if analysis.total_commits > 0 else 0,
                "categories": analysis.commit_categories or {},
            }
            code_stats = {
                "lines_added": analysis.lines_added or 0,
                "lines_deleted": analysis.lines_deleted or 0,
                "files_changed": analysis.files_changed or 0,
            }

        return {
            "report_type": "performance_summary",
            "basic_info": basic_info,
            "company": company.name if company else "개인/프리랜서",
            "technologies": technologies,
            "key_tasks": key_tasks,
            "achievements": achievements,
            "commit_stats": commit_stats,
            "code_stats": code_stats,
        }
