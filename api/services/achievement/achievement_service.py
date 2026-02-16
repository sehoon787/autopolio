"""
Achievement Service - Detects and generates achievements from project data.

Detects quantitative achievements from:
1. Commit messages (performance improvements, bug fixes, etc.)
2. Project descriptions
3. LLM-based generation for richer achievements
"""
from typing import Dict, List, Any, Optional, Tuple
import re
from api.services.llm import LLMService
from .achievement_patterns import (
    ACHIEVEMENT_PATTERNS,
    COMMIT_ACHIEVEMENT_PATTERNS,
    CATEGORY_KEYWORDS,
    CATEGORY_MAP,
    ORDERED_CATEGORIES,
    translate_metric_name,
    translate_template,
    translate_commit_metric,
    translate_commit_template,
    translate_category,
    get_ordered_categories,
    get_category_keywords,
)


class AchievementService:
    """Service for detecting and generating project achievements."""

    def __init__(self, llm_provider: Optional[str] = None):
        self.llm_provider = llm_provider

    def detect_from_text(self, text: str, language: str = "ko") -> List[Dict[str, Any]]:
        """Detect achievements from any text.

        Args:
            text: Text to search for achievements
            language: Output language ("ko" or "en")
        """
        if not text:
            return []

        achievements = []

        for category, patterns in ACHIEVEMENT_PATTERNS.items():
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
                        metric_value = template.format(value=value)
                        achievements.append({
                            "metric_name": translate_metric_name(metric_name, language),
                            "metric_value": translate_template(metric_value, language),
                            "category": category,
                            "evidence": match.group(0),
                            "source": "pattern_match"
                        })

        return achievements

    def detect_from_commits(self, commit_messages: List[str], language: str = "ko") -> List[Dict[str, Any]]:
        """Detect achievements from commit messages.

        Args:
            commit_messages: List of commit messages
            language: Output language ("ko" or "en")
        """
        if not commit_messages:
            return []

        achievements = []
        combined_text = "\n".join(commit_messages)

        # First, try standard text patterns
        text_achievements = self.detect_from_text(combined_text, language)
        achievements.extend(text_achievements)

        # Then, try commit-specific patterns
        for msg in commit_messages:
            msg_lower = msg.lower()
            for pattern, metric_name, template in COMMIT_ACHIEVEMENT_PATTERNS:
                match = re.search(pattern, msg_lower)
                if match:
                    value = match.group(1) if match.groups() else None
                    if value:
                        metric_value = template.format(value=value)
                        achievements.append({
                            "metric_name": translate_commit_metric(metric_name, language),
                            "metric_value": translate_commit_template(metric_value, language),
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

    def detect_from_description(self, description: str, language: str = "ko") -> List[Dict[str, Any]]:
        """Detect achievements from project description."""
        return self.detect_from_text(description, language)

    def detect_from_code_stats(
        self,
        total_commits: int,
        lines_added: int,
        lines_deleted: int,
        files_changed: int,
        commit_categories: Dict[str, int],
        language: str = "ko"
    ) -> List[Dict[str, Any]]:
        """Generate achievements from code statistics.

        Note: Code line counts (lines added/deleted) are NOT included as achievements
        because writing/deleting many lines of code is not a meaningful achievement.
        Only commit category-based achievements (features, bug fixes, refactoring) are generated.

        Args:
            language: Output language ("ko" for Korean, "en" for English)
        """
        achievements = []

        # Translations for achievements
        translations = {
            "ko": {
                "feature_dev": "기능 개발",
                "features_count": "{count}개 기능",
                "feature_ratio_desc": "프로젝트 전체 커밋의 {ratio}% 차지",
                "bug_fix": "버그 수정 및 안정화",
                "fixes_count": "{count}건 해결",
                "bug_fix_desc": "이슈 해결 및 품질 개선",
                "refactoring": "코드 리팩토링",
                "refactor_count": "{count}건",
                "refactor_desc": "코드 품질 및 유지보수성 향상",
            },
            "en": {
                "feature_dev": "Feature Development",
                "features_count": "{count} features",
                "feature_ratio_desc": "{ratio}% of all project commits",
                "bug_fix": "Bug Fixes & Stabilization",
                "fixes_count": "{count} issues resolved",
                "bug_fix_desc": "Issue resolution and quality improvement",
                "refactoring": "Code Refactoring",
                "refactor_count": "{count} refactors",
                "refactor_desc": "Improved code quality and maintainability",
            }
        }

        t = translations.get(language, translations["ko"])

        # Feature commits ratio with context
        if commit_categories:
            feature_count = commit_categories.get("feature", 0)
            fix_count = commit_categories.get("fix", 0)
            refactor_count = commit_categories.get("refactor", 0)
            total = sum(commit_categories.values())

            if total > 0 and feature_count > 0:
                feature_ratio = round(feature_count / total * 100)
                achievements.append({
                    "metric_name": t["feature_dev"],
                    "metric_value": t["features_count"].format(count=feature_count),
                    "description": t["feature_ratio_desc"].format(ratio=feature_ratio),
                    "category": "contribution",
                    "source": "code_stats"
                })

            if fix_count > 0:
                achievements.append({
                    "metric_name": t["bug_fix"],
                    "metric_value": t["fixes_count"].format(count=fix_count),
                    "description": t["bug_fix_desc"],
                    "category": "quality",
                    "source": "code_stats"
                })

            if refactor_count > 0:
                achievements.append({
                    "metric_name": t["refactoring"],
                    "metric_value": t["refactor_count"].format(count=refactor_count),
                    "description": t["refactor_desc"],
                    "category": "quality",
                    "source": "code_stats"
                })

        return achievements

    async def generate_with_llm(
        self,
        project_data: Dict[str, Any],
        commit_summary: Optional[str] = None,
        existing_achievements: Optional[List[Dict[str, Any]]] = None,
        language: str = "ko"
    ) -> List[Dict[str, Any]]:
        """Generate achievements using LLM based on project data.

        Args:
            language: Output language ("ko" or "en")
        """
        if not self.llm_provider:
            return []

        llm_service = LLMService(self.llm_provider)

        try:
            existing_list = ""
            if existing_achievements:
                existing_list_items = "\n".join(
                    f"- {a['metric_name']}: {a['metric_value']}"
                    for a in existing_achievements
                )
                if language == "en":
                    existing_list = f"\nPreviously detected achievements:\n{existing_list_items}"
                else:
                    existing_list = f"\n기존에 감지된 성과:\n{existing_list_items}"

            if language == "en":
                prompt = f"""Based on the following project information, extract quantitative achievements suitable for a resume.

Project Info:
- Name: {project_data.get('name', 'N/A')}
- Description: {project_data.get('description', 'N/A')}
- Role: {project_data.get('role', 'N/A')}
- Team size: {project_data.get('team_size', 'N/A')}
- Contribution: {project_data.get('contribution_percent', 'N/A')}%
- Tech stack: {', '.join(project_data.get('technologies', []))}

Code stats:
- Total commits: {project_data.get('total_commits', 'N/A')}
- Lines added: {project_data.get('lines_added', 'N/A')}
- Lines deleted: {project_data.get('lines_deleted', 'N/A')}

Commit summary: {commit_summary or 'N/A'}
{existing_list}

Generate 3-5 quantitative achievements as a JSON array.
Each achievement must include specific numbers (%, x, count, etc.).
Generate new achievements that don't duplicate existing ones.

Format:
[
    {{
        "metric_name": "Achievement title (e.g., API Response Time Optimization, Deployment Automation)",
        "metric_value": "Key quantitative metric (e.g., 80% improvement, 3x faster)",
        "description": "Work performed (e.g., Applied Redis caching to reduce DB load)",
        "before_value": "Before state (e.g., Avg 2s response time, manual deployment)",
        "after_value": "After state (e.g., Avg 200ms response time, CI/CD automation)",
        "category": "Category (performance/efficiency/quality/scale/cost)"
    }}
]

Notes:
- Must include quantitative metrics
- before_value and after_value should be comparable
- Use realistic and credible numbers
- Generate achievements appropriate for the project scope
"""
                system_prompt = "You are an expert helping developers write resumes. Extract quantitative achievements from project information."
            else:
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
                system_prompt = "당신은 개발자 이력서 작성을 돕는 전문가입니다. 프로젝트 정보를 바탕으로 정량적 성과를 추출하세요."

            # Handle both LLMService (has provider) and CLILLMService (is the provider)
            if hasattr(llm_service, 'provider'):
                # API-based LLM service (OpenAI, Anthropic, Gemini)
                response = await llm_service.provider.generate(
                    prompt,
                    system_prompt=system_prompt,
                    max_tokens=1500,
                    temperature=0.3
                )
            else:
                # CLI-based LLM service (Claude Code CLI, Gemini CLI)
                full_prompt = f"{system_prompt}\n\n{prompt}"
                response, _ = await llm_service.generate_with_cli(full_prompt)

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
                a["evidence"] = "LLM-generated" if language == "en" else "LLM 기반 생성"

            return achievements

        except Exception as e:
            return []

    async def detect_all(
        self,
        project_data: Dict[str, Any],
        commit_messages: Optional[List[str]] = None,
        use_llm: bool = True,
        language: str = "ko"
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Detect all achievements from various sources.

        Args:
            language: Output language ("ko" for Korean, "en" for English)

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
            desc_achievements = self.detect_from_description(project_data["description"], language)
            for a in desc_achievements:
                a["source_type"] = "description"
            all_achievements.extend(desc_achievements)
            stats["pattern_detected"] += len(desc_achievements)

        # 2. Detect from commit messages
        if commit_messages:
            commit_achievements = self.detect_from_commits(commit_messages, language)
            for a in commit_achievements:
                a["source_type"] = "commit"
            all_achievements.extend(commit_achievements)
            stats["pattern_detected"] += len(commit_achievements)

        # 3. Generate from code statistics (with language support)
        code_stats_achievements = self.detect_from_code_stats(
            total_commits=project_data.get("total_commits", 0),
            lines_added=project_data.get("lines_added", 0),
            lines_deleted=project_data.get("lines_deleted", 0),
            files_changed=project_data.get("files_changed", 0),
            commit_categories=project_data.get("commit_categories", {}),
            language=language
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
                existing_achievements=all_achievements,
                language=language
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
        achievements: List[Dict[str, Any]],
        language: str = "ko"
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Categorize achievements by type for better organization.

        Args:
            language: Output language ("ko" or "en") for category names
        """
        categorized: Dict[str, List[Dict[str, Any]]] = {}
        other_label = translate_category("기타", language)

        for achievement in achievements:
            # Get text to match
            text_to_match = (
                f"{achievement.get('metric_name', '')} "
                f"{achievement.get('metric_value', '')} "
                f"{achievement.get('description', '')} "
                f"{achievement.get('category', '')}"
            ).lower()

            # Find best matching category (always match against Korean keywords)
            matched_category_ko = None
            max_matches = 0

            for category_ko, keywords in CATEGORY_KEYWORDS.items():
                matches = sum(1 for kw in keywords if kw.lower() in text_to_match)
                if matches > max_matches:
                    max_matches = matches
                    matched_category_ko = category_ko

            # Use existing category if present, otherwise use matched or "기타"
            if achievement.get("category"):
                existing_cat = achievement["category"].lower()
                final_category_ko = CATEGORY_MAP.get(existing_cat, matched_category_ko or "기타")
            else:
                final_category_ko = matched_category_ko or "기타"

            # Translate to target language
            final_category = translate_category(final_category_ko, language)

            if final_category not in categorized:
                categorized[final_category] = []

            categorized[final_category].append(achievement)

        # Sort categories in preferred order
        ordered_cats = get_ordered_categories(language)
        ordered_result: Dict[str, List[Dict[str, Any]]] = {}
        for cat in ordered_cats:
            if cat in categorized:
                ordered_result[cat] = categorized[cat]

        # Add any remaining categories
        for cat in categorized:
            if cat not in ordered_result:
                ordered_result[cat] = categorized[cat]

        return ordered_result

    async def auto_detect_and_save_achievements(
        self,
        db,  # AsyncSession
        project,  # Project model
        repo_analysis,  # RepoAnalysis model
        language: str = "ko"
    ) -> int:
        """
        Auto-detect achievements from analysis data and save to DB.
        Returns the number of saved achievements.

        This method extracts business logic from the router layer.

        Args:
            db: Database session (AsyncSession)
            project: Project model instance
            repo_analysis: RepoAnalysis model instance
            language: Output language ("ko" for Korean, "en" for English)

        Returns:
            Number of achievements saved
        """
        from api.models.achievement import ProjectAchievement

        # Build project data for achievement detection
        project_data = {
            "name": project.name,
            "description": project.description or "",
            "role": project.role or "",
            "total_commits": repo_analysis.total_commits or 0,
            "lines_added": repo_analysis.lines_added or 0,
            "lines_deleted": repo_analysis.lines_deleted or 0,
            "files_changed": repo_analysis.files_changed or 0,
            "commit_categories": repo_analysis.commit_categories or {},
        }

        # Get commit messages from summary
        commit_messages = []
        if repo_analysis.commit_messages_summary:
            commit_messages = repo_analysis.commit_messages_summary.split("\n")

        # Detect achievements using pattern matching (no LLM for speed)
        achievements, stats = await self.detect_all(
            project_data=project_data,
            commit_messages=commit_messages,
            use_llm=False,
            language=language
        )

        if not achievements:
            return 0

        # Delete existing achievements to avoid language mixing
        # (re-analysis should replace all achievements with current language)
        await db.execute(
            ProjectAchievement.__table__.delete().where(
                ProjectAchievement.project_id == project.id
            )
        )

        # Save new achievements
        saved_count = 0
        for achievement in achievements:
            new_achievement = ProjectAchievement(
                project_id=project.id,
                metric_name=achievement.get("metric_name", ""),
                metric_value=achievement.get("metric_value", ""),
                description=achievement.get("description"),
                category=achievement.get("category"),
                evidence=achievement.get("evidence"),
                display_order=achievement.get("display_order", saved_count),
            )
            db.add(new_achievement)
            saved_count += 1

        return saved_count
