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
        ],
    }

    # Commit message patterns for achievements
    COMMIT_ACHIEVEMENT_PATTERNS = [
        (r"improve.*(\d+)%", "개선", "{value}% 개선"),
        (r"optimize.*(\d+)%", "최적화", "{value}% 최적화"),
        (r"reduce.*(\d+)%", "감소", "{value}% 감소"),
        (r"fix.*#?(\d+).*bug", "버그 수정", "#{value} 버그 수정"),
        (r"add.*(\d+).*feature", "기능 추가", "{value}개 기능 추가"),
        (r"refactor.*(\d+).*file", "리팩토링", "{value}개 파일 리팩토링"),
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

        # Commits count achievement
        if total_commits > 0:
            achievements.append({
                "metric_name": "커밋 수",
                "metric_value": f"{total_commits}개 커밋",
                "category": "contribution",
                "evidence": f"총 {total_commits}개의 커밋을 작성함",
                "source": "code_stats"
            })

        # Lines of code achievement
        if lines_added > 0:
            net_lines = lines_added - lines_deleted
            achievements.append({
                "metric_name": "코드 기여량",
                "metric_value": f"+{lines_added:,} / -{lines_deleted:,} lines",
                "description": f"순 추가량: {net_lines:,} lines",
                "category": "contribution",
                "evidence": f"추가: {lines_added:,}줄, 삭제: {lines_deleted:,}줄",
                "source": "code_stats"
            })

        # Files changed achievement
        if files_changed > 0:
            achievements.append({
                "metric_name": "수정 파일 수",
                "metric_value": f"{files_changed}개 파일",
                "category": "contribution",
                "evidence": f"총 {files_changed}개 파일 수정",
                "source": "code_stats"
            })

        # Feature commits ratio
        if commit_categories:
            feature_count = commit_categories.get("feature", 0)
            fix_count = commit_categories.get("fix", 0)
            total = sum(commit_categories.values())

            if total > 0 and feature_count > 0:
                feature_ratio = round(feature_count / total * 100)
                achievements.append({
                    "metric_name": "기능 개발 비율",
                    "metric_value": f"{feature_ratio}%",
                    "description": f"전체 {total}개 커밋 중 {feature_count}개가 기능 개발",
                    "category": "contribution",
                    "source": "code_stats"
                })

            if fix_count > 0:
                achievements.append({
                    "metric_name": "버그 수정",
                    "metric_value": f"{fix_count}건",
                    "description": f"{fix_count}개의 버그 수정 커밋",
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

형식:
[
    {{
        "metric_name": "성과 지표명 (예: 성능 향상, API 응답 시간)",
        "metric_value": "정량적 수치 (예: 40% 개선, 3배 향상)",
        "description": "성과에 대한 간략한 설명",
        "category": "카테고리 (performance/efficiency/quality/scale/cost)"
    }}
]

주의:
- 반드시 정량적 수치를 포함해야 합니다
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
