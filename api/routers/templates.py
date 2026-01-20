from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import os
import uuid

from api.database import get_db
from api.config import get_settings, PLATFORM_CONFIGS
from api.models.template import Template
from api.models.user import User
from api.schemas.template import TemplateCreate, TemplateUpdate, TemplateResponse, TemplateListResponse
from api.services.document_service import DocumentService

router = APIRouter()
settings = get_settings()


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
