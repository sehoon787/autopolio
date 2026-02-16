"""
Localized strings for report generation.

Provides Korean and English strings used in report services,
eliminating hardcoded Korean text from report_service.py and report_base.py.
"""

STRINGS = {
    "ko": {
        # report_base.py
        "ongoing": "진행중",
        # report_base.py - category display names
        "category_backend": "Backend 시스템",
        "category_frontend": "Frontend",
        "category_mobile": "Mobile",
        "category_ai_ml": "AI/ML",
        "category_iot": "IoT/하드웨어",
        "category_other": "기타",
        # report_service.py - general
        "freelancer": "개인/프리랜서",
        "developer": "개발자",
        "unspecified": "미지정",
        "no_achievements": "*등록된 성과가 없습니다.*",
        "no_projects": "*등록된 프로젝트 없음*",
        # report_service.py - headers
        "project_list_title": "프로젝트 목록",
        "total_projects": "총 {count}개 프로젝트",
        "period": "기간",
        "company": "소속",
        "team_size": "투입인원",
        "team_size_value": "{count}명",
        "role": "역할",
        "description": "설명",
        "git": "Git",
        "tech_stack": "기술스택",
        # report_service.py - performance summary
        "performance_title": "프로젝트 성과 요약",
        "performance_subtitle": "정량적 성과 중심의 프로젝트 요약입니다.",
        # report_service.py - company integrated
        "career_title": "경력 사항 (회사별 통합)",
        "tech_stack_label": "담당 기술 스택",
        "main_projects": "주요 프로젝트",
        "freelancer_section": "개인/프리랜서 프로젝트",
        # report_service.py - final report fallbacks
        "new_features": "신규 기능 {count}개 개발",
        "bug_fixes": "버그 수정 및 안정화 ({count}건)",
        "refactoring": "코드 리팩토링 ({count}건)",
        # export_service.py - report headers
        "report_date": "작성일",
        "report_target": "분석 대상",
        "report_target_value": "{count}개 프로젝트",
        "report_total_commits": "총 커밋 수",
        "report_total_commits_value": "{count}개",
        "report_period": "작업 기간",
        "report_analyst": "분석 대상자",
        "report_summary_title": "프로젝트 완료결과보고서",
        "report_summary_empty": "분석된 프로젝트가 없습니다.",
        "report_detailed_title": "프로젝트 상세 보고서",
        "report_detailed_empty": "분석된 프로젝트가 없습니다.",
        "report_final_title": "프로젝트 최종 보고서",
        "report_final_empty": "분석된 프로젝트가 없습니다.",
        # export_sections.py - TOC and overview
        "toc_title": "목차",
        "toc_overview": "전체 프로젝트 개요",
        "overview_title": "전체 프로젝트 개요",
        "overview_stats_title": "프로젝트 포트폴리오 통계",
        "overview_col_category": "분류",
        "overview_col_count": "프로젝트 수",
        "overview_col_tech": "주요 기술 스택",
        "overview_total": "총계",
        "overview_various_tech": "다양한 기술 스택",
        # export_sections.py - project sections
        "section_key_tasks": "주요 수행 업무",
        "section_achievements": "프로젝트 성과",
        "section_code_stats": "코드 기여 통계",
        "section_project_overview": "프로젝트 개요",
        "section_tech_stack": "기술 스택",
        "section_implementation": "주요 구현 기능",
        "section_timeline": "개발 타임라인",
        "section_main_achievements": "주요 성과",
        "section_performance": "성과",
        "no_tech_info": "기술 스택 정보 없음",
        "other_achievements": "기타 성과",
        # export_sections.py - labels
        "label_repository": "저장소",
        "label_github": "GitHub",
        "label_commits": "커밋",
        "label_commits_value": "{count}개",
        "label_code_change": "코드 변경량",
        "label_lines_added": "{count} 라인 추가",
        "label_lines_deleted": "{count} 라인 삭제",
        "label_project_nature": "프로젝트 성격",
        "label_intro": "소개",
        "label_total_commits": "총 커밋",
        "label_user_commits": "사용자 커밋",
        "label_contribution_rate": "기여율",
        "label_added_lines": "추가된 라인",
        "label_deleted_lines": "삭제된 라인",
        # export_sections.py - date
        "date_ongoing": "현재",
        "date_unspecified": "기간 미정",
        # export_sections.py - before/after
        "label_before": "기존",
        "label_after": "개선",
        # per-repo labels
        "per_repo_title": "레포지토리별 상세",
    },
    "en": {
        # report_base.py
        "ongoing": "Ongoing",
        # report_base.py - category display names
        "category_backend": "Backend Systems",
        "category_frontend": "Frontend",
        "category_mobile": "Mobile",
        "category_ai_ml": "AI/ML",
        "category_iot": "IoT/Hardware",
        "category_other": "Other",
        # report_service.py - general
        "freelancer": "Personal/Freelance",
        "developer": "Developer",
        "unspecified": "Not specified",
        "no_achievements": "*No achievements registered.*",
        "no_projects": "*No projects registered*",
        # report_service.py - headers
        "project_list_title": "Project List",
        "total_projects": "Total {count} projects",
        "period": "Period",
        "company": "Company",
        "team_size": "Team Size",
        "team_size_value": "{count} members",
        "role": "Role",
        "description": "Description",
        "git": "Git",
        "tech_stack": "Tech Stack",
        # report_service.py - performance summary
        "performance_title": "Project Performance Summary",
        "performance_subtitle": "A quantitative performance-focused project summary.",
        # report_service.py - company integrated
        "career_title": "Career History (By Company)",
        "tech_stack_label": "Technology Stack",
        "main_projects": "Key Projects",
        "freelancer_section": "Personal/Freelance Projects",
        # report_service.py - final report fallbacks
        "new_features": "Developed {count} new features",
        "bug_fixes": "Bug fixes and stabilization ({count} issues)",
        "refactoring": "Code refactoring ({count} tasks)",
        # export_service.py - report headers
        "report_date": "Date",
        "report_target": "Target",
        "report_target_value": "{count} projects",
        "report_total_commits": "Total Commits",
        "report_total_commits_value": "{count:,}",
        "report_period": "Period",
        "report_analyst": "Analyst",
        "report_summary_title": "Project Completion Report",
        "report_summary_empty": "No analyzed projects found.",
        "report_detailed_title": "Project Detailed Report",
        "report_detailed_empty": "No analyzed projects found.",
        "report_final_title": "Project Final Report",
        "report_final_empty": "No analyzed projects found.",
        # export_sections.py - TOC and overview
        "toc_title": "Table of Contents",
        "toc_overview": "Project Overview",
        "overview_title": "Project Overview",
        "overview_stats_title": "Project Portfolio Statistics",
        "overview_col_category": "Category",
        "overview_col_count": "Projects",
        "overview_col_tech": "Key Technologies",
        "overview_total": "Total",
        "overview_various_tech": "Various Technologies",
        # export_sections.py - project sections
        "section_key_tasks": "Key Tasks",
        "section_achievements": "Achievements",
        "section_code_stats": "Code Contribution Statistics",
        "section_project_overview": "Project Overview",
        "section_tech_stack": "Technology Stack",
        "section_implementation": "Key Implementation Features",
        "section_timeline": "Development Timeline",
        "section_main_achievements": "Key Achievements",
        "section_performance": "Achievements",
        "no_tech_info": "No technology stack information",
        "other_achievements": "Other Achievements",
        # export_sections.py - labels
        "label_repository": "Repository",
        "label_github": "GitHub",
        "label_commits": "Commits",
        "label_commits_value": "{count}",
        "label_code_change": "Code Changes",
        "label_lines_added": "{count} lines added",
        "label_lines_deleted": "{count} lines deleted",
        "label_project_nature": "Project Description",
        "label_intro": "Introduction",
        "label_total_commits": "Total Commits",
        "label_user_commits": "User Commits",
        "label_contribution_rate": "Contribution Rate",
        "label_added_lines": "Lines Added",
        "label_deleted_lines": "Lines Deleted",
        # export_sections.py - date
        "date_ongoing": "Present",
        "date_unspecified": "Not specified",
        # export_sections.py - before/after
        "label_before": "Before",
        "label_after": "After",
        # per-repo labels
        "per_repo_title": "Per-Repository Details",
    },
}


def get_strings(language: str = "ko") -> dict:
    """Get localized strings for the given language."""
    return STRINGS.get(language, STRINGS["ko"])
