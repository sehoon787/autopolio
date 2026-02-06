"""
System Template Initialization Service
Provides system templates for document generation on first startup.
"""

from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.template import Template


# System templates definition
SYSTEM_TEMPLATES = [
    {
        "name": "경력기술서",
        "description": "인적사항, 학력, 경력, 프로젝트를 포함한 상세 경력기술서",
        "platform": "career_description",
        "output_format": "docx",
        "sections": ["personal_info", "education", "experience", "projects", "skills", "certifications", "awards"],
        "max_projects": 20,
        "template_content": """# 경력기술서

## {{name}}
{{summary}}

---

## 인적사항

| 항목 | 내용 |
|------|------|
| 성명 | {{name}} |
| 생년월일 | {{birthdate}} |
| 주소 | {{address}} |
| 연락처 | {{phone}} |
| 이메일 | {{email}} |

---

{{#has_educations}}
## 학력사항

{{#educations}}
### {{school_name}}
| 항목 | 내용 |
|------|------|
| 학교명 | {{school_name}} |
| 입학일/졸업일 | {{period}} |
| 전공 | {{major}} |
{{#gpa}}| 학점 | {{gpa}} |{{/gpa}}

{{/educations}}
{{/has_educations}}

---

## 경력사항

{{#companies}}
### {{name}}
| 항목 | 내용 |
|------|------|
| 회사명 | {{name}} |
| 입사일/퇴사일 | {{start_date}} ~ {{end_date}} |
| 소속부서/직급 | {{department}} / {{position}} |
| 직무 | {{description}} |

{{/companies}}

---

## 기술스택

| 분류 | 기술 |
|------|------|
| Programming Languages | {{programming_languages}} |
| Framework/Library | {{frameworks}} |
| Infra (DevOps) | {{devops}} |
| Tooling | {{tooling}} |
| Database | {{databases}} |

---

## 주요 프로젝트

{{#projects}}
### {{name}}
**{{company_name}} / {{department}} / {{position}}**

- **기간**: {{start_date}} ~ {{end_date}}
- **역할**: {{role}}
- **기술 스택**: {{technologies}}

{{description}}

**주요 구현 기능**
{{#key_tasks}}
- {{.}}
{{/key_tasks}}

{{#has_achievements}}
**성과**
{{#achievements_summary_list}}
- **[{{category}}] {{title}}**
{{/achievements_summary_list}}
{{/has_achievements}}

---
{{/projects}}

{{#has_certifications}}
## 자격사항

{{#certifications}}
- **{{name}}** - {{issuer}} ({{issue_date}})
{{/certifications}}
{{/has_certifications}}

---

{{#has_awards}}
## 수상내역

{{#awards}}
- **{{name}}** - {{issuer}} ({{award_date}})
{{/awards}}
{{/has_awards}}
"""
    },
    {
        "name": "이력서",
        "description": "인적사항, 학력, 경력, 프로젝트, 자기소개를 포함한 종합 이력서",
        "platform": "resume",
        "output_format": "docx",
        "sections": ["personal_info", "salary_info", "education", "experience", "projects", "skills", "certifications", "awards", "self_introduction"],
        "max_projects": 20,
        "template_content": """# 이력서

## {{name}}
{{summary}}

---

**현재연봉**: {{current_salary}}
**희망연봉**: {{desired_salary}}
**이직사유**: {{job_change_reason}}
**입사 가능일**: {{available_date}}

---

## 인적사항

| 항목 | 내용 |
|------|------|
| 성명 | {{name}} |
| 생년월일 | {{birthdate}} |
| 주소 | {{address}} |
| 연락처 | {{phone}} |
| 이메일 | {{email}} |

---

{{#has_educations}}
## 학력사항

{{#educations}}
### {{school_name}}
| 항목 | 내용 |
|------|------|
| 학교명 | {{school_name}} |
| 입학일/졸업일 | {{period}} |
| 전공 | {{major}} |
{{#gpa}}| 학점 | {{gpa}} |{{/gpa}}

{{/educations}}
{{/has_educations}}

---

## 경력사항

{{#companies}}
### {{name}}
| 항목 | 내용 |
|------|------|
| 회사명 | {{name}} |
| 입사일/퇴사일 | {{start_date}} ~ {{end_date}} |
| 소속부서/직급 | {{department}} / {{position}} |
| 직무 | {{description}} |

{{/companies}}

---

## 기술스택

| 분류 | 기술 |
|------|------|
| Programming Languages | {{programming_languages}} |
| Framework/Library | {{frameworks}} |
| Infra (DevOps) | {{devops}} |
| Tooling | {{tooling}} |
| Database | {{databases}} |

---

## 주요 프로젝트

{{#projects}}
### {{name}}
**{{company_name}} / {{department}} / {{position}}**

- **기간**: {{start_date}} ~ {{end_date}}
- **역할**: {{role}}
- **기술 스택**: {{technologies}}

{{description}}

**주요 구현 기능**
{{#key_tasks}}
- {{.}}
{{/key_tasks}}

{{#has_achievements}}
**성과**
{{#achievements_summary_list}}
- **[{{category}}] {{title}}**
{{/achievements_summary_list}}
{{/has_achievements}}

---
{{/projects}}

{{#has_certifications}}
## 자격사항

{{#certifications}}
- **{{name}}** - {{issuer}} ({{issue_date}})
{{/certifications}}
{{/has_certifications}}

---

{{#has_awards}}
## 수상내역

{{#awards}}
- **{{name}}** - {{issuer}} ({{award_date}})
{{/awards}}
{{/has_awards}}

---

## 자기소개

### 지원 동기
{{motivation}}

### 업무 수행 역량
{{competencies}}

### 성격 및 가치관
{{personality}}
"""
    },
    {
        "name": "노션 포트폴리오",
        "description": "노션용 상세 포트폴리오 템플릿",
        "platform": "notion",
        "output_format": "md",
        "sections": ["summary", "experience", "projects", "achievements", "skills", "links"],
        "template_content": """# {{name}} 포트폴리오

## 소개
{{summary}}

---

## 경력

{{#companies}}
### {{name}}
> {{position}} | {{start_date}} - {{end_date}}

{{description}}

{{/companies}}

---

## 프로젝트

{{#projects}}
### {{name}}
> {{start_date}} - {{end_date}} | {{role}}

{{description}}

**기술 스택**
{{technologies}}

{{#has_achievements}}
**성과**
{{#achievements_summary_list}}
- **[{{category}}] {{title}}**
{{/achievements_summary_list}}
{{/has_achievements}}

---
{{/projects}}

## 기술 스택
{{skills}}

---

{{#has_educations}}
## 학력
{{#educations}}
### {{school_name}}
> {{degree}} {{major}} | {{period}}{{#gpa}} | 학점: {{gpa}}{{/gpa}}

{{/educations}}
{{/has_educations}}

{{#has_certifications}}
## 자격증
{{#certifications}}
- **{{name}}** | {{issuer}} ({{issue_date}})
{{/certifications}}

{{/has_certifications}}

{{#has_awards}}
## 수상이력
{{#awards}}
- **{{name}}** | {{issuer}} ({{award_date}})
{{/awards}}

{{/has_awards}}

## 연락처
- Email: {{email}}
- GitHub: [{{github_username}}](https://github.com/{{github_username}})
"""
    },
]


async def init_system_templates(db: AsyncSession) -> int:
    """
    Initialize system templates if they don't exist.

    Returns:
        Number of templates created
    """
    # Get existing system templates
    result = await db.execute(select(Template).where(Template.is_system == 1))
    existing_platforms = {t.platform for t in result.scalars().all()}

    created_count = 0

    for tmpl_data in SYSTEM_TEMPLATES:
        platform = tmpl_data.get("platform")

        # Skip if already exists
        if platform in existing_platforms:
            continue

        # Create new template
        template = Template(
            user_id=None,
            is_system=1,
            **tmpl_data
        )
        db.add(template)
        created_count += 1

    if created_count > 0:
        await db.flush()

    return created_count
