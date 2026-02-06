from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
import os
import uuid

from api.database import get_db
from api.config import get_settings, PLATFORM_CONFIGS
from api.models.template import Template
from api.models.user import User
from api.models.company import Company
from api.models.project import Project, ProjectTechnology
from api.schemas.template import TemplateCreate, TemplateUpdate, TemplateResponse, TemplateListResponse
from api.services.document import DocumentService
from api.services.user_data import UserDataCollector
from api.services.template import TemplateRenderingService, DEFAULT_SAMPLE_DATA
from api.services.template.system_templates import get_system_templates

router = APIRouter()
settings = get_settings()


class TemplatePreviewRequest(BaseModel):
    """Request body for template preview."""
    template_content: str
    sample_data: Optional[dict] = None


class TemplatePreviewResponse(BaseModel):
    """Response for template preview."""
    preview_html: str
    preview_text: str
    fields_used: List[str]


@router.get("", response_model=TemplateListResponse)
async def get_templates(
    user_id: Optional[int] = None,
    platform: Optional[str] = None,
    include_system: bool = True,
    include_platform_templates: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Get all templates (system + user's custom templates).

    Args:
        user_id: Filter by user ID
        platform: Filter by specific platform
        include_system: Include system templates
        include_platform_templates: Include platform-specific templates (saramin, wanted, remember).
                                   Defaults to False since these are now in /platforms.
    """
    from sqlalchemy import or_, and_, not_

    query = select(Template)

    conditions = []
    if include_system:
        conditions.append(Template.is_system == 1)
    if user_id:
        conditions.append(Template.user_id == user_id)

    if conditions:
        query = query.where(or_(*conditions))

    if platform:
        query = query.where(Template.platform == platform)

    # Exclude platform-specific templates unless explicitly requested
    # These templates are now available via /platforms endpoint with HTML rendering
    if not include_platform_templates:
        platform_specific = ["saramin", "remember", "jumpit"]
        query = query.where(not_(Template.platform.in_(platform_specific)))

    query = query.order_by(Template.is_system.desc(), Template.name)

    result = await db.execute(query)
    templates = result.scalars().all()

    return {
        "templates": templates,
        "total": len(templates)
    }


@router.get("/platforms")
async def get_platforms():
    """Get available platform configurations."""
    return PLATFORM_CONFIGS


@router.get("/fields/available")
async def get_available_fields():
    """Get list of all available template fields with descriptions."""
    return {
        "user_fields": [
            {"field": "name", "description": "사용자 이름", "example": "홍길동"},
            {"field": "email", "description": "이메일 주소", "example": "hong@example.com"},
            {"field": "github_username", "description": "GitHub 사용자명", "example": "honggildong"},
            {"field": "summary", "description": "자기소개 요약", "example": "5년차 개발자입니다."},
            {"field": "skills", "description": "기술 스택 (쉼표 구분)", "example": "React, Python, FastAPI"},
        ],
        "company_fields": [
            {"field": "companies", "description": "회사 목록 (반복 섹션)", "is_section": True},
            {"field": "name", "description": "회사명", "example": "테크 스타트업", "parent": "companies"},
            {"field": "position", "description": "직책", "example": "시니어 개발자", "parent": "companies"},
            {"field": "department", "description": "부서", "example": "개발팀", "parent": "companies"},
            {"field": "start_date", "description": "입사일", "example": "2022.01", "parent": "companies"},
            {"field": "end_date", "description": "퇴사일/현재", "example": "현재", "parent": "companies"},
            {"field": "description", "description": "업무 설명", "example": "웹 서비스 개발", "parent": "companies"},
        ],
        "project_fields": [
            {"field": "projects", "description": "프로젝트 목록 (반복 섹션)", "is_section": True},
            {"field": "name", "description": "프로젝트명", "example": "이커머스 플랫폼", "parent": "projects"},
            {"field": "short_description", "description": "한 줄 설명", "example": "B2C 서비스", "parent": "projects"},
            {"field": "description", "description": "상세 설명", "example": "대규모 플랫폼 개발", "parent": "projects"},
            {"field": "role", "description": "역할", "example": "백엔드 리드", "parent": "projects"},
            {"field": "team_size", "description": "팀 규모", "example": "5", "parent": "projects"},
            {"field": "contribution_percent", "description": "기여도(%)", "example": "40", "parent": "projects"},
            {"field": "start_date", "description": "시작일", "example": "2023.01", "parent": "projects"},
            {"field": "end_date", "description": "종료일", "example": "2023.12", "parent": "projects"},
            {"field": "technologies", "description": "기술 스택", "example": "FastAPI, React", "parent": "projects"},
        ],
        "achievement_fields": [
            # === 3 LEVELS OF ACHIEVEMENT FORMAT ===
            # 1. 기본 (Basic): From ProjectAchievement model - simple metric_name: metric_value
            # 2. 요약 (Summary): From RepoAnalysis.detailed_achievements - titles grouped by category (DEFAULT)
            # 3. 상세 (Detailed): From RepoAnalysis.detailed_achievements - full title + description

            # === STRING FORMATS (use directly in template) ===
            # Default field - uses Summary format (요약)
            {"field": "achievements", "description": "성과 (요약 형식 - 기본값)", "example": "**[성능 개선]**\n• 캐싱 전략 도입\n• API 응답 최적화\n\n**[신규 기능]**\n• 대시보드 개발", "parent": "projects", "level": "default"},

            # Level 1: 기본 (Basic) - From ProjectAchievement model
            {"field": "achievements_basic", "description": "성과 (기본 형식) - 지표명: 수치만", "example": "• 기능 개발: 16개 기능\n• 버그 수정: 8건 해결", "parent": "projects", "level": "basic"},

            # Level 2: 요약 (Summary) - From detailed_achievements (titles only)
            {"field": "achievements_summary", "description": "성과 (요약 형식) - 카테고리별 제목", "example": "**[성능 개선]**\n• 캐싱 전략 도입\n• API 응답 최적화", "parent": "projects", "level": "summary"},

            # Level 3: 상세 (Detailed) - From detailed_achievements (full)
            {"field": "achievements_detailed", "description": "성과 (상세 형식) - 제목 + 설명", "example": "**[성능 개선]**\n• **캐싱 전략 도입**\n  Redis 캐싱으로 40% 성능 향상", "parent": "projects", "level": "detailed"},

            # Conditional field
            {"field": "has_achievements", "description": "성과 유무 (조건문용)", "example": "true/false", "parent": "projects"},

            # === LIST FORMATS (for iteration with {{#list}}...{{/list}}) ===
            # Default list - uses Summary format
            {"field": "achievements_list", "description": "성과 목록 (요약 - 기본값)", "is_section": True, "parent": "projects", "level": "default"},

            # Level 1: 기본 (Basic) list
            {"field": "achievements_basic_list", "description": "성과 목록 (기본 형식)", "is_section": True, "parent": "projects", "level": "basic"},

            # Level 2: 요약 (Summary) list
            {"field": "achievements_summary_list", "description": "성과 목록 (요약 형식)", "is_section": True, "parent": "projects", "level": "summary"},

            # Level 3: 상세 (Detailed) list
            {"field": "achievements_detailed_list", "description": "성과 목록 (상세 형식)", "is_section": True, "parent": "projects", "level": "detailed"},

            # === LIST ITEM FIELDS (available in all list formats) ===
            {"field": "title", "description": "성과 제목", "example": "캐싱 전략 도입", "parent": "achievements_*_list"},
            {"field": "category", "description": "성과 카테고리", "example": "성능 개선", "parent": "achievements_*_list"},
            {"field": "description", "description": "성과 설명 (상세 형식만)", "example": "Redis 캐싱으로 40% 성능 향상", "parent": "achievements_*_list"},
            {"field": "has_description", "description": "설명 유무", "example": "true/false", "parent": "achievements_*_list"},

            # === LEGACY FIELDS (for backwards compatibility with Basic format) ===
            {"field": "metric_name", "description": "성과 지표명 (기본 형식)", "example": "기능 개발", "parent": "achievements_basic_list"},
            {"field": "metric_value", "description": "성과 수치 (기본 형식)", "example": "16개 기능", "parent": "achievements_basic_list"},
            {"field": "before_value", "description": "개선 전 상태 (기본 형식)", "example": "평균 2초", "parent": "achievements_basic_list"},
            {"field": "after_value", "description": "개선 후 상태 (기본 형식)", "example": "평균 0.5초", "parent": "achievements_basic_list"},
            {"field": "has_before_after", "description": "전후 비교 유무 (기본 형식)", "example": "true/false", "parent": "achievements_basic_list"},
        ],
        "certification_fields": [
            {"field": "certifications", "description": "자격증 목록 (반복 섹션)", "is_section": True},
            {"field": "name", "description": "자격증명", "example": "정보처리기사", "parent": "certifications"},
            {"field": "issuer", "description": "발급기관", "example": "한국산업인력공단", "parent": "certifications"},
            {"field": "issue_date", "description": "취득일", "example": "2019.05", "parent": "certifications"},
            {"field": "expiry_date", "description": "만료일", "example": "2024.05", "parent": "certifications"},
            {"field": "credential_id", "description": "자격번호", "example": "12345678", "parent": "certifications"},
        ],
        "award_fields": [
            {"field": "awards", "description": "수상이력 목록 (반복 섹션)", "is_section": True},
            {"field": "name", "description": "수상명", "example": "최우수상", "parent": "awards"},
            {"field": "issuer", "description": "수여기관", "example": "한국IT협회", "parent": "awards"},
            {"field": "award_date", "description": "수상일", "example": "2023.11", "parent": "awards"},
            {"field": "description", "description": "상세 설명", "example": "AI 경진대회 1위", "parent": "awards"},
        ],
        "education_fields": [
            {"field": "educations", "description": "교육 이력 목록 (반복 섹션)", "is_section": True},
            {"field": "school_name", "description": "학교명", "example": "서울대학교", "parent": "educations"},
            {"field": "major", "description": "전공", "example": "컴퓨터공학", "parent": "educations"},
            {"field": "degree", "description": "학위", "example": "학사", "parent": "educations"},
            {"field": "period", "description": "기간", "example": "2015.03 - 2019.02", "parent": "educations"},
            {"field": "gpa", "description": "학점", "example": "3.8/4.5", "parent": "educations"},
        ],
        "publication_fields": [
            {"field": "publications", "description": "논문/저술 목록 (반복 섹션)", "is_section": True},
            {"field": "title", "description": "제목", "example": "AI 기반 코드 분석", "parent": "publications"},
            {"field": "authors", "description": "저자", "example": "홍길동, 김철수", "parent": "publications"},
            {"field": "publication_type", "description": "유형", "example": "학술지 논문", "parent": "publications"},
            {"field": "publisher", "description": "출판사/학술지", "example": "한국정보과학회", "parent": "publications"},
            {"field": "publication_date", "description": "발표일", "example": "2023.06", "parent": "publications"},
            {"field": "doi", "description": "DOI", "example": "10.1000/xyz123", "parent": "publications"},
        ],
        "volunteer_activity_fields": [
            {"field": "volunteer_activities", "description": "봉사/대외활동 목록 (반복 섹션)", "is_section": True},
            {"field": "name", "description": "활동명", "example": "오픈소스 컨트리뷰션", "parent": "volunteer_activities"},
            {"field": "organization", "description": "기관/단체명", "example": "한국오픈소스협회", "parent": "volunteer_activities"},
            {"field": "activity_type", "description": "활동 유형 (volunteer/external)", "example": "external", "parent": "volunteer_activities"},
            {"field": "period", "description": "활동 기간", "example": "2023.01 - 2023.06", "parent": "volunteer_activities"},
            {"field": "hours", "description": "봉사시간", "example": "120", "parent": "volunteer_activities"},
            {"field": "role", "description": "역할", "example": "멘토", "parent": "volunteer_activities"},
            {"field": "description", "description": "상세 설명", "example": "신입 개발자 교육 및 코드리뷰", "parent": "volunteer_activities"},
        ],
        "syntax_guide": {
            "simple_field": "{{field_name}}",
            "section_start": "{{#section_name}}",
            "section_end": "{{/section_name}}",
            "conditional": "{{#has_field}}내용{{/has_field}}",
            "achievement_levels": {
                "description": "성과는 3가지 레벨로 제공됩니다. 기본값은 '요약' 형식입니다.",
                "basic": "achievements_basic - 지표명: 수치 (예: 기능 개발: 16개 기능)",
                "summary": "achievements (기본값), achievements_summary - 카테고리별 제목 목록",
                "detailed": "achievements_detailed - 제목 + 상세 설명"
            },
            "example_basic": """{{#projects}}
### {{name}}
**성과 (기본)**
{{achievements_basic}}
{{/projects}}""",
            "example_summary": """{{#projects}}
### {{name}}
**성과 (요약 - 기본값)**
{{achievements}}
{{/projects}}""",
            "example_detailed": """{{#projects}}
### {{name}}
**성과 (상세)**
{{achievements_detailed}}
{{/projects}}""",
            "example_summary_list": """{{#projects}}
### {{name}}
**성과 (요약 목록)**
{{#achievements_summary_list}}
- **{{title}}** ({{category}})
{{/achievements_summary_list}}
{{/projects}}""",
            "example_detailed_list": """{{#projects}}
### {{name}}
**성과 (상세 목록)**
{{#achievements_detailed_list}}
- **{{title}}** ({{category}})
  {{#has_description}}{{description}}{{/has_description}}
{{/achievements_detailed_list}}
{{/projects}}""",
            "example_basic_list": """{{#projects}}
### {{name}}
**성과 (기본 목록)**
{{#achievements_basic_list}}
- **{{metric_name}}**: {{metric_value}}
  {{#has_before_after}}▶ {{before_value}} → {{after_value}}{{/has_before_after}}
{{/achievements_basic_list}}
{{/projects}}"""
        }
    }


@router.post("/preview", response_model=TemplatePreviewResponse)
async def preview_template(
    request: TemplatePreviewRequest,
    user_id: Optional[int] = Query(None, description="User ID for real data preview"),
    db: AsyncSession = Depends(get_db)
):
    """
    Preview template with sample or real data.

    If user_id is provided, uses real user data for preview.
    Otherwise, uses sample_data from request or default sample data.
    """
    # Get sample data
    sample_data = request.sample_data or {}

    if user_id and not sample_data:
        # Use UserDataCollector for proper data priority (user-entered > OAuth defaults)
        try:
            collector = UserDataCollector(db)
            collected_data = await collector.collect(user_id)

            # Map collected data to sample_data format for template rendering
            sample_data = {
                "name": collected_data.get("name", "사용자명"),
                "email": collected_data.get("email", "user@example.com"),
                "phone": collected_data.get("phone", ""),
                "address": collected_data.get("address", ""),
                "birthdate": collected_data.get("birthdate", ""),
                "github_username": collected_data.get("github_url", "").replace("https://github.com/", "") if collected_data.get("github_url") else "",
                "github_url": collected_data.get("github_url", ""),
                "photo_url": collected_data.get("photo_url", ""),
                "summary": collected_data.get("introduction", "") or "경험이 풍부한 개발자입니다.",
                "skills": ", ".join(collected_data.get("skills", [])) if collected_data.get("skills") else "React, Python, FastAPI",
                "companies": [
                    {
                        "name": exp.get("company_name", ""),
                        "position": exp.get("position", "개발자"),
                        "department": exp.get("department", ""),
                        "start_date": exp.get("start_date", "2020.01"),
                        "end_date": exp.get("end_date", "") or "현재",
                        "description": exp.get("description", "소프트웨어 개발")
                    }
                    for exp in collected_data.get("experiences", [])
                ],
                "projects": [
                    {
                        "name": p.get("name", ""),
                        "short_description": p.get("description", "")[:100] if p.get("description") else "",
                        "description": p.get("description", "") or "프로젝트 설명",
                        "role": p.get("role", "개발자"),
                        "team_size": p.get("team_size", 3),
                        "contribution_percent": 50,
                        "start_date": p.get("start_date", "2023.01"),
                        "end_date": p.get("end_date", "") or "2023.06",
                        "technologies": p.get("technologies", "") or "React, Node.js",
                        "achievements": p.get("achievements_list", []),
                        # Use achievements_summary_list as default (title only, no description)
                        "achievements_summary_list": p.get("achievements_summary_list", []),
                        # Also pass detailed list for templates that need description
                        "achievements_detailed_list": p.get("achievements_detailed_list", []),
                        "has_achievements": p.get("has_achievements", False),
                        "key_tasks": p.get("key_tasks", ""),
                        "links": {}
                    }
                    for p in collected_data.get("projects", [])[:5]
                ],
                # Include credentials
                "certifications": collected_data.get("certifications", []),
                "awards": collected_data.get("awards", []),
                "educations": collected_data.get("educations", []),
                "publications": collected_data.get("publications", []),
                "volunteer_activities": collected_data.get("volunteer_activities", []),
                # Boolean flags for conditionals
                "has_certifications": collected_data.get("has_certifications", False),
                "has_awards": collected_data.get("has_awards", False),
                "has_educations": collected_data.get("has_educations", False),
                "has_publications": collected_data.get("has_publications", False),
                "has_volunteer_activities": collected_data.get("has_volunteer_activities", False),
            }
        except ValueError:
            # User not found, will use default sample data
            pass

    # Default sample data if nothing provided
    if not sample_data:
        sample_data = DEFAULT_SAMPLE_DATA.copy()

    # Use TemplateRenderingService for rendering
    renderer = TemplateRenderingService()
    preview_html, preview_text, fields_used = renderer.render_to_html(
        request.template_content,
        sample_data
    )

    return TemplatePreviewResponse(
        preview_html=preview_html,
        preview_text=preview_text,
        fields_used=fields_used
    )


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific template by ID."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: TemplateCreate,
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new custom template."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    template = Template(
        user_id=user_id,
        is_system=0,
        **template_data.model_dump()
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.post("/upload", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Query(...),
    platform: str = Query("custom"),
    user_id: int = Query(..., description="User ID"),
    db: AsyncSession = Depends(get_db)
):
    """Upload a Word/PDF template file."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Validate file type
    allowed_extensions = {".docx", ".doc", ".pdf"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )

    # Save file
    file_id = str(uuid.uuid4())
    file_name = f"{file_id}{file_ext}"
    file_path = settings.templates_dir / file_name

    os.makedirs(settings.templates_dir, exist_ok=True)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Parse template to extract field mappings
    doc_service = DocumentService()
    try:
        parsed_content, field_mappings = await doc_service.parse_template(str(file_path))
    except Exception as e:
        # Clean up file on parse error
        os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Failed to parse template: {str(e)}")

    # Determine output format
    output_format = "docx" if file_ext in {".docx", ".doc"} else "pdf"

    template = Template(
        user_id=user_id,
        name=name,
        platform=platform,
        is_system=0,
        template_file_path=str(file_path),
        template_content=parsed_content,
        field_mappings=field_mappings,
        output_format=output_format
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int,
    template_data: TemplateUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a template."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Don't allow editing system templates
    if template.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system templates")

    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    await db.flush()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a template."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Don't allow deleting system templates
    if template.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system templates")

    # Delete template file if exists
    if template.template_file_path and os.path.exists(template.template_file_path):
        os.remove(template.template_file_path)

    await db.delete(template)


@router.post("/init-system-templates")
async def initialize_system_templates(
    force_update: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Initialize or update system templates (admin only).

    Args:
        force_update: If True, update existing templates with latest content from code.
    """
    # Get existing system templates
    result = await db.execute(select(Template).where(Template.is_system == 1))
    existing_templates = {t.platform: t for t in result.scalars().all()}

    if existing_templates and not force_update:
        return {"message": "System templates already initialized. Use force_update=true to update."}

    # Get system templates from centralized definition
    system_templates = get_system_templates()

    created_count = 0
    updated_count = 0

    for tmpl_data in system_templates:
        platform = tmpl_data.get("platform")
        existing = existing_templates.get(platform)

        if existing and force_update:
            # Update existing template
            for key, value in tmpl_data.items():
                setattr(existing, key, value)
            updated_count += 1
        elif not existing:
            # Create new template
            template = Template(
                user_id=None,
                is_system=1,
                **tmpl_data
            )
            db.add(template)
            created_count += 1

    await db.flush()
    return {"message": f"Created {created_count}, updated {updated_count} system templates"}


@router.post("/{template_id}/clone", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def clone_template(
    template_id: int,
    user_id: int = Query(..., description="User ID"),
    new_name: Optional[str] = Query(None, description="New template name (optional)"),
    db: AsyncSession = Depends(get_db)
):
    """Clone a template (system or user's own) to create a new user template."""
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Get source template
    result = await db.execute(select(Template).where(Template.id == template_id))
    source_template = result.scalar_one_or_none()
    if not source_template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Create cloned template
    cloned_name = new_name or f"{source_template.name} (복사본)"

    cloned_template = Template(
        user_id=user_id,
        name=cloned_name,
        description=source_template.description,
        platform=source_template.platform,
        is_system=0,
        template_content=source_template.template_content,
        template_file_path=None,  # Don't copy file path
        field_mappings=source_template.field_mappings,
        sections=source_template.sections,
        style_settings=source_template.style_settings,
        max_projects=source_template.max_projects,
        max_characters=source_template.max_characters,
        output_format=source_template.output_format
    )
    db.add(cloned_template)
    await db.flush()
    await db.refresh(cloned_template)
    return cloned_template
