"""
Platform Template Service - Manage platform-specific resume templates
Supports Saramin, Remember, Jumpit, and custom templates
"""

import yaml
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.platform_template import PlatformTemplate
from api.schemas.platform import (
    PlatformTemplateCreate,
    PlatformTemplateUpdate,
    RenderDataRequest,
    PlatformInfo,
    ExperienceData,
    ProjectData,
    SkillsData,
)
from api.config import get_settings
from api.services.platform_logos import get_platform_logo_svg, get_platform_logo, get_platform_color
from api.services.template_renderer import TemplateRenderer
from api.services.template_exporter import TemplateExporter
from api.services.user_data_collector import UserDataCollector

settings = get_settings()


class PlatformTemplateService:
    """Service for managing platform-specific resume templates"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.templates_dir = Path(settings.data_dir) / "platform_templates"
        self.config_dir = Path(settings.base_dir) / "config"
        self.result_dir = Path(settings.result_dir)

        # Initialize helper services
        self.renderer = TemplateRenderer()
        self.exporter = TemplateExporter(self.result_dir)
        self.data_collector = UserDataCollector(db)

    # ==================== CRUD Operations ====================

    async def get_all(self, user_id: Optional[int] = None) -> List[PlatformTemplate]:
        """Get all platform templates (system + user's)"""
        query = select(PlatformTemplate).where(
            (PlatformTemplate.is_system == 1) |
            (PlatformTemplate.user_id == user_id) if user_id else
            (PlatformTemplate.is_system == 1)
        ).order_by(PlatformTemplate.is_system.desc(), PlatformTemplate.created_at)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_id(self, template_id: int) -> Optional[PlatformTemplate]:
        """Get a platform template by ID"""
        result = await self.db.execute(
            select(PlatformTemplate).where(PlatformTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def get_by_platform_key(self, platform_key: str) -> Optional[PlatformTemplate]:
        """Get a system platform template by platform key"""
        result = await self.db.execute(
            select(PlatformTemplate).where(
                PlatformTemplate.platform_key == platform_key,
                PlatformTemplate.is_system == 1
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        data: PlatformTemplateCreate,
        user_id: Optional[int] = None
    ) -> PlatformTemplate:
        """Create a new platform template"""
        template = PlatformTemplate(
            user_id=user_id,
            name=data.name,
            platform_key=data.platform_key,
            description=data.description,
            page_url=data.page_url,
            html_content=data.html_content,
            css_content=data.css_content,
            field_mappings=data.field_mappings,
            selectors=data.selectors,
            platform_color=data.platform_color,
            features=data.features,
            is_system=0,  # User-created templates are not system templates
        )
        self.db.add(template)
        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def update(
        self,
        template_id: int,
        data: PlatformTemplateUpdate
    ) -> Optional[PlatformTemplate]:
        """Update a platform template"""
        template = await self.get_by_id(template_id)
        if not template:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(template, field, value)

        template.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def delete(self, template_id: int) -> bool:
        """Delete a platform template"""
        template = await self.get_by_id(template_id)
        if not template:
            return False

        # Don't allow deleting system templates
        if template.is_system:
            return False

        await self.db.delete(template)
        return True

    # ==================== System Template Initialization ====================

    async def _load_templates_from_config(self) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """Load platform config and HTML templates from files

        Returns:
            Tuple of (platforms_config, html_contents)
        """
        config_path = self.config_dir / "platform_field_mappings.yaml"
        if not config_path.exists():
            return {}, {}

        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        platforms = config.get("platforms", {})
        html_contents = {}

        for platform_key, platform_config in platforms.items():
            template_file = platform_config.get("template_file")
            if template_file:
                template_path = self.templates_dir / template_file
                if template_path.exists():
                    with open(template_path, 'r', encoding='utf-8') as f:
                        html_contents[platform_key] = f.read()

        return platforms, html_contents

    async def init_system_templates(self, force_update: bool = False) -> List[PlatformTemplate]:
        """Initialize system templates from YAML config and HTML files

        Args:
            force_update: If True, update existing templates with latest HTML content
        """
        created_templates = []
        updated_templates = []

        platforms, html_contents = await self._load_templates_from_config()
        if not platforms:
            return created_templates

        for platform_key, platform_config in platforms.items():
            html_content = html_contents.get(platform_key)

            # Check if template already exists
            existing = await self.get_by_platform_key(platform_key)
            if existing:
                if force_update and html_content:
                    # Update existing template with latest HTML
                    existing.html_content = html_content
                    existing.updated_at = datetime.utcnow()
                    updated_templates.append(existing)
                continue

            # Create system template
            template = PlatformTemplate(
                user_id=None,  # System template
                name=platform_config.get("name", platform_key),
                platform_key=platform_key,
                description=platform_config.get("description", ""),
                html_content=html_content,
                platform_color=platform_config.get("color"),
                features=platform_config.get("features", []),
                is_system=1,
                scrape_status="success" if html_content else "pending",
            )
            self.db.add(template)
            created_templates.append(template)

        if created_templates or updated_templates:
            await self.db.flush()
            for template in created_templates + updated_templates:
                await self.db.refresh(template)

        return created_templates + updated_templates

    async def refresh_system_templates(self) -> List[PlatformTemplate]:
        """Refresh system templates - update existing ones with new HTML from files"""
        updated_templates = []

        platforms, html_contents = await self._load_templates_from_config()
        if not platforms:
            return updated_templates

        for platform_key, platform_config in platforms.items():
            html_content = html_contents.get(platform_key)

            # Check if template already exists
            existing = await self.get_by_platform_key(platform_key)
            if existing:
                # Update existing template
                existing.name = platform_config.get("name", platform_key)
                existing.description = platform_config.get("description", "")
                existing.html_content = html_content
                existing.platform_color = platform_config.get("color")
                existing.features = platform_config.get("features", [])
                existing.scrape_status = "success" if html_content else "pending"
                updated_templates.append(existing)
            else:
                # Create new template
                template = PlatformTemplate(
                    user_id=None,
                    name=platform_config.get("name", platform_key),
                    platform_key=platform_key,
                    description=platform_config.get("description", ""),
                    html_content=html_content,
                    platform_color=platform_config.get("color"),
                    features=platform_config.get("features", []),
                    is_system=1,
                    scrape_status="success" if html_content else "pending",
                )
                self.db.add(template)
                updated_templates.append(template)

        if updated_templates:
            await self.db.flush()
            for template in updated_templates:
                await self.db.refresh(template)

        return updated_templates

    # ==================== Rendering ====================

    async def render_with_user_data(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> str:
        """
        Render a template with user-provided data

        Args:
            template_id: Platform template ID
            data: User data to render

        Returns:
            Rendered HTML string
        """
        template = await self.get_by_id(template_id)
        if not template or not template.html_content:
            raise ValueError(f"Template {template_id} not found or has no content")

        # Convert Pydantic model to dict
        render_data = data.model_dump()

        return self.renderer.render(template.html_content, render_data)

    async def render_with_sample_data(
        self,
        template_id: int
    ) -> str:
        """
        Render a template with sample data for preview without connected projects

        Args:
            template_id: Platform template ID

        Returns:
            Rendered HTML string with sample data
        """
        template = await self.get_by_id(template_id)
        if not template or not template.html_content:
            raise ValueError(f"Template {template_id} not found or has no content")

        # Sample data for preview
        sample_data = self._get_sample_data(template.platform_key)

        # Add platform logo (Wanted uses smaller padding for larger logo)
        logo_padding = 3 if template.platform_key == "wanted" else 8
        sample_data["platform_logo"] = get_platform_logo(template.platform_key)
        sample_data["platform_logo_svg"] = get_platform_logo_svg(template.platform_key, 40, logo_padding)
        sample_data["platform_color"] = get_platform_color(template.platform_key)
        sample_data["platform_name"] = template.name

        return self.renderer.render(template.html_content, sample_data)

    def _get_sample_data(self, platform_key: str) -> Dict[str, Any]:
        """Get sample data for a platform template preview"""
        return {
            "name": "홍길동",
            "email": "gildong.hong@email.com",
            "phone": "010-1234-5678",
            "photo_url": "",
            "desired_position": "풀스택 개발자",
            "summary": "5년차 풀스택 개발자로서 React, Node.js, Python 기반의 웹 애플리케이션 개발 경험이 풍부합니다. 스타트업에서 대기업까지 다양한 환경에서 프로젝트를 성공적으로 이끌어왔으며, 새로운 기술 습득과 팀 협업을 즐깁니다.",
            "github_url": "https://github.com/gildong",
            "portfolio_url": "https://gildong.dev",
            "has_links": True,
            "has_experiences": True,
            "has_capabilities": False,
            "experiences": [
                {
                    "company": "테크스타트 주식회사",
                    "company_name": "테크스타트 주식회사",
                    "position": "시니어 프론트엔드 개발자",
                    "start_date": "2022.03",
                    "end_date": "",
                    "is_current": True,
                    "duration": "2년 10개월",
                    "description": "SaaS 플랫폼 개발, 시스템 설계",
                    "achievements": ["페이지 로딩 속도 40% 개선", "컴포넌트 라이브러리 구축으로 개발 생산성 30% 향상"],
                    "has_domain_skills": True,
                    "skills_by_domain": [
                        {
                            "domain_name": "Backend",
                            "domain_index": 1,
                            "technologies": ["FastAPI", "Python", "RESTful API"],
                            "technologies_str": "FastAPI, Python, RESTful API",
                            "has_technologies": True,
                            "implementations": [
                                {"text": "RESTful API 서버 개발 (10개 이상 프로젝트)"},
                                {"text": "데이터 수집 파이프라인 구축"},
                                {"text": "Microservices 아키텍처 설계"}
                            ],
                            "has_implementations": True,
                            "databases": ["PostgreSQL", "MySQL"],
                            "databases_str": "PostgreSQL, MySQL",
                            "has_databases": True
                        },
                        {
                            "domain_name": "Frontend",
                            "domain_index": 2,
                            "technologies": ["React", "TypeScript", "Next.js"],
                            "technologies_str": "React, TypeScript, Next.js",
                            "has_technologies": True,
                            "implementations": [
                                {"text": "React 기반 SaaS 플랫폼 프론트엔드 개발"},
                                {"text": "컴포넌트 라이브러리 구축"}
                            ],
                            "has_implementations": True,
                            "databases": [],
                            "databases_str": "",
                            "has_databases": False
                        },
                        {
                            "domain_name": "AI/ML",
                            "domain_index": 3,
                            "technologies": ["LangChain", "OpenAI API"],
                            "technologies_str": "LangChain, OpenAI API",
                            "has_technologies": True,
                            "implementations": [
                                {"text": "RAG 시스템 구축"},
                                {"text": "GPT-4 기반 문서 분석 파이프라인"}
                            ],
                            "has_implementations": True,
                            "databases": [],
                            "databases_str": "",
                            "has_databases": False
                        }
                    ]
                },
                {
                    "company": "디지털솔루션 주식회사",
                    "company_name": "디지털솔루션 주식회사",
                    "position": "풀스택 개발자",
                    "start_date": "2019.07",
                    "end_date": "2022.02",
                    "is_current": False,
                    "duration": "2년 7개월",
                    "description": "B2B 플랫폼 풀스택 개발",
                    "achievements": ["REST API 설계 및 구현", "MySQL 쿼리 최적화로 응답시간 60% 단축"],
                    "has_domain_skills": True,
                    "skills_by_domain": [
                        {
                            "domain_name": "Backend",
                            "domain_index": 1,
                            "technologies": ["Django", "Python"],
                            "technologies_str": "Django, Python",
                            "has_technologies": True,
                            "implementations": [
                                {"text": "B2B 플랫폼 백엔드 개발"},
                                {"text": "REST API 설계 및 구현"}
                            ],
                            "has_implementations": True,
                            "databases": ["MySQL"],
                            "databases_str": "MySQL",
                            "has_databases": True
                        }
                    ]
                }
            ],
            "projects": [
                {
                    "index": 1,
                    "name": "AI 기반 문서 분석 플랫폼",
                    "company": "테크스타트 주식회사",
                    "company_name": "테크스타트 주식회사",
                    "role": "테크 리드",
                    "start_date": "2023.01",
                    "end_date": "2023.12",
                    "description": "GPT-4 API를 활용한 기업 문서 자동 분석 및 요약 플랫폼 개발",
                    "technologies": "React, TypeScript, FastAPI, PostgreSQL, OpenAI API",
                    "technologies_list": ["React", "TypeScript", "FastAPI", "PostgreSQL", "OpenAI API"],
                    "team_size": 3,
                    "key_tasks_list": [
                        "GPT-4 API 기반 문서 분석 파이프라인 구축",
                        "React 기반 사용자 대시보드 개발",
                        "FastAPI 백엔드 API 서버 구현",
                        "PostgreSQL 기반 문서 메타데이터 관리 시스템"
                    ],
                    "has_key_tasks": True,
                    "achievements": "• 문서 처리 시간 80% 단축\n• 월간 활성 사용자 5,000명 달성",
                    "has_achievements": True,
                    "git_url": "https://github.com/example/doc-analyzer"
                },
                {
                    "index": 2,
                    "name": "실시간 협업 화이트보드",
                    "company": "테크스타트 주식회사",
                    "company_name": "테크스타트 주식회사",
                    "role": "프론트엔드 개발자",
                    "start_date": "2022.06",
                    "end_date": "2022.12",
                    "description": "WebSocket 기반 실시간 멀티플레이어 화이트보드 애플리케이션",
                    "technologies": "React, Canvas API, Socket.io, Node.js, Redis",
                    "technologies_list": ["React", "Canvas API", "Socket.io", "Node.js", "Redis"],
                    "team_size": 2,
                    "key_tasks_list": [
                        "Canvas API 기반 드로잉 엔진 개발",
                        "WebSocket 기반 실시간 동기화 구현",
                        "Redis Pub/Sub 기반 이벤트 브로커"
                    ],
                    "has_key_tasks": True,
                    "achievements": "• 동시 접속자 1,000명 지원",
                    "has_achievements": True,
                    "git_url": ""
                }
            ],
            "skills": ["JavaScript", "TypeScript", "Python", "SQL", "React", "Next.js", "FastAPI", "Express.js", "PostgreSQL", "MongoDB", "Redis", "Docker", "AWS", "Git"],
            "skills_categorized": {
                "languages": ["JavaScript", "TypeScript", "Python", "SQL"],
                "frameworks": ["React", "Next.js", "FastAPI", "Express.js"],
                "databases": ["PostgreSQL", "MongoDB", "Redis"],
                "tools": ["Docker", "AWS", "Git", "GitHub Actions"]
            },
            "educations": [
                {
                    "school": "한국대학교",
                    "school_name": "한국대학교",
                    "major": "컴퓨터공학과",
                    "degree": "학사",
                    "start_date": "2015.03",
                    "end_date": "2019.02",
                    "period": "2015.03 - 2019.02",
                    "gpa": "3.8/4.5",
                    "description": "소프트웨어 공학 전공"
                }
            ],
            "has_educations": True,
            "has_education": True,
            "certifications": [
                {"name": "정보처리기사", "issuer": "한국산업인력공단", "issue_date": "2019.05", "date": "2019.05", "credential_id": "19-001234"},
                {"name": "AWS Solutions Architect Associate", "issuer": "Amazon Web Services", "issue_date": "2022.03", "date": "2022.03", "credential_id": "AWS-SAA-001234"}
            ],
            "has_certifications": True,
            "awards": [
                {"name": "우수 개발자상", "issuer": "테크스타트 주식회사", "award_date": "2023.12", "description": "분기 MVP 선정"},
                {"name": "해커톤 대상", "issuer": "한국SW산업협회", "award_date": "2022.08", "description": "AI 활용 서비스 개발 부문"}
            ],
            "has_awards": True,
            "publications": [
                {"title": "대규모 언어 모델 기반 문서 요약 시스템", "authors": "홍길동, 김철수", "publication_type": "학술논문", "publisher": "한국정보과학회", "publication_date": "2023.06", "doi": "10.1234/kips.2023.001", "description": "GPT 모델을 활용한 자동 문서 요약 연구"}
            ],
            "has_publications": True,
            "volunteer_activities": [
                {"name": "코딩 멘토링", "organization": "코드잇", "activity_type": "external", "period": "2022.03 - 2023.02", "hours": 120, "role": "멘토", "description": "비전공자 대상 프로그래밍 기초 교육"}
            ],
            "has_volunteer_activities": True,
            "generated_date": datetime.now().strftime("%Y-%m-%d")
        }

    async def render_from_db(
        self,
        template_id: int,
        user_id: int
    ) -> str:
        """
        Render a template with data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Rendered HTML string

        Raises:
            ValueError: If template not found, user not found, or no data available
        """
        template = await self.get_by_id(template_id)
        if not template or not template.html_content:
            raise ValueError(f"Template {template_id} not found or has no content")

        # Fetch user data from database using data collector
        try:
            render_data = await self.data_collector.collect(user_id)
        except ValueError as e:
            # Re-raise with more context
            raise ValueError(f"Failed to collect user data: {str(e)}")

        # Check if user has any meaningful data
        has_companies = len(render_data.get("experiences", [])) > 0
        has_projects = len(render_data.get("projects", [])) > 0

        if not has_companies and not has_projects:
            raise ValueError("No companies or projects found. Please add your career information first.")

        # Add platform logo (Wanted uses smaller padding for larger logo)
        logo_padding = 3 if template.platform_key == "wanted" else 8
        render_data["platform_logo"] = get_platform_logo(template.platform_key)
        render_data["platform_logo_svg"] = get_platform_logo_svg(template.platform_key, 40, logo_padding)
        render_data["platform_color"] = get_platform_color(template.platform_key)
        render_data["platform_name"] = template.name

        return self.renderer.render(template.html_content, render_data)

    async def render_markdown_from_db(
        self,
        template_id: int,
        user_id: int
    ) -> str:
        """
        Render a template as Markdown with data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Rendered Markdown string
        """
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        # Fetch user data from database
        render_data = await self.data_collector.collect(user_id)

        # Build experiences
        experiences = []
        for exp in render_data.get("experiences", []):
            # achievements can be a list or string, ensure it's a list
            exp_achievements = exp.get("achievements_list") or exp.get("achievements")
            if isinstance(exp_achievements, str):
                exp_achievements = [a.strip() for a in exp_achievements.split("\n") if a.strip()]

            experiences.append(ExperienceData(
                company_name=exp.get("company_name", ""),
                position=exp.get("position"),
                start_date=exp.get("start_date"),
                end_date=exp.get("end_date"),
                description=exp.get("description"),
                achievements=exp_achievements if exp_achievements else None,
            ))

        # Build projects
        projects = []
        for proj in render_data.get("projects", []):
            # Use list versions or convert strings to lists
            tech_list = proj.get("technologies_list") or proj.get("technologies")
            if isinstance(tech_list, str):
                tech_list = [t.strip() for t in tech_list.split(",") if t.strip()]

            # Get achievements - prefer string version, convert list of dicts if needed
            ach_list = proj.get("achievements")  # String version
            if isinstance(ach_list, str):
                # Strip bullet prefixes (• or -) since markdown will add its own
                ach_list = [a.strip().lstrip("•").lstrip("-").strip() for a in ach_list.split("\n") if a.strip()]
            elif not ach_list:
                # Fall back to achievements_list (list of dicts)
                ach_list_raw = proj.get("achievements_list")
                if isinstance(ach_list_raw, list):
                    ach_list = []
                    for ach in ach_list_raw:
                        if isinstance(ach, dict):
                            # Convert dict to string
                            metric = ach.get("metric_name", ach.get("title", ""))
                            value = ach.get("metric_value", ach.get("description", ""))
                            if metric and value:
                                ach_list.append(f"{metric}: {value}")
                            elif metric:
                                ach_list.append(metric)
                        elif isinstance(ach, str):
                            ach_list.append(ach)

            key_tasks = proj.get("key_tasks_list", [])
            projects.append(ProjectData(
                name=proj.get("name", ""),
                company_name=proj.get("company_name"),
                start_date=proj.get("start_date"),
                end_date=proj.get("end_date"),
                description=proj.get("description"),
                role=proj.get("role"),
                technologies=tech_list if tech_list else None,
                achievements=ach_list if ach_list else None,
                # Extended fields for platform-specific exports
                key_tasks_list=key_tasks if key_tasks else None,
                has_key_tasks=len(key_tasks) > 0 if key_tasks else False,
                team_size=proj.get("team_size"),
                implementation_details=proj.get("implementation_details"),
                has_achievements=bool(ach_list),
            ))

        # Build skills
        skills_data = render_data.get("skills_categorized", {})
        skills = SkillsData(
            languages=skills_data.get("languages", []),
            frameworks=skills_data.get("frameworks", []),
            databases=skills_data.get("databases", []),
            tools=skills_data.get("tools", []),
        ) if skills_data else None

        data = RenderDataRequest(
            name=render_data.get("name", ""),
            email=render_data.get("email"),
            phone=render_data.get("phone"),
            photo_url=render_data.get("photo_url"),
            desired_position=render_data.get("desired_position"),
            summary=render_data.get("summary"),
            github_url=render_data.get("github_url"),
            portfolio_url=render_data.get("portfolio_url"),
            experiences=experiences if experiences else None,
            projects=projects if projects else None,
            skills=skills,
            educations=None,
            certifications=None,
        )

        # Pass platform_key for platform-specific formatting
        return self.exporter.generate_markdown(data, template.name, template.platform_key)

    async def render_markdown_with_sample_data(
        self,
        template_id: int
    ) -> str:
        """
        Render a template as Markdown with sample data for preview

        Args:
            template_id: Platform template ID

        Returns:
            Rendered Markdown string with sample data
        """
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        # Use the same sample data as HTML preview
        sample_data = self._get_sample_data(template.platform_key)

        # Build experiences from sample data
        experiences = []
        for exp in sample_data.get("experiences", []):
            experiences.append(ExperienceData(
                company_name=exp.get("company_name", exp.get("company", "")),
                position=exp.get("position"),
                start_date=exp.get("start_date"),
                end_date=exp.get("end_date") if not exp.get("is_current") else None,
                description=exp.get("description"),
                achievements=exp.get("achievements"),
            ))

        # Build projects from sample data
        projects = []
        for proj in sample_data.get("projects", []):
            # Handle technologies_list or technologies (list in sample data)
            tech_list = proj.get("technologies_list") or proj.get("technologies")
            if isinstance(tech_list, bool):
                tech_list = None  # Sample data has technologies: True as flag

            # Handle achievements (can be string in sample data)
            ach = proj.get("achievements")
            ach_list = None
            if isinstance(ach, str):
                ach_list = [a.strip().lstrip("• ") for a in ach.split("\n") if a.strip()]
            elif isinstance(ach, list):
                ach_list = ach

            projects.append(ProjectData(
                name=proj.get("name", ""),
                company_name=proj.get("company"),
                start_date=proj.get("start_date"),
                end_date=proj.get("end_date"),
                description=proj.get("description"),
                role=proj.get("role"),
                technologies=tech_list if tech_list else None,
                achievements=ach_list if ach_list else None,
            ))

        # Build skills from sample data
        skills_cat = sample_data.get("skills_categorized", {})
        skills = SkillsData(
            languages=skills_cat.get("languages", []),
            frameworks=skills_cat.get("frameworks", []),
            databases=skills_cat.get("databases", []),
            tools=skills_cat.get("tools", []),
        ) if skills_cat else None

        data = RenderDataRequest(
            name=sample_data.get("name", "홍길동"),
            email=sample_data.get("email"),
            phone=sample_data.get("phone"),
            photo_url=sample_data.get("photo_url"),
            desired_position=sample_data.get("desired_position"),
            summary=sample_data.get("summary"),
            github_url=sample_data.get("github_url"),
            portfolio_url=sample_data.get("portfolio_url"),
            experiences=experiences if experiences else None,
            projects=projects if projects else None,
            skills=skills,
            educations=None,
            certifications=None,
        )

        # Pass platform_key for platform-specific formatting
        return self.exporter.generate_markdown(data, template.name, template.platform_key)

    # ==================== Export Methods ====================

    async def export_from_db_to_html(
        self,
        template_id: int,
        user_id: int
    ) -> Tuple[str, str]:
        """
        Export to HTML file using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Tuple of (file_path, content)
        """
        html_content = await self.render_from_db(template_id, user_id)
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        data = await self.data_collector.collect(user_id)
        return self.exporter.export_html(html_content, template.platform_key, data.get("name", "user"))

    async def export_from_db_to_markdown(
        self,
        template_id: int,
        user_id: int
    ) -> Tuple[str, str]:
        """
        Export to Markdown file using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            Tuple of (file_path, content)
        """
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        data = await self.data_collector.collect(user_id)
        return self.exporter.export_markdown_from_dict(data, template.platform_key, template.name)

    async def export_from_db_to_docx(
        self,
        template_id: int,
        user_id: int
    ) -> str:
        """
        Export to Word document using data from the database

        Args:
            template_id: Platform template ID
            user_id: User ID to fetch data for

        Returns:
            File path to generated DOCX
        """
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        data = await self.data_collector.collect(user_id)
        return self.exporter.export_docx_from_dict(data, template.platform_key)

    async def export_to_html(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> Tuple[str, str]:
        """
        Export rendered template to HTML file

        Args:
            template_id: Platform template ID
            data: User data to render

        Returns:
            Tuple of (file_path, content)
        """
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        html_content = await self.render_with_user_data(template_id, data)
        return self.exporter.export_html(html_content, template.platform_key, data.name)

    async def export_to_markdown(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> Tuple[str, str]:
        """
        Export to Markdown format

        Args:
            template_id: Platform template ID
            data: User data

        Returns:
            Tuple of (file_path, content)
        """
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        return self.exporter.export_markdown(data, template.platform_key, template.name)

    async def export_to_docx(
        self,
        template_id: int,
        data: RenderDataRequest
    ) -> str:
        """
        Export to Word document

        Args:
            template_id: Platform template ID
            data: User data

        Returns:
            File path to generated DOCX
        """
        template = await self.get_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        return self.exporter.export_docx(data, template.platform_key)

    # ==================== Platform Info ====================

    def get_supported_platforms(self) -> List[PlatformInfo]:
        """Get list of supported platforms"""
        config_path = self.config_dir / "platform_field_mappings.yaml"
        if not config_path.exists():
            return []

        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        platforms = config.get("platforms", {})
        result = []

        for key, info in platforms.items():
            result.append(PlatformInfo(
                key=key,
                name=info.get("name", key),
                name_en=info.get("name_en", key),
                description=info.get("description", ""),
                description_en=info.get("description_en", ""),
                color=info.get("color", "#666"),
                features=info.get("features", []),
                template_available=True,
            ))

        return result

    def get_field_mappings(self) -> Dict[str, Any]:
        """Get field mappings configuration"""
        config_path = self.config_dir / "platform_field_mappings.yaml"
        if not config_path.exists():
            return {}

        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
