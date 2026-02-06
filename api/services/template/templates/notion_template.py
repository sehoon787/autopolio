"""
Notion Portfolio Template - Template for Notion-style portfolio documents.
"""

NOTION_PORTFOLIO_TEMPLATE = """# {{name}} 포트폴리오

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

**링크**
{{#links}}
- [{{name}}]({{url}})
{{/links}}

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

{{#has_publications}}
## 논문/저술
{{#publications}}
- **{{title}}** | {{publisher}} ({{publication_date}})
{{/publications}}

{{/has_publications}}

{{#has_volunteer_activities}}
## 봉사/대외활동
{{#volunteer_activities}}
- **{{name}}** | {{organization}} ({{period}})
{{/volunteer_activities}}

{{/has_volunteer_activities}}

## 연락처
- Email: {{email}}
- GitHub: [{{github_username}}](https://github.com/{{github_username}})
"""

__all__ = ["NOTION_PORTFOLIO_TEMPLATE"]
