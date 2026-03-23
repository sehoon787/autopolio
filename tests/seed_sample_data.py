"""
Sample data seeding script for Autopolio.

Inserts comprehensive sample data for all Knowledge sub-menus and user profile.
Can be used for:
- Testing and demo environments
- Data dumps and export verification
- E2E test data preparation

Usage:
    # Seed to running server (default: http://localhost:8085)
    python tests/seed_sample_data.py

    # Seed to custom server
    python tests/seed_sample_data.py --base-url http://localhost:8085/api

    # Seed for a specific user
    python tests/seed_sample_data.py --user-id 46

    # Create a new user and seed
    python tests/seed_sample_data.py --create-user

    # Clean existing data before seeding
    python tests/seed_sample_data.py --clean

    # Import and use programmatically
    from tests.seed_sample_data import seed_all, SAMPLE_DATA
"""

import argparse
import sys
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sample Data Definitions
# ---------------------------------------------------------------------------

SAMPLE_PROFILE = {
    "display_name": "김세훈",
    "profile_email": "sehun.dev@gmail.com",
    "phone": "010-1234-5678",
    "address": "서울특별시 강남구",
    "birthdate": "1997-03-15",
}

SAMPLE_GENERATION_OPTIONS = {
    "default_summary_style": "professional",
    "default_analysis_language": "ko",
    "default_analysis_scope": "detailed",
    "default_output_format": "docx",
    "default_include_achievements": True,
    "default_include_tech_stack": True,
}

SAMPLE_COMPANIES = [
    {
        "name": "VibeCraft",
        "position": "풀스택 개발자",
        "department": "개발팀",
        "employment_type": "full-time",
        "start_date": "2025-06-01",
        "is_current": True,
        "description": "AI/ML 기반 SaaS 플랫폼 개발 스타트업",
        "location": "서울",
    },
    {
        "name": "Aircok",
        "position": "백엔드 개발자",
        "department": "개발팀",
        "employment_type": "full-time",
        "start_date": "2024-01-01",
        "end_date": "2025-05-31",
        "description": "IoT 환경 모니터링 및 데이터 분석 플랫폼",
        "location": "서울",
    },
    {
        "name": "TechStar Solutions",
        "position": "시니어 풀스택 개발자",
        "department": "개발팀",
        "employment_type": "full-time",
        "start_date": "2023-03-01",
        "end_date": "2023-12-31",
        "description": "핀테크 스타트업 - 결제 시스템 및 대시보드 개발",
        "location": "서울",
    },
]

SAMPLE_PROJECTS = [
    {
        "name": "Autopolio",
        "description": "GitHub 레포지토리 분석 기반 포트폴리오/이력서 자동 생성 플랫폼",
        "start_date": "2026-01-19",
        "team_size": 1,
        "role": "풀스택 개발자",
        "git_url": "https://github.com/sehoon787/autopolio.git",
        "project_type": "personal",
        "company_index": 0,  # VibeCraft
    },
    {
        "name": "NextStop",
        "description": "여행 계획 및 추천 서비스",
        "start_date": "2025-08-01",
        "team_size": 3,
        "role": "백엔드 개발자",
        "git_url": "https://github.com/sehoon787/NextStop.git",
        "project_type": "team",
        "company_index": 0,  # VibeCraft
    },
    {
        "name": "aircok_backoffice",
        "description": "IoT 센서 데이터 수집/분석 백오피스 시스템",
        "start_date": "2024-03-01",
        "end_date": "2025-05-31",
        "team_size": 5,
        "role": "백엔드 개발자",
        "git_url": "https://github.com/sehoon787/aircok_backoffice.git",
        "project_type": "company",
        "company_index": 1,  # Aircok
    },
    {
        "name": "SYC Backend",
        "description": "SYC 팀 백엔드 API 서버 개발",
        "start_date": "2023-03-01",
        "end_date": "2023-12-31",
        "team_size": 4,
        "role": "백엔드 개발자",
        "git_url": "https://github.com/sehoon787/syc-be.git",
        "project_type": "team",
        "company_index": 2,  # TechStar
    },
    {
        "name": "Coflanet App",
        "description": "Coflanet 모바일 앱 개발 (Flutter)",
        "start_date": "2022-06-01",
        "end_date": "2022-12-31",
        "team_size": 3,
        "role": "프론트엔드 개발자",
        "git_url": "https://github.com/sehoon787/coflanet-app.git",
        "project_type": "team",
    },
    {
        "name": "portfolio",
        "description": "개인 포트폴리오 관리 및 이력서 자동 생성 프로젝트",
        "start_date": "2025-12-01",
        "end_date": "2026-01-18",
        "team_size": 1,
        "role": "개인 프로젝트",
        "git_url": "https://github.com/sehoon787/portfolio.git",
        "project_type": "personal",
    },
]

SAMPLE_EDUCATIONS = [
    # --- Academic (학력) ---
    {
        "school_name": "한국공학대학교",
        "major": "컴퓨터공학과",
        "degree": "bachelor",
        "start_date": "2016-03-01",
        "end_date": "2022-02-28",
        "graduation_status": "graduated",
        "gpa": "3.5/4.5",
        "description": "소프트웨어 설계, 알고리즘, 데이터베이스, 운영체제 등 전공 이수",
        "school_country": "South Korea",
        "school_country_code": "KR",
        "display_order": 0,
    },
    {
        "school_name": "서울대학교 대학원",
        "major": "인공지능학과",
        "degree": "master",
        "start_date": "2022-03-01",
        "graduation_status": "enrolled",
        "gpa": "4.2/4.5",
        "description": "자연어처리 및 코드 생성 AI 연구, 석사 논문 준비 중",
        "school_country": "South Korea",
        "school_country_code": "KR",
        "school_state": "서울",
        "school_web_page": "https://www.snu.ac.kr",
        "display_order": 1,
    },
]

SAMPLE_TRAININGS = [
    # --- Trainings (교육이력) ---
    {
        "school_name": "네이버 부스트캠프",
        "major": "웹·모바일 풀스택",
        "degree": "bootcamp",
        "start_date": "2022-07-01",
        "end_date": "2022-12-31",
        "graduation_status": "completed",
        "description": "6개월 집중 풀스택 웹 개발 교육과정 수료",
        "school_country": "South Korea",
        "school_country_code": "KR",
        "display_order": 10,
    },
    {
        "school_name": "삼성 멀티캠퍼스",
        "major": "클라우드 네이티브 애플리케이션 개발",
        "degree": "course",
        "start_date": "2023-01-09",
        "end_date": "2023-02-28",
        "graduation_status": "completed",
        "description": "AWS/Docker/Kubernetes 기반 클라우드 네이티브 개발 실습 과정 (160시간)",
        "school_country": "South Korea",
        "school_country_code": "KR",
        "display_order": 11,
    },
    {
        "school_name": "FastCampus",
        "major": "LLM을 활용한 AI 서비스 개발",
        "degree": "course",
        "start_date": "2025-03-01",
        "end_date": "2025-05-31",
        "graduation_status": "completed",
        "description": "GPT API, LangChain, RAG 파이프라인 등 LLM 응용 개발 온라인 과정",
        "school_country": "South Korea",
        "school_country_code": "KR",
        "display_order": 12,
    },
    {
        "school_name": "Google Developer Groups",
        "major": "Flutter & Firebase Workshop",
        "degree": "workshop",
        "start_date": "2022-04-15",
        "end_date": "2022-04-16",
        "graduation_status": "completed",
        "description": "GDG Seoul 주최 Flutter 모바일 앱 개발 및 Firebase 백엔드 연동 워크숍 (2일)",
        "school_country": "South Korea",
        "school_country_code": "KR",
        "display_order": 13,
    },
]

SAMPLE_CERTIFICATIONS = [
    {
        "name": "정보처리기사",
        "issuer": "한국산업인력공단",
        "issue_date": "2021-06-15",
        "credential_id": "21-1234-5678",
        "description": "국가기술자격 소프트웨어 분야",
        "display_order": 0,
    },
    {
        "name": "AWS Solutions Architect - Associate",
        "issuer": "Amazon Web Services",
        "issue_date": "2024-03-20",
        "expiry_date": "2027-03-20",
        "credential_id": "AWS-SAA-C03-2024",
        "credential_url": "https://aws.amazon.com/verification",
        "description": "AWS 클라우드 아키텍처 설계 자격증",
        "display_order": 1,
    },
    {
        "name": "SQLD (SQL 개발자)",
        "issuer": "한국데이터산업진흥원",
        "issue_date": "2023-09-10",
        "credential_id": "SQLD-2023-9876",
        "description": "데이터베이스 SQL 활용 능력 자격증",
        "display_order": 2,
    },
]

SAMPLE_AWARDS = [
    {
        "name": "우수 프로젝트상",
        "issuer": "네이버 부스트캠프",
        "award_date": "2022-12-20",
        "description": "부스트캠프 최종 프로젝트에서 팀 프로젝트 우수상 수상",
        "display_order": 0,
    },
    {
        "name": "사내 해커톤 최우수상",
        "issuer": "Aircok",
        "award_date": "2024-11-15",
        "description": "IoT 데이터 실시간 대시보드 프로토타입 개발로 최우수상 수상",
        "display_order": 1,
    },
]

SAMPLE_PUBLICATIONS = [
    {
        "title": "IoT 환경 모니터링 시스템의 실시간 데이터 파이프라인 설계",
        "authors": "김세훈, 박지민",
        "publication_type": "conference",
        "publisher": "한국정보과학회 학술발표논문집",
        "publication_date": "2024-06-15",
        "description": "Apache Airflow 기반 실시간 센서 데이터 수집 및 분석 파이프라인 아키텍처 제안",
        "display_order": 0,
    },
    {
        "title": "LLM 기반 코드 리뷰 자동화 시스템 설계 및 구현",
        "authors": "김세훈, 이민수, 정하은",
        "publication_type": "journal",
        "publisher": "한국소프트웨어공학학회지",
        "publication_date": "2025-03-01",
        "doi": "10.5555/ksse.2025.0312",
        "description": "대규모 언어 모델을 활용한 자동 코드 리뷰 파이프라인 설계 및 실험 결과 분석",
        "display_order": 1,
    },
    {
        "title": "실전 FastAPI 백엔드 개발",
        "authors": "김세훈, 박준영",
        "publication_type": "book",
        "publisher": "한빛미디어",
        "publication_date": "2025-09-15",
        "url": "https://hanbit.co.kr/store/books/look.php?p_code=B1234567890",
        "description": "FastAPI를 활용한 프로덕션급 백엔드 구축 가이드, 공저",
        "display_order": 2,
    },
]

SAMPLE_PATENTS = [
    {
        "title": "IoT 센서 데이터 기반 실시간 이상 탐지 시스템 및 방법",
        "authors": "김세훈, 박지민, 이승호",
        "publication_type": "patent",
        "publisher": "대한민국 특허청",
        "publication_date": "2024-08-01|2025-02-15",
        "doi": "10-2024-0012345",
        "description": "IoT 환경에서 실시간 센서 데이터를 분석하여 이상 패턴을 자동 탐지하는 시스템 (출원번호: 10-2024-0012345)",
        "display_order": 3,
    },
    {
        "title": "다중 레포지토리 코드 분석을 통한 자동 이력서 생성 장치 및 방법",
        "authors": "김세훈",
        "publication_type": "patent",
        "publisher": "대한민국 특허청",
        "publication_date": "2025-06-10|2026-01-20",
        "doi": "10-2025-0067890",
        "description": "GitHub 레포지토리 분석 및 LLM 기반 이력서 자동 생성 시스템 특허 (등록번호: 10-2025-0067890)",
        "display_order": 4,
    },
]

SAMPLE_VOLUNTEER_ACTIVITIES = [
    {
        "name": "오픈소스 컨트리뷰톤",
        "organization": "정보통신산업진흥원(NIPA)",
        "activity_type": "external",
        "start_date": "2023-08-01",
        "end_date": "2023-10-31",
        "role": "컨트리뷰터",
        "description": "CVAT 프로젝트 오픈소스 기여 - 멀티뷰 어노테이션 기능 개발",
        "display_order": 0,
    },
    {
        "name": "코딩 멘토링",
        "organization": "서울시 청년 코딩 교육 프로그램",
        "activity_type": "volunteer",
        "start_date": "2024-03-01",
        "end_date": "2024-06-30",
        "hours": 80,
        "role": "멘토",
        "description": "비전공자 대상 Python/웹 개발 기초 멘토링 진행 (수강생 15명)",
        "display_order": 1,
    },
]

# Aggregate all sample data for easy import
SAMPLE_DATA = {
    "profile": SAMPLE_PROFILE,
    "generation_options": SAMPLE_GENERATION_OPTIONS,
    "companies": SAMPLE_COMPANIES,
    "projects": SAMPLE_PROJECTS,
    "educations": SAMPLE_EDUCATIONS,
    "trainings": SAMPLE_TRAININGS,
    "certifications": SAMPLE_CERTIFICATIONS,
    "awards": SAMPLE_AWARDS,
    "publications": SAMPLE_PUBLICATIONS,
    "patents": SAMPLE_PATENTS,
    "volunteer_activities": SAMPLE_VOLUNTEER_ACTIVITIES,
}


# ---------------------------------------------------------------------------
# Seeding Functions
# ---------------------------------------------------------------------------


def _post(client: httpx.Client, path: str, user_id: int, data: dict) -> dict:
    """POST helper with error handling."""
    r = client.post(path, params={"user_id": user_id}, json=data)
    r.raise_for_status()
    return r.json()


def _put(client: httpx.Client, path: str, data: dict) -> dict:
    """PUT helper with error handling."""
    r = client.put(path, json=data)
    r.raise_for_status()
    return r.json()


def seed_profile(client: httpx.Client, user_id: int) -> dict:
    """Update user profile with sample data."""
    result = _put(client, f"/users/{user_id}/profile", SAMPLE_PROFILE)
    logger.info("Profile updated: %s", result.get("effective_name"))
    return result


def seed_generation_options(client: httpx.Client, user_id: int) -> dict:
    """Set generation options."""
    result = _put(
        client, f"/users/{user_id}/generation-options", SAMPLE_GENERATION_OPTIONS
    )
    logger.info("Generation options updated")
    return result


def seed_companies(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample companies. Returns list of created companies."""
    results = []
    for company in SAMPLE_COMPANIES:
        c = _post(client, "/knowledge/companies", user_id, company)
        results.append(c)
        logger.info("Company created: [%d] %s", c["id"], c["name"])
    return results


def seed_projects(
    client: httpx.Client, user_id: int, company_ids: Optional[list[int]] = None
) -> list[dict]:
    """Create sample projects, linking to companies by index."""
    results = []
    for proj in SAMPLE_PROJECTS:
        data = {k: v for k, v in proj.items() if k != "company_index"}
        ci = proj.get("company_index")
        if ci is not None and company_ids and ci < len(company_ids):
            data["company_id"] = company_ids[ci]
        p = _post(client, "/knowledge/projects", user_id, data)
        results.append(p)
        logger.info("Project created: [%d] %s", p["id"], p["name"])
    return results


def seed_educations(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample education records."""
    results = []
    for edu in SAMPLE_EDUCATIONS:
        e = _post(client, "/knowledge/credentials/educations", user_id, edu)
        results.append(e)
        logger.info("Education created: [%d] %s", e["id"], e["school_name"])
    return results


def seed_trainings(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample training/course records (stored as educations with training degree types)."""
    results = []
    for training in SAMPLE_TRAININGS:
        t = _post(client, "/knowledge/credentials/educations", user_id, training)
        results.append(t)
        logger.info("Training created: [%d] %s", t["id"], t["school_name"])
    return results


def seed_certifications(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample certifications."""
    results = []
    for cert in SAMPLE_CERTIFICATIONS:
        c = _post(client, "/knowledge/credentials/certifications", user_id, cert)
        results.append(c)
        logger.info("Certification created: [%d] %s", c["id"], c["name"])
    return results


def seed_awards(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample awards."""
    results = []
    for award in SAMPLE_AWARDS:
        a = _post(client, "/knowledge/credentials/awards", user_id, award)
        results.append(a)
        logger.info("Award created: [%d] %s", a["id"], a["name"])
    return results


def seed_publications(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample publications (journals, conferences, books)."""
    results = []
    for pub in SAMPLE_PUBLICATIONS:
        p = _post(client, "/knowledge/credentials/publications", user_id, pub)
        results.append(p)
        logger.info("Publication created: [%d] %s", p["id"], p["title"])
    return results


def seed_patents(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample patents."""
    results = []
    for patent in SAMPLE_PATENTS:
        p = _post(client, "/knowledge/credentials/publications", user_id, patent)
        results.append(p)
        logger.info("Patent created: [%d] %s", p["id"], p["title"])
    return results


def seed_volunteer_activities(client: httpx.Client, user_id: int) -> list[dict]:
    """Create sample volunteer/external activities."""
    results = []
    for act in SAMPLE_VOLUNTEER_ACTIVITIES:
        a = _post(client, "/knowledge/credentials/volunteer_activities", user_id, act)
        results.append(a)
        logger.info("Activity created: [%d] %s", a["id"], a["name"])
    return results


def clean_user_data(client: httpx.Client, user_id: int) -> None:
    """Delete all existing data for a user (companies, projects, credentials)."""
    endpoints = [
        "/knowledge/credentials/volunteer_activities",
        "/knowledge/credentials/publications",
        "/knowledge/credentials/awards",
        "/knowledge/credentials/certifications",
        "/knowledge/credentials/educations",
    ]
    for ep in endpoints:
        r = client.get(ep, params={"user_id": user_id})
        if r.status_code == 200:
            items = r.json()
            id_key = "id"
            for item in items:
                client.delete(f"{ep}/{item[id_key]}", params={"user_id": user_id})

    # Projects (need to delete before companies due to FK)
    r = client.get("/knowledge/projects", params={"user_id": user_id})
    if r.status_code == 200:
        data = r.json()
        projects = data.get("projects", data) if isinstance(data, dict) else data
        for p in projects:
            client.delete(f"/knowledge/projects/{p['id']}", params={"user_id": user_id})

    # Companies
    r = client.get("/knowledge/companies", params={"user_id": user_id})
    if r.status_code == 200:
        for c in r.json():
            client.delete(
                f"/knowledge/companies/{c['id']}", params={"user_id": user_id}
            )

    logger.info("Cleaned all data for user %d", user_id)


def seed_all(client: httpx.Client, user_id: int) -> dict:
    """
    Seed all sample data for a user.

    Returns dict with all created resource IDs for reference.
    """
    profile = seed_profile(client, user_id)
    seed_generation_options(client, user_id)
    companies = seed_companies(client, user_id)
    company_ids = [c["id"] for c in companies]
    projects = seed_projects(client, user_id, company_ids)
    educations = seed_educations(client, user_id)
    trainings = seed_trainings(client, user_id)
    certifications = seed_certifications(client, user_id)
    awards = seed_awards(client, user_id)
    publications = seed_publications(client, user_id)
    patents = seed_patents(client, user_id)
    activities = seed_volunteer_activities(client, user_id)

    summary = {
        "user_id": user_id,
        "profile": profile,
        "companies": [c["id"] for c in companies],
        "projects": [p["id"] for p in projects],
        "educations": [e["id"] for e in educations],
        "trainings": [t["id"] for t in trainings],
        "certifications": [c["id"] for c in certifications],
        "awards": [a["id"] for a in awards],
        "publications": [p["id"] for p in publications],
        "patents": [p["id"] for p in patents],
        "volunteer_activities": [a["id"] for a in activities],
    }
    return summary


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Seed sample data for Autopolio")
    parser.add_argument(
        "--base-url",
        default="http://localhost:8085/api",
        help="API base URL (default: http://localhost:8085/api)",
    )
    parser.add_argument(
        "--user-id", type=int, default=None, help="User ID to seed data for"
    )
    parser.add_argument(
        "--create-user", action="store_true", help="Create a new test user"
    )
    parser.add_argument(
        "--clean", action="store_true", help="Clean existing data before seeding"
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    with httpx.Client(base_url=args.base_url, timeout=30.0) as client:
        # Determine user ID
        user_id = args.user_id
        if user_id is None:
            if args.create_user:
                r = client.post(
                    "/users",
                    json={"name": "Sample User", "email": "sample@example.com"},
                )
                r.raise_for_status()
                user_id = r.json()["id"]
                logger.info("Created user: %d", user_id)
            else:
                # Find first user
                r = client.get("/users")
                r.raise_for_status()
                users = r.json()
                if not users:
                    logger.error("No users found. Use --create-user or --user-id")
                    sys.exit(1)
                user_id = users[0]["id"]
                logger.info(
                    "Using existing user: %d (%s)", user_id, users[0].get("name")
                )

        if args.clean:
            clean_user_data(client, user_id)

        summary = seed_all(client, user_id)

        print("\n=== Sample Data Seeded Successfully ===")
        print(f"User ID: {summary['user_id']}")
        print(f"Companies: {len(summary['companies'])} created")
        print(f"Projects: {len(summary['projects'])} created")
        print(f"Educations (학력): {len(summary['educations'])} created")
        print(f"Trainings (교육이력): {len(summary['trainings'])} created")
        print(f"Certifications: {len(summary['certifications'])} created")
        print(f"Awards: {len(summary['awards'])} created")
        print(f"Publications: {len(summary['publications'])} created")
        print(f"Patents: {len(summary['patents'])} created")
        print(f"Volunteer Activities: {len(summary['volunteer_activities'])} created")


if __name__ == "__main__":
    main()
