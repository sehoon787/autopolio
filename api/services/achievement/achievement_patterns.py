"""
Achievement Detection Patterns

This module contains all pattern constants used for achievement detection
from commit messages, project descriptions, and other text sources.

Patterns support both Korean and English text.
"""
from typing import Dict, List, Tuple

# Achievement detection patterns (Korean + English)
ACHIEVEMENT_PATTERNS: Dict[str, List[Tuple[str, str, str]]] = {
    "performance": [
        # Korean patterns
        (r"(\d+)\s*%\s*(성능|속도).*(향상|개선|증가|up)", "성능 향상", "{value}% 성능 향상"),
        (r"(\d+)\s*배\s*(성능|속도).*(향상|개선|증가)", "성능 향상", "{value}배 성능 향상"),
        (r"(성능|속도).*(향상|개선|증가).*(\d+)\s*%", "성능 향상", "{value}% 성능 향상"),
        (r"(성능|속도).*(향상|개선|증가).*(\d+)\s*배", "성능 향상", "{value}배 성능 향상"),
        # English patterns
        (r"(\d+)\s*%\s*(performance|speed)\s*(improve|increase|boost)", "성능 향상", "{value}% 성능 향상"),
        (r"(\d+)x\s*(faster|performance)", "성능 향상", "{value}x 성능 향상"),
    ],
    "efficiency": [
        (r"(\d+)\s*%\s*(생산성|효율).*(향상|개선|증가)", "생산성 향상", "{value}% 생산성 향상"),
        (r"(\d+)\s*배\s*(생산성|효율).*(향상|개선|증가)", "생산성 향상", "{value}배 생산성 향상"),
        (r"(시간|작업).*(단축|절감|감소).*(\d+)\s*%", "작업 시간 단축", "{value}% 작업 시간 단축"),
        (r"(\d+)\s*%\s*(time|effort).*(reduce|save)", "작업 시간 단축", "{value}% 작업 시간 단축"),
    ],
    "reduction": [
        (r"(\d+)\s*%\s*(감소|절감|제거|줄)", "비용/시간 절감", "{value}% 절감"),
        (r"(에러|오류|버그).*(감소|줄).*(\d+)\s*%", "오류 감소", "{value}% 오류 감소"),
        (r"(메모리|memory).*(감소|절감|reduce).*(\d+)\s*%", "메모리 사용량 절감", "{value}% 메모리 절감"),
        (r"(\d+)\s*%\s*(reduce|decrease).*(error|bug)", "오류 감소", "{value}% 오류 감소"),
    ],
    "accuracy": [
        (r"(\d+)\s*%\s*(정확도|정확성|accuracy)", "정확도", "정확도 {value}%"),
        (r"(\d+)\s*%\s*(성공률|success\s*rate)", "성공률", "성공률 {value}%"),
        (r"(정확도|accuracy).*(\d+)\s*%", "정확도", "정확도 {value}%"),
    ],
    "scale": [
        (r"(\d+)\s*만?\s*(명|사용자|user|customer).*(달성|도달|확보)", "사용자 수", "{value}명 사용자 달성"),
        (r"MAU\s*(\d+)", "월간 활성 사용자", "MAU {value}명"),
        (r"DAU\s*(\d+)", "일간 활성 사용자", "DAU {value}명"),
        (r"(\d+)\s*K?\s*(transaction|건).*(처리|handle)", "처리량", "{value}건 처리"),
    ],
    "cost": [
        (r"(비용|cost).*(절감|reduce|save).*(\d+)\s*%", "비용 절감", "{value}% 비용 절감"),
        (r"(\d+)\s*%\s*(비용|cost).*(절감|reduce|save)", "비용 절감", "{value}% 비용 절감"),
        (r"(\d+)\s*원.*(절감|절약|감소)", "비용 절감", "{value}원 비용 절감"),
        (r"(서버|인프라).*(비용|cost).*(\d+)\s*%\s*(절감|감소)", "인프라 비용 절감", "{value}% 인프라 비용 절감"),
    ],
    "quality": [
        # 코드 품질
        (r"(코드\s*품질|code\s*quality).*(\d+)\s*%\s*(향상|개선)", "코드 품질 향상", "{value}% 코드 품질 향상"),
        (r"(테스트\s*커버리지|test\s*coverage).*(\d+)\s*%", "테스트 커버리지", "테스트 커버리지 {value}%"),
        (r"(커버리지|coverage).*(\d+)\s*%\s*(달성|향상)", "테스트 커버리지", "커버리지 {value}% 달성"),
        (r"(\d+)\s*%\s*(커버리지|coverage)", "테스트 커버리지", "커버리지 {value}%"),
        # 안정성
        (r"(가용성|availability).*(\d+)\s*%", "가용성", "가용성 {value}%"),
        (r"(\d+)\s*%\s*(가용성|uptime)", "가용성", "가용성 {value}%"),
        (r"(장애|incident).*(\d+)\s*%\s*(감소|줄)", "장애 감소", "{value}% 장애 감소"),
    ],
    "delivery": [
        # 개발 속도/배포
        (r"(배포\s*주기|deploy\s*cycle).*(\d+)\s*%\s*(단축|개선)", "배포 주기 단축", "{value}% 배포 주기 단축"),
        (r"(개발\s*시간|development\s*time).*(\d+)\s*%\s*(단축|절감)", "개발 시간 단축", "{value}% 개발 시간 단축"),
        (r"(\d+)\s*회\/?(주|월|일).*(배포|deploy)", "배포 빈도", "{value}회 배포"),
        (r"(리드\s*타임|lead\s*time).*(\d+)\s*%\s*(단축|감소)", "리드 타임 단축", "{value}% 리드 타임 단축"),
    ],
    "user": [
        # 사용자 관련
        (r"(사용자\s*만족도|user\s*satisfaction).*(\d+)\s*%", "사용자 만족도", "사용자 만족도 {value}%"),
        (r"(NPS|nps).*(\d+)", "NPS", "NPS {value}"),
        (r"(이탈률|churn).*(\d+)\s*%\s*(감소|줄)", "이탈률 감소", "{value}% 이탈률 감소"),
        (r"(전환율|conversion).*(\d+)\s*%\s*(증가|향상)", "전환율 향상", "{value}% 전환율 향상"),
        (r"(\d+)\s*%\s*(전환율|conversion)", "전환율", "전환율 {value}%"),
    ],
}

# Commit message patterns for achievements (Korean + English)
COMMIT_ACHIEVEMENT_PATTERNS: List[Tuple[str, str, str]] = [
    # English patterns
    (r"improve.*(\d+)%", "개선", "{value}% 개선"),
    (r"optimize.*(\d+)%", "최적화", "{value}% 최적화"),
    (r"reduce.*(\d+)%", "감소", "{value}% 감소"),
    (r"fix.*#?(\d+).*bug", "버그 수정", "#{value} 버그 수정"),
    (r"add.*(\d+).*feature", "기능 추가", "{value}개 기능 추가"),
    (r"refactor.*(\d+).*file", "리팩토링", "{value}개 파일 리팩토링"),
    # Korean patterns - 개선/최적화
    (r"(\d+)\s*%\s*(개선|향상|증가)", "개선", "{value}% 개선"),
    (r"(\d+)\s*배\s*(개선|향상|빨라)", "개선", "{value}배 개선"),
    (r"(개선|향상|증가).*(\d+)\s*%", "개선", "{value}% 개선"),
    (r"(최적화|optimize).*(\d+)\s*%", "최적화", "{value}% 최적화"),
    # Korean patterns - 감소/절감
    (r"(\d+)\s*%\s*(감소|절감|줄임|축소)", "감소", "{value}% 감소"),
    (r"(감소|절감|줄임|축소).*(\d+)\s*%", "감소", "{value}% 감소"),
    # Korean patterns - 버그/오류
    (r"(버그|bug|오류|에러)\s*#?(\d+)\s*(수정|fix|해결)", "버그 수정", "#{value} 버그 수정"),
    (r"(수정|fix|해결).*#?(\d+).*(버그|bug|오류)", "버그 수정", "#{value} 버그 수정"),
    (r"(\d+)\s*개?\s*(버그|오류)\s*(수정|해결)", "버그 수정", "{value}개 버그 수정"),
    # Korean patterns - 기능/리팩토링
    (r"(\d+)\s*개?\s*(기능|feature).*(추가|구현|개발)", "기능 추가", "{value}개 기능 추가"),
    (r"(기능|feature)\s*(\d+)\s*개?\s*(추가|구현|개발)", "기능 추가", "{value}개 기능 추가"),
    (r"(\d+)\s*개?\s*(파일|모듈).*(리팩토링|refactor|정리)", "리팩토링", "{value}개 파일 리팩토링"),
    # Korean patterns - API/테스트
    (r"(\d+)\s*개?\s*API.*(추가|개발|구현)", "API 개발", "{value}개 API 추가"),
    (r"(\d+)\s*개?\s*(테스트|test).*(추가|작성)", "테스트 추가", "{value}개 테스트 추가"),
    (r"(커버리지|coverage).*(\d+)\s*%", "테스트 커버리지", "커버리지 {value}%"),
    # Korean patterns - 응답 시간/처리량
    (r"(응답\s*시간|response\s*time).*(\d+)\s*%\s*(단축|개선|감소)", "응답 시간 개선", "{value}% 응답 시간 개선"),
    (r"(\d+)\s*ms.*(\d+)\s*ms.*(단축|개선)", "응답 시간 개선", "응답 시간 개선"),
    (r"(처리량|throughput).*(\d+)\s*(배|%)\s*(증가|향상)", "처리량 향상", "{value}배 처리량 향상"),
    # Korean patterns - 배포/자동화
    (r"(배포\s*시간|deploy).*(\d+)\s*%\s*(단축|개선)", "배포 시간 단축", "{value}% 배포 시간 단축"),
    (r"(자동화|automation).*(\d+)\s*%", "자동화", "{value}% 자동화"),
]

# Category keywords mapping for achievement categorization
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "성능 향상": [
        "성능", "속도", "빠르", "향상", "개선", "최적화", "응답",
        "performance", "speed", "fast", "improve", "optimize", "response"
    ],
    "기능 확장": [
        "기능", "확장", "추가", "지원", "구현", "개발",
        "feature", "extend", "add", "support", "implement", "develop"
    ],
    "사용자 경험 개선": [
        "사용자", "UI", "UX", "인터페이스", "접근성", "편의",
        "user", "interface", "accessibility", "experience"
    ],
    "생산성 향상": [
        "생산성", "자동화", "효율", "시간", "단축",
        "productivity", "automation", "efficient", "time", "reduce"
    ],
    "코드 품질": [
        "코드", "품질", "리팩토링", "테스트", "커버리지", "모듈",
        "code", "quality", "refactor", "test", "coverage", "module"
    ],
    "안정성": [
        "안정", "오류", "에러", "버그", "가용성", "장애",
        "stable", "error", "bug", "availability", "failure"
    ],
    "비용 절감": [
        "비용", "절감", "절약", "감소", "인프라",
        "cost", "save", "reduce", "infrastructure"
    ],
}

# Category mapping from English to Korean
CATEGORY_MAP: Dict[str, str] = {
    "performance": "성능 향상",
    "efficiency": "생산성 향상",
    "reduction": "비용 절감",
    "accuracy": "성능 향상",
    "scale": "기능 확장",
    "cost": "비용 절감",
    "quality": "코드 품질",
    "delivery": "생산성 향상",
    "user": "사용자 경험 개선",
    "contribution": "코드 품질",
    "commit": "코드 품질",
}

# Preferred order for displaying categories
ORDERED_CATEGORIES: List[str] = [
    "성능 향상",
    "기능 확장",
    "사용자 경험 개선",
    "생산성 향상",
    "코드 품질",
    "안정성",
    "비용 절감",
    "기타"
]
