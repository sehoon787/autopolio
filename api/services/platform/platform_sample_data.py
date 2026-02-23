"""
Platform Sample Data - Provides sample data for template previews.

Extracted from platform_template_service.py for better modularity.
"""

from typing import Dict, Any
from datetime import datetime


def get_sample_data(platform_key: str) -> Dict[str, Any]:
    """Get sample data for a platform template preview.

    Args:
        platform_key: The platform key (e.g., 'saramin', 'wanted')

    Returns:
        Dictionary with sample resume/career data
    """
    return {
        "name": "홍길동",
        "email": "gildong.hong@email.com",
        "phone": "010-1234-5678",
        "photo_url": "",
        "address": "서울특별시 강남구",
        # Birthdate info for saramin template
        "description": "1990.05.15 (35세)",
        "birthdate": "1990-05-15",
        "birthdate_formatted": "1990년 05월 15일",
        "birthdate_short": "1990.05.15",
        "birth_year": 1990,
        "age": 35,
        # Career info
        "status": "경력",
        "career_status": "경력",
        "current_company": "테크스타트 주식회사",
        "total_experience": "5년",
        "total_experience_years": 5,
        "is_working": True,
        "desired_salary": "회사내규에 따름",
        "current_salary": "",
        "school": "한국대학교",
        "degree": "학사 졸업",
        "desired_position": "풀스택 개발자",
        "summary": "5년차 풀스택 개발자로서 React, Node.js, Python 기반의 웹 애플리케이션 개발 경험이 풍부합니다. 스타트업에서 대기업까지 다양한 환경에서 프로젝트를 성공적으로 이끌어왔으며, 새로운 기술 습득과 팀 협업을 즐깁니다.",
        "github_url": "https://github.com/gildong",
        "portfolio_url": "https://gildong.dev",
        "has_links": True,
        "has_experiences": True,
        "has_capabilities": False,
        "experiences": _get_sample_experiences(),
        "projects": _get_sample_projects(),
        "skills": [
            "JavaScript",
            "TypeScript",
            "Python",
            "SQL",
            "React",
            "Next.js",
            "FastAPI",
            "Express.js",
            "PostgreSQL",
            "MongoDB",
            "Redis",
            "Docker",
            "AWS",
            "Git",
        ],
        "skills_categorized": {
            "languages": ["JavaScript", "TypeScript", "Python", "SQL"],
            "frameworks": ["React", "Next.js", "FastAPI", "Express.js"],
            "databases": ["PostgreSQL", "MongoDB", "Redis"],
            "tools": ["Docker", "AWS", "Git", "GitHub Actions"],
        },
        "educations": _get_sample_educations(),
        "has_educations": True,
        "has_education": True,
        "certifications": [
            {
                "name": "정보처리기사",
                "issuer": "한국산업인력공단",
                "issue_date": "2019.05",
                "date": "2019.05",
                "credential_id": "19-001234",
            },
            {
                "name": "AWS Solutions Architect Associate",
                "issuer": "Amazon Web Services",
                "issue_date": "2022.03",
                "date": "2022.03",
                "credential_id": "AWS-SAA-001234",
            },
        ],
        "has_certifications": True,
        "awards": [
            {
                "name": "우수 개발자상",
                "issuer": "테크스타트 주식회사",
                "award_date": "2023.12",
                "description": "분기 MVP 선정",
            },
            {
                "name": "해커톤 대상",
                "issuer": "한국SW산업협회",
                "award_date": "2022.08",
                "description": "AI 활용 서비스 개발 부문",
            },
        ],
        "has_awards": True,
        "publications": [
            {
                "title": "대규모 언어 모델 기반 문서 요약 시스템",
                "authors": "홍길동, 김철수",
                "publication_type": "학술논문",
                "publisher": "한국정보과학회",
                "publication_date": "2023.06",
                "doi": "10.1234/kips.2023.001",
                "description": "GPT 모델을 활용한 자동 문서 요약 연구",
            }
        ],
        "has_publications": True,
        "volunteer_activities": [
            {
                "name": "코딩 멘토링",
                "organization": "코드잇",
                "activity_type": "external",
                "period": "2022.03 - 2023.02",
                "hours": 120,
                "role": "멘토",
                "description": "비전공자 대상 프로그래밍 기초 교육",
            }
        ],
        "has_volunteer_activities": True,
        "generated_date": datetime.now().strftime("%Y-%m-%d"),
    }


def _get_sample_experiences():
    """Get sample work experiences."""
    return [
        {
            "company": "테크스타트 주식회사",
            "company_name": "테크스타트 주식회사",
            "position": "시니어 프론트엔드 개발자",
            "start_date": "2022.03",
            "end_date": "",
            "is_current": True,
            "duration": "2년 10개월",
            "description": "SaaS 플랫폼 개발, 시스템 설계",
            "achievements": [
                "페이지 로딩 속도 40% 개선",
                "컴포넌트 라이브러리 구축으로 개발 생산성 30% 향상",
            ],
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
                        {"text": "Microservices 아키텍처 설계"},
                    ],
                    "has_implementations": True,
                    "databases": ["PostgreSQL", "MySQL"],
                    "databases_str": "PostgreSQL, MySQL",
                    "has_databases": True,
                },
                {
                    "domain_name": "Frontend",
                    "domain_index": 2,
                    "technologies": ["React", "TypeScript", "Next.js"],
                    "technologies_str": "React, TypeScript, Next.js",
                    "has_technologies": True,
                    "implementations": [
                        {"text": "React 기반 SaaS 플랫폼 프론트엔드 개발"},
                        {"text": "컴포넌트 라이브러리 구축"},
                    ],
                    "has_implementations": True,
                    "databases": [],
                    "databases_str": "",
                    "has_databases": False,
                },
                {
                    "domain_name": "AI/ML",
                    "domain_index": 3,
                    "technologies": ["LangChain", "OpenAI API"],
                    "technologies_str": "LangChain, OpenAI API",
                    "has_technologies": True,
                    "implementations": [
                        {"text": "RAG 시스템 구축"},
                        {"text": "GPT-4 기반 문서 분석 파이프라인"},
                    ],
                    "has_implementations": True,
                    "databases": [],
                    "databases_str": "",
                    "has_databases": False,
                },
            ],
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
            "achievements": [
                "REST API 설계 및 구현",
                "MySQL 쿼리 최적화로 응답시간 60% 단축",
            ],
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
                        {"text": "REST API 설계 및 구현"},
                    ],
                    "has_implementations": True,
                    "databases": ["MySQL"],
                    "databases_str": "MySQL",
                    "has_databases": True,
                }
            ],
        },
    ]


def _get_sample_projects():
    """Get sample projects."""
    return [
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
            "technologies_list": [
                "React",
                "TypeScript",
                "FastAPI",
                "PostgreSQL",
                "OpenAI API",
            ],
            "team_size": 3,
            "key_tasks_list": [
                "GPT-4 API 기반 문서 분석 파이프라인 구축",
                "React 기반 사용자 대시보드 개발",
                "FastAPI 백엔드 API 서버 구현",
                "PostgreSQL 기반 문서 메타데이터 관리 시스템",
            ],
            "has_key_tasks": True,
            "achievements": "• 문서 처리 시간 80% 단축\n• 월간 활성 사용자 5,000명 달성",
            "has_achievements": True,
            "achievements_grouped": [
                {
                    "category": "성능 개선",
                    "items": [
                        {"title": "문서 처리 시간 80% 단축"},
                        {"title": "API 응답 속도 3배 향상"},
                    ],
                },
                {
                    "category": "사용자 성장",
                    "items": [{"title": "월간 활성 사용자 5,000명 달성"}],
                },
            ],
            "git_url": "https://github.com/example/doc-analyzer",
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
            "technologies_list": [
                "React",
                "Canvas API",
                "Socket.io",
                "Node.js",
                "Redis",
            ],
            "team_size": 2,
            "key_tasks_list": [
                "Canvas API 기반 드로잉 엔진 개발",
                "WebSocket 기반 실시간 동기화 구현",
                "Redis Pub/Sub 기반 이벤트 브로커",
            ],
            "has_key_tasks": True,
            "achievements": "• 동시 접속자 1,000명 지원",
            "has_achievements": True,
            "achievements_grouped": [
                {
                    "category": "인프라 성과",
                    "items": [{"title": "동시 접속자 1,000명 지원"}],
                }
            ],
            "git_url": "",
        },
    ]


def _get_sample_educations():
    """Get sample educations."""
    return [
        {
            "school": "한국대학교",
            "school_name": "한국대학교",
            "major": "컴퓨터공학과",
            "degree": "학사",
            "start_date": "2015.03",
            "end_date": "2019.02",
            "period": "2015.03 - 2019.02",
            "gpa": "3.8/4.5",
            "description": "소프트웨어 공학 전공",
        }
    ]
