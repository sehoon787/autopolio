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
from api.services.document_service import DocumentService

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
    db: AsyncSession = Depends(get_db)
):
    """Get all templates (system + user's custom templates)."""
    query = select(Template)

    conditions = []
    if include_system:
        conditions.append(Template.is_system == 1)
    if user_id:
        conditions.append(Template.user_id == user_id)

    if conditions:
        from sqlalchemy import or_
        query = query.where(or_(*conditions))

    if platform:
        query = query.where(Template.platform == platform)

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
            {"field": "achievements", "description": "성과 목록 (프로젝트 내 반복)", "is_section": True, "parent": "projects"},
            {"field": "metric_name", "description": "성과 지표명", "example": "성능 향상", "parent": "achievements"},
            {"field": "metric_value", "description": "성과 수치", "example": "40% 개선", "parent": "achievements"},
            {"field": "description", "description": "성과 설명", "example": "API 최적화", "parent": "achievements"},
        ],
        "syntax_guide": {
            "simple_field": "{{field_name}}",
            "section_start": "{{#section_name}}",
            "section_end": "{{/section_name}}",
            "example": """{{#projects}}
### {{name}}
- 역할: {{role}}
- 기술: {{technologies}}
{{#achievements}}
- {{metric_name}}: {{metric_value}}
{{/achievements}}
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
    import re
    import markdown

    # Get sample data
    sample_data = request.sample_data or {}

    if user_id and not sample_data:
        # Use real user data
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()

        if user:
            # Get companies
            companies_result = await db.execute(
                select(Company).where(Company.user_id == user_id).limit(3)
            )
            companies = companies_result.scalars().all()

            # Get projects with technologies and achievements
            projects_result = await db.execute(
                select(Project)
                .where(Project.user_id == user_id)
                .options(
                    selectinload(Project.technologies).selectinload(ProjectTechnology.technology),
                    selectinload(Project.achievements)
                )
                .limit(5)
            )
            projects = projects_result.scalars().all()

            sample_data = {
                "name": user.name or "사용자명",
                "email": user.email or "user@example.com",
                "github_username": user.github_username or "github_user",
                "summary": "경험이 풍부한 개발자입니다.",
                "skills": ", ".join(list(set(
                    tech.technology.name
                    for p in projects
                    for tech in p.technologies
                ))[:10]) or "React, Python, FastAPI",
                "companies": [
                    {
                        "name": c.name,
                        "position": c.position or "개발자",
                        "department": c.department or "",
                        "start_date": str(c.start_date) if c.start_date else "2020.01",
                        "end_date": str(c.end_date) if c.end_date else "현재",
                        "description": c.description or "소프트웨어 개발"
                    }
                    for c in companies
                ],
                "projects": [
                    {
                        "name": p.name,
                        "short_description": p.short_description or "",
                        "description": p.description or p.ai_summary or "프로젝트 설명",
                        "role": p.role or "개발자",
                        "team_size": p.team_size or 3,
                        "contribution_percent": p.contribution_percent or 50,
                        "start_date": str(p.start_date) if p.start_date else "2023.01",
                        "end_date": str(p.end_date) if p.end_date else "2023.06",
                        "technologies": ", ".join([t.technology.name for t in p.technologies][:5]) or "React, Node.js",
                        "achievements": [
                            {
                                "metric_name": a.metric_name,
                                "metric_value": a.metric_value,
                                "description": a.description or ""
                            }
                            for a in p.achievements[:3]
                        ],
                        "links": p.links or {}
                    }
                    for p in projects
                ]
            }

    # Default sample data if nothing provided
    if not sample_data:
        sample_data = {
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
                    "description": "웹 서비스 개발 및 팀 리드"
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
                            "description": "API 응답 시간 최적화"
                        }
                    ],
                    "links": {"github": "https://github.com/example"}
                }
            ]
        }

    # Extract fields used in template
    template_content = request.template_content
    field_pattern = r'\{\{([^}]+)\}\}'
    fields_used = list(set(re.findall(field_pattern, template_content)))

    # Simple template rendering (Mustache-like)
    preview_text = template_content

    # Replace simple fields
    for field in fields_used:
        if field.startswith('#') or field.startswith('/'):
            continue
        value = sample_data.get(field, f"[{field}]")
        if isinstance(value, (list, dict)):
            value = str(value)
        preview_text = preview_text.replace(f"{{{{{field}}}}}", str(value))

    # Handle sections (simplified - just show first item)
    section_pattern = r'\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}'
    for match in re.finditer(section_pattern, template_content, re.DOTALL):
        section_name = match.group(1)
        section_template = match.group(2)

        if section_name in sample_data and isinstance(sample_data[section_name], list):
            section_output = []
            for item in sample_data[section_name]:
                item_text = section_template
                for key, value in item.items():
                    if isinstance(value, list):
                        # Handle nested lists (like achievements)
                        if value and isinstance(value[0], dict):
                            nested_items = []
                            for nested in value:
                                nested_text = " / ".join(f"{v}" for v in nested.values() if v)
                                nested_items.append(f"- {nested_text}")
                            value = "\n".join(nested_items)
                        else:
                            value = ", ".join(str(v) for v in value)
                    item_text = item_text.replace(f"{{{{{key}}}}}", str(value) if value else "")
                section_output.append(item_text)
            preview_text = preview_text.replace(match.group(0), "".join(section_output))
        else:
            preview_text = preview_text.replace(match.group(0), f"[{section_name} 항목 없음]")

    # Convert markdown to HTML for preview
    try:
        preview_html = markdown.markdown(preview_text, extensions=['tables', 'fenced_code'])
    except Exception:
        preview_html = f"<pre>{preview_text}</pre>"

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
async def initialize_system_templates(db: AsyncSession = Depends(get_db)):
    """Initialize system templates (admin only)."""
    # Check if system templates already exist
    result = await db.execute(select(Template).where(Template.is_system == 1))
    if result.scalars().first():
        return {"message": "System templates already initialized"}

    system_templates = [
        {
            "name": "사람인 기본형",
            "description": "사람인 플랫폼용 기본 이력서 템플릿",
            "platform": "saramin_1",
            "output_format": "docx",
            "sections": ["summary", "experience", "projects", "skills"],
            "max_projects": 5,
            "template_content": """# {{name}} 이력서

## 기본 정보
- 이름: {{name}}
- 이메일: {{email}}
- GitHub: {{github_username}}

## 경력 사항
{{#companies}}
### {{name}}
- 직책: {{position}}
- 기간: {{start_date}} ~ {{end_date}}
- 설명: {{description}}
{{/companies}}

## 프로젝트
{{#projects}}
### {{name}}
- 기간: {{start_date}} ~ {{end_date}}
- 역할: {{role}}
- 기술스택: {{technologies}}
- 설명: {{description}}
{{/projects}}

## 기술 스택
{{skills}}
"""
        },
        {
            "name": "사람인 상세형",
            "description": "사람인 플랫폼용 상세 이력서 템플릿 (성과 포함)",
            "platform": "saramin_2",
            "output_format": "docx",
            "sections": ["summary", "experience", "projects", "achievements", "skills"],
            "max_projects": 10,
            "template_content": """# {{name}} 이력서 (상세)

## 기본 정보
- 이름: {{name}}
- 이메일: {{email}}
- GitHub: {{github_username}}

## 경력 사항
{{#companies}}
### {{name}}
- 직책: {{position}}
- 기간: {{start_date}} ~ {{end_date}}
- 설명: {{description}}
{{/companies}}

## 프로젝트
{{#projects}}
### {{name}}
- 기간: {{start_date}} ~ {{end_date}}
- 역할: {{role}}
- 팀 규모: {{team_size}}명
- 기여도: {{contribution_percent}}%
- 기술스택: {{technologies}}
- 설명: {{description}}

#### 주요 성과
{{#achievements}}
- {{metric_name}}: {{metric_value}} - {{description}}
{{/achievements}}
{{/projects}}

## 기술 스택
{{skills}}
"""
        },
        {
            "name": "원티드",
            "description": "원티드 플랫폼용 이력서 템플릿",
            "platform": "wanted",
            "output_format": "docx",
            "sections": ["summary", "experience", "projects", "achievements"],
            "max_projects": 10,
            "template_content": """# {{name}}

## 소개
{{summary}}

## 경력
{{#companies}}
### {{name}} | {{position}}
{{start_date}} - {{end_date}}
{{description}}
{{/companies}}

## 프로젝트
{{#projects}}
### {{name}}
{{start_date}} - {{end_date}}

{{description}}

**주요 성과**
{{#achievements}}
- {{metric_name}}: {{metric_value}}
{{/achievements}}

**사용 기술**: {{technologies}}
{{/projects}}
"""
        },
        {
            "name": "리멤버",
            "description": "리멤버 플랫폼용 간략 이력서 템플릿",
            "platform": "remember",
            "output_format": "docx",
            "sections": ["summary", "experience", "projects"],
            "max_projects": 8,
            "max_characters": 3000,
            "template_content": """# {{name}}
{{position}} | {{company}}

## 경력 요약
{{#companies}}
- {{name}} ({{start_date}} - {{end_date}}): {{position}}
{{/companies}}

## 주요 프로젝트
{{#projects}}
- {{name}}: {{short_description}}
{{/projects}}
"""
        },
        {
            "name": "노션 포트폴리오",
            "description": "노션용 상세 포트폴리오 템플릿",
            "platform": "notion",
            "output_format": "md",
            "sections": ["summary", "experience", "projects", "achievements", "skills", "links"],
            "template_content": """# {{name}} 포트폴리오

## 👋 소개
{{summary}}

---

## 💼 경력

{{#companies}}
### {{name}}
> {{position}} | {{start_date}} - {{end_date}}

{{description}}

{{/companies}}

---

## 🚀 프로젝트

{{#projects}}
### {{name}}
> {{start_date}} - {{end_date}} | {{role}}

{{description}}

**🛠 기술 스택**
{{technologies}}

**📊 성과**
{{#achievements}}
| {{metric_name}} | {{metric_value}} |
{{/achievements}}

**🔗 링크**
{{#links}}
- [{{name}}]({{url}})
{{/links}}

---
{{/projects}}

## 🔧 기술 스택
{{skills}}

---

## 📫 연락처
- Email: {{email}}
- GitHub: [{{github_username}}](https://github.com/{{github_username}})
"""
        },
    ]

    for tmpl_data in system_templates:
        template = Template(
            user_id=None,
            is_system=1,
            **tmpl_data
        )
        db.add(template)

    await db.flush()
    return {"message": f"Initialized {len(system_templates)} system templates"}


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
