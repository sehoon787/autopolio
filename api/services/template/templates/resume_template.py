"""
Resume Template - Template for comprehensive resume documents.
"""

RESUME_TEMPLATE = """# 이력서

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

{{#has_research_experiences}}
## 연구실 경력

{{#research_experiences}}
### {{name}}
| 항목 | 내용 |
|------|------|
| 연구실명 | {{name}} |
| 기간 | {{period}} |
| 연구 분야 | {{field}} |

{{/research_experiences}}
{{/has_research_experiences}}

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

{{#has_freelance_experiences}}
## 프리랜서 경력

{{#freelance_experiences}}
### {{company}}
| 항목 | 내용 |
|------|------|
| 회사명 | {{company}} |
| 기간 | {{period}} |
| 소속부서/직급 | {{department}} |
| 직무 | {{description}} |

{{/freelance_experiences}}
{{/has_freelance_experiences}}

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
{{#achievements_grouped}}
**[{{category}}]**
{{#items}}
- {{title}}
{{/items}}
{{/achievements_grouped}}
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

{{#has_trainings}}
## 교육사항

{{#trainings}}
- **{{name}}** ({{period}})
  {{description}}
{{/trainings}}
{{/has_trainings}}

---

{{#has_others}}
## 기타사항

{{#others}}
**{{category}}**
{{content}}

{{/others}}
{{/has_others}}

---

## 자기소개

### 지원 동기
{{motivation}}

### 업무 수행 역량
{{competencies}}

### 성격 및 가치관
{{personality}}
"""

__all__ = ["RESUME_TEMPLATE"]
