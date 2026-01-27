"""
Achievement Service - Detects and generates achievements from project data.

Detects quantitative achievements from:
1. Commit messages (performance improvements, bug fixes, etc.)
2. Project descriptions
3. LLM-based generation for richer achievements
"""
from typing import Dict, List, Any, Optional, Tuple
import re
from api.services.llm_service import LLMService


class AchievementService:
    """Service for detecting and generating project achievements."""

    # Achievement detection patterns (Korean + English)
    ACHIEVEMENT_PATTERNS = {
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
    COMMIT_ACHIEVEMENT_PATTERNS = [
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

    def __init__(self, llm_provider: Optional[str] = None):
        self.llm_provider = llm_provider

    def detect_from_text(self, text: str) -> List[Dict[str, Any]]:
        """Detect achievements from any text."""
        if not text:
            return []

        achievements = []
        text_lower = text.lower()

        for category, patterns in self.ACHIEVEMENT_PATTERNS.items():
            for pattern, metric_name, template in patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE)
                for match in matches:
                    # Find the numeric value from groups
                    value = None
                    for group in match.groups():
                        if group and group.isdigit():
                            value = group
                            break

                    if value:
                        achievements.append({
                            "metric_name": metric_name,
                            "metric_value": template.format(value=value),
                            "category": category,
                            "evidence": match.group(0),
                            "source": "pattern_match"
                        })

        return achievements

    def detect_from_commits(self, commit_messages: List[str]) -> List[Dict[str, Any]]:
        """Detect achievements from commit messages."""
        if not commit_messages:
            return []

        achievements = []
        combined_text = "\n".join(commit_messages)

        # First, try standard text patterns
        text_achievements = self.detect_from_text(combined_text)
        achievements.extend(text_achievements)

        # Then, try commit-specific patterns
        for msg in commit_messages:
            msg_lower = msg.lower()
            for pattern, metric_name, template in self.COMMIT_ACHIEVEMENT_PATTERNS:
                match = re.search(pattern, msg_lower)
                if match:
                    value = match.group(1) if match.groups() else None
                    if value:
                        achievements.append({
                            "metric_name": metric_name,
                            "metric_value": template.format(value=value),
                            "category": "commit",
                            "evidence": msg,
                            "source": "commit_pattern"
                        })

        # Deduplicate by metric_name + metric_value
        seen = set()
        unique_achievements = []
        for a in achievements:
            key = (a["metric_name"], a["metric_value"])
            if key not in seen:
                seen.add(key)
                unique_achievements.append(a)

        return unique_achievements

    def detect_from_description(self, description: str) -> List[Dict[str, Any]]:
        """Detect achievements from project description."""
        return self.detect_from_text(description)

    def detect_from_code_stats(
        self,
        total_commits: int,
        lines_added: int,
        lines_deleted: int,
        files_changed: int,
        commit_categories: Dict[str, int]
    ) -> List[Dict[str, Any]]:
        """Generate achievements from code statistics."""
        achievements = []

        # Code contribution achievement with meaningful description
        if lines_added > 0:
            net_lines = lines_added - lines_deleted
            refactor_ratio = round((lines_deleted / lines_added) * 100) if lines_added > 0 else 0

            # Determine contribution type
            if refactor_ratio > 50:
                description = "코드 리팩토링 및 최적화 수행"
            elif net_lines > 5000:
                description = "대규모 기능 개발 및 아키텍처 구축"
            elif net_lines > 1000:
                description = "주요 기능 개발 및 모듈 구현"
            else:
                description = "기능 추가 및 유지보수"

            achievements.append({
                "metric_name": "코드 기여",
                "metric_value": f"+{lines_added:,} / -{lines_deleted:,} lines",
                "description": description,
                "before_value": f"기존 코드베이스",
                "after_value": f"순 {net_lines:,}줄 추가, {files_changed}개 파일 수정",
                "category": "contribution",
                "evidence": f"추가: {lines_added:,}줄, 삭제: {lines_deleted:,}줄, 파일: {files_changed}개",
                "source": "code_stats"
            })

        # Feature commits ratio with context
        if commit_categories:
            feature_count = commit_categories.get("feature", 0)
            fix_count = commit_categories.get("fix", 0)
            refactor_count = commit_categories.get("refactor", 0)
            total = sum(commit_categories.values())

            if total > 0 and feature_count > 0:
                feature_ratio = round(feature_count / total * 100)
                achievements.append({
                    "metric_name": "기능 개발",
                    "metric_value": f"{feature_count}개 기능",
                    "description": f"프로젝트 전체 커밋의 {feature_ratio}% 차지",
                    "category": "contribution",
                    "source": "code_stats"
                })

            if fix_count > 0:
                achievements.append({
                    "metric_name": "버그 수정 및 안정화",
                    "metric_value": f"{fix_count}건 해결",
                    "description": "이슈 해결 및 품질 개선",
                    "category": "quality",
                    "source": "code_stats"
                })

            if refactor_count > 0:
                achievements.append({
                    "metric_name": "코드 리팩토링",
                    "metric_value": f"{refactor_count}건",
                    "description": "코드 품질 및 유지보수성 향상",
                    "category": "quality",
                    "source": "code_stats"
                })

        return achievements

    async def generate_with_llm(
        self,
        project_data: Dict[str, Any],
        commit_summary: Optional[str] = None,
        existing_achievements: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """Generate achievements using LLM based on project data."""
        if not self.llm_provider:
            return []

        llm_service = LLMService(self.llm_provider)

        existing_list = ""
        if existing_achievements:
            existing_list = "\n기존에 감지된 성과:\n" + "\n".join(
                f"- {a['metric_name']}: {a['metric_value']}"
                for a in existing_achievements
            )

        prompt = f"""다음 프로젝트 정보를 바탕으로 이력서에 적합한 정량적 성과를 추출해주세요.

프로젝트 정보:
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 팀 규모: {project_data.get('team_size', 'N/A')}명
- 기여도: {project_data.get('contribution_percent', 'N/A')}%
- 기술 스택: {', '.join(project_data.get('technologies', []))}

코드 통계:
- 총 커밋: {project_data.get('total_commits', 'N/A')}
- 추가된 라인: {project_data.get('lines_added', 'N/A')}
- 삭제된 라인: {project_data.get('lines_deleted', 'N/A')}

커밋 요약: {commit_summary or 'N/A'}
{existing_list}

위 정보를 바탕으로 3-5개의 정량적 성과를 JSON 배열로 작성해주세요.
각 성과는 구체적인 수치(%, 배, 건 등)를 포함해야 합니다.
기존에 감지된 성과와 중복되지 않는 새로운 성과를 생성해주세요.

성과 형식 예시 (Before/After 형식 사용):
**[ Export 최적화 ]**
- Keyframe 전용 export 구현
  ▶ 파일 크기 **80% 감소**, 속도 **3-5배 향상**

형식:
[
    {{
        "metric_name": "성과 제목 (예: API 응답 시간 최적화, 배포 자동화)",
        "metric_value": "핵심 정량 수치 (예: 80% 개선, 3배 향상)",
        "description": "수행한 작업 내용 (예: Redis 캐싱 적용으로 DB 부하 감소)",
        "before_value": "개선 전 상태 (예: 평균 2초 응답 시간, 수동 배포)",
        "after_value": "개선 후 상태 (예: 평균 200ms 응답 시간, CI/CD 자동화)",
        "category": "카테고리 (performance/efficiency/quality/scale/cost)"
    }}
]

주의:
- 반드시 정량적 수치를 포함해야 합니다
- before_value와 after_value는 비교 가능한 형태로 작성하세요
- 현실적이고 믿을 수 있는 수치를 사용하세요
- 프로젝트 규모와 맥락에 맞는 성과를 생성하세요
"""

        try:
            response = await llm_service.provider.generate(
                prompt,
                system_prompt="당신은 개발자 이력서 작성을 돕는 전문가입니다. 프로젝트 정보를 바탕으로 정량적 성과를 추출하세요.",
                max_tokens=1500,
                temperature=0.3
            )

            # Parse JSON response
            import json
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]

            achievements = json.loads(json_str.strip())

            # Add source field
            for a in achievements:
                a["source"] = "llm_generated"
                a["evidence"] = "LLM 기반 생성"

            return achievements

        except Exception as e:
            return []

    async def detect_all(
        self,
        project_data: Dict[str, Any],
        commit_messages: Optional[List[str]] = None,
        use_llm: bool = True
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Detect all achievements from various sources.

        Returns:
            Tuple of (achievements list, detection stats)
        """
        all_achievements = []
        stats = {
            "pattern_detected": 0,
            "code_stats_generated": 0,
            "llm_generated": 0,
            "total": 0
        }

        # 1. Detect from project description
        if project_data.get("description"):
            desc_achievements = self.detect_from_description(project_data["description"])
            for a in desc_achievements:
                a["source_type"] = "description"
            all_achievements.extend(desc_achievements)
            stats["pattern_detected"] += len(desc_achievements)

        # 2. Detect from commit messages
        if commit_messages:
            commit_achievements = self.detect_from_commits(commit_messages)
            for a in commit_achievements:
                a["source_type"] = "commit"
            all_achievements.extend(commit_achievements)
            stats["pattern_detected"] += len(commit_achievements)

        # 3. Generate from code statistics
        code_stats_achievements = self.detect_from_code_stats(
            total_commits=project_data.get("total_commits", 0),
            lines_added=project_data.get("lines_added", 0),
            lines_deleted=project_data.get("lines_deleted", 0),
            files_changed=project_data.get("files_changed", 0),
            commit_categories=project_data.get("commit_categories", {})
        )
        for a in code_stats_achievements:
            a["source_type"] = "code_stats"
        all_achievements.extend(code_stats_achievements)
        stats["code_stats_generated"] = len(code_stats_achievements)

        # 4. Generate with LLM if enabled
        if use_llm and self.llm_provider:
            llm_achievements = await self.generate_with_llm(
                project_data,
                commit_summary=project_data.get("commit_summary"),
                existing_achievements=all_achievements
            )
            for a in llm_achievements:
                a["source_type"] = "llm"
            all_achievements.extend(llm_achievements)
            stats["llm_generated"] = len(llm_achievements)

        # Deduplicate
        seen = set()
        unique_achievements = []
        for a in all_achievements:
            key = (a.get("metric_name", ""), a.get("metric_value", ""))
            if key not in seen and key[0] and key[1]:
                seen.add(key)
                unique_achievements.append(a)

        stats["total"] = len(unique_achievements)

        # Add display_order
        for i, a in enumerate(unique_achievements):
            a["display_order"] = i

        return unique_achievements, stats

    def categorize_achievements(
        self,
        achievements: List[Dict[str, Any]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Categorize achievements by type for better organization.

        Categories:
        - 성능 향상 (Performance): Speed, response time, memory improvements
        - 기능 확장 (Feature Expansion): New features, scalability
        - 사용자 경험 개선 (UX): UI/UX, accessibility
        - 생산성 향상 (Productivity): Automation, time savings
        - 코드 품질 (Code Quality): Refactoring, test coverage
        - 안정성 (Stability): Error reduction, availability
        - 비용 절감 (Cost): Cost savings, resource optimization
        - 기타 (Other): Other achievements
        """
        # Category keywords mapping
        category_keywords = {
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

        categorized: Dict[str, List[Dict[str, Any]]] = {}

        for achievement in achievements:
            # Get text to match
            text_to_match = (
                f"{achievement.get('metric_name', '')} "
                f"{achievement.get('metric_value', '')} "
                f"{achievement.get('description', '')} "
                f"{achievement.get('category', '')}"
            ).lower()

            # Find best matching category
            matched_category = None
            max_matches = 0

            for category, keywords in category_keywords.items():
                matches = sum(1 for kw in keywords if kw.lower() in text_to_match)
                if matches > max_matches:
                    max_matches = matches
                    matched_category = category

            # Use existing category if present, otherwise use matched or "기타"
            if achievement.get("category"):
                # Map common English categories to Korean
                category_map = {
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
                existing_cat = achievement["category"].lower()
                final_category = category_map.get(existing_cat, matched_category or "기타")
            else:
                final_category = matched_category or "기타"

            # Add to categorized dict
            if final_category not in categorized:
                categorized[final_category] = []

            categorized[final_category].append(achievement)

        # Sort categories in preferred order
        ordered_categories = [
            "성능 향상",
            "기능 확장",
            "사용자 경험 개선",
            "생산성 향상",
            "코드 품질",
            "안정성",
            "비용 절감",
            "기타"
        ]

        ordered_result: Dict[str, List[Dict[str, Any]]] = {}
        for cat in ordered_categories:
            if cat in categorized:
                ordered_result[cat] = categorized[cat]

        # Add any remaining categories
        for cat in categorized:
            if cat not in ordered_result:
                ordered_result[cat] = categorized[cat]

        return ordered_result
