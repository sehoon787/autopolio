"""
Lookup Router - API endpoints for autocomplete functionality
"""

from typing import Optional, List
from fastapi import APIRouter, Query

from api.services.core import get_lookup_service

router = APIRouter(prefix="/lookup", tags=["lookup"])


@router.get("/certifications")
async def search_certifications(
    q: str = Query(..., min_length=1, description="Search query"),
    lang: str = Query("ko", description="Language (ko/en)"),
    category: Optional[str] = Query(None, description="Category filter"),
    limit: int = Query(20, ge=1, le=50, description="Maximum results")
):
    """
    Search certifications for autocomplete

    Returns matching certifications with name, issuer, and category.
    Supports both Korean and English queries.
    """
    service = get_lookup_service()
    results = service.search_certifications(
        query=q,
        lang=lang,
        category=category,
        limit=limit
    )
    return {"results": results, "total": len(results)}


@router.get("/certifications/categories")
async def get_certification_categories():
    """Get list of available certification categories"""
    service = get_lookup_service()
    categories = service.get_certification_categories()
    return {"categories": categories}


@router.get("/universities")
async def search_universities(
    q: str = Query(..., min_length=1, description="Search query"),
    country: Optional[str] = Query(None, description="Country code filter (KR, US, etc.)"),
    limit: int = Query(20, ge=1, le=50, description="Maximum results")
):
    """
    Search universities for autocomplete

    Returns matching universities with name, country, and city.
    Supports both Korean and English queries.
    """
    service = get_lookup_service()
    results = service.search_universities(
        query=q,
        country=country,
        limit=limit
    )
    return {"results": results, "total": len(results)}


@router.get("/universities/countries")
async def get_university_countries():
    """Get list of countries with universities in the database"""
    service = get_lookup_service()
    countries = service.get_countries()
    return {"countries": countries}


@router.get("/majors")
async def search_majors(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=50, description="Maximum results")
):
    """
    Search common majors for autocomplete

    Returns matching major names in Korean and English.
    """
    # Common majors list (static for now)
    majors = [
        {"name": "컴퓨터공학", "name_en": "Computer Science"},
        {"name": "컴퓨터과학", "name_en": "Computer Science"},
        {"name": "소프트웨어공학", "name_en": "Software Engineering"},
        {"name": "정보통신공학", "name_en": "Information and Communications Engineering"},
        {"name": "전자공학", "name_en": "Electrical Engineering"},
        {"name": "전기공학", "name_en": "Electrical Engineering"},
        {"name": "전자전기공학", "name_en": "Electrical and Electronic Engineering"},
        {"name": "기계공학", "name_en": "Mechanical Engineering"},
        {"name": "산업공학", "name_en": "Industrial Engineering"},
        {"name": "화학공학", "name_en": "Chemical Engineering"},
        {"name": "건축공학", "name_en": "Architectural Engineering"},
        {"name": "토목공학", "name_en": "Civil Engineering"},
        {"name": "경영학", "name_en": "Business Administration"},
        {"name": "경제학", "name_en": "Economics"},
        {"name": "회계학", "name_en": "Accounting"},
        {"name": "수학", "name_en": "Mathematics"},
        {"name": "통계학", "name_en": "Statistics"},
        {"name": "물리학", "name_en": "Physics"},
        {"name": "화학", "name_en": "Chemistry"},
        {"name": "생물학", "name_en": "Biology"},
        {"name": "데이터사이언스", "name_en": "Data Science"},
        {"name": "인공지능", "name_en": "Artificial Intelligence"},
        {"name": "정보보안", "name_en": "Information Security"},
        {"name": "사이버보안", "name_en": "Cybersecurity"},
        {"name": "영어영문학", "name_en": "English Language and Literature"},
        {"name": "국어국문학", "name_en": "Korean Language and Literature"},
        {"name": "심리학", "name_en": "Psychology"},
        {"name": "사회학", "name_en": "Sociology"},
        {"name": "법학", "name_en": "Law"},
        {"name": "의학", "name_en": "Medicine"},
        {"name": "간호학", "name_en": "Nursing"},
        {"name": "약학", "name_en": "Pharmacy"},
        {"name": "디자인", "name_en": "Design"},
        {"name": "시각디자인", "name_en": "Visual Design"},
        {"name": "산업디자인", "name_en": "Industrial Design"},
        {"name": "미디어학", "name_en": "Media Studies"},
        {"name": "언론정보학", "name_en": "Journalism and Communication"},
        {"name": "게임공학", "name_en": "Game Engineering"},
        {"name": "멀티미디어공학", "name_en": "Multimedia Engineering"},
        {"name": "로봇공학", "name_en": "Robotics Engineering"},
        {"name": "신소재공학", "name_en": "Materials Science and Engineering"},
        {"name": "바이오공학", "name_en": "Bioengineering"},
        {"name": "환경공학", "name_en": "Environmental Engineering"},
    ]

    q_lower = q.lower()
    results = []

    for major in majors:
        name = major["name"]
        name_en = major["name_en"]

        score = 0
        if q_lower in name.lower():
            score = 100 if name.lower().startswith(q_lower) else 80
        elif q_lower in name_en.lower():
            score = 90 if name_en.lower().startswith(q_lower) else 70

        if score > 0:
            results.append({**major, "score": score})

    results.sort(key=lambda x: (-x["score"], x["name"]))
    return {"results": results[:limit], "total": min(len(results), limit)}
