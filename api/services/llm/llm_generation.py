"""
LLM Generation Functions - Large generation methods extracted from LLMService.
"""

from typing import Dict, List, Any, Optional
import json

from api.constants import SummaryStyle, LLM_MAX_TOKENS
from .llm_providers import BaseLLMProvider
from .llm_prompts import get_prompts
from .llm_utils import parse_json_from_llm


def _project_info_section(project_data: Dict[str, Any], language: str) -> str:
    """Build the common project info section for LLM prompts."""
    technologies = project_data.get("technologies", [])
    if language == "en":
        tech_str = ", ".join(technologies) if technologies else "Not specified"
        return (
            f"Project Information:\n"
            f"- Name: {project_data.get('name', 'N/A')}\n"
            f"- Description: {project_data.get('description', 'N/A')}\n"
            f"- Role: {project_data.get('role', 'N/A')}\n"
            f"- Tech Stack: {tech_str}"
        )
    else:
        tech_str = ", ".join(technologies) if technologies else "미지정"
        return (
            f"프로젝트 정보:\n"
            f"- 이름: {project_data.get('name', 'N/A')}\n"
            f"- 설명: {project_data.get('description', 'N/A')}\n"
            f"- 역할: {project_data.get('role', 'N/A')}\n"
            f"- 기술 스택: {tech_str}"
        )


async def generate_key_tasks_llm(
    provider: BaseLLMProvider,
    project_data: Dict[str, Any],
    commit_summary: Optional[str] = None,
    language: str = "ko",
    user_context: Optional[str] = None,
    code_context: Optional[str] = None,
) -> tuple[List[str], int]:
    """
    Generate key tasks in numbered format (1), (2), (3)...

    Format follows portfolio reference:
    (1) [Framework/Tech] + [Specific Task Description]
    Example: "(1) React + TypeScript 기반 멀티카메라 비디오 어노테이션 UI 개발"

    Args:
        provider: LLM provider instance
        project_data: Project information
        commit_summary: Optional commit summary
        language: Output language ("ko" or "en")
        user_context: Optional user-edited content to reference
        code_context: Optional actual code changes for detailed analysis

    Returns:
        Tuple of (list of tasks, tokens used)
    """
    prompts = get_prompts(language)
    system_prompt = prompts["system_key_tasks"]

    info = _project_info_section(project_data, language)

    if language == "en":
        prompt = f"""Based on the following project information, write the key tasks performed.

{info}
- Period: {project_data.get("start_date", "N/A")} ~ {project_data.get("end_date", "N/A")}

Code Analysis (if available):
- Total Commits: {project_data.get("total_commits", "N/A")}
- Lines Added: {project_data.get("lines_added", "N/A")}
- Commit Summary: {commit_summary or "N/A"}

{prompts["key_tasks_rules"]}

{prompts["key_tasks_examples"]}

Response Format:
Respond only with a JSON array. No other explanations.
["Task 1", "Task 2", "Task 3", ...]"""
    else:
        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 수행 업무를 작성해주세요.

{info}
- 기간: {project_data.get("start_date", "N/A")} ~ {project_data.get("end_date", "N/A")}

코드 분석 (있는 경우):
- 총 커밋: {project_data.get("total_commits", "N/A")}
- 추가된 라인: {project_data.get("lines_added", "N/A")}
- 커밋 요약: {commit_summary or "N/A"}

{prompts["key_tasks_rules"]}

{prompts["key_tasks_examples"]}
- JWT 토큰 기반 인증 시스템 및 리프레시 토큰 관리
- SSE 스트리밍 기반 실시간 진행 상황 전송 구현

응답 형식:
반드시 JSON 배열 형식으로만 응답하세요. 다른 설명 없이 배열만 반환하세요.
["업무1", "업무2", "업무3", ...]"""

    # Add actual code changes for detailed analysis
    if code_context:
        if language == "en":
            prompt += f"""

Actual Code Changes (analyze to understand specific implementations):
{code_context}

Based on the code above, identify specific technical implementations and features developed."""
        else:
            prompt += f"""

실제 코드 변경 내용 (구체적인 구현 내용을 파악하기 위한 코드):
{code_context}

위 코드를 분석하여 구체적인 기술 구현 및 개발된 기능을 파악하세요."""

    # Add user context if provided (for re-analysis)
    if user_context:
        prompt += prompts["user_edit_context"] + user_context

    try:
        response, tokens = await provider.generate(
            prompt, system_prompt, max_tokens=LLM_MAX_TOKENS.KEY_TASKS, temperature=0.3
        )

        tasks = parse_json_from_llm(response)

        # Validate and clean
        if isinstance(tasks, list):
            return [str(t).strip() for t in tasks if t and str(t).strip()], tokens
        return [], tokens

    except Exception:
        return [], 0


async def generate_implementation_details_llm(
    provider: BaseLLMProvider,
    project_data: Dict[str, Any],
    commit_summary: Optional[str] = None,
    language: str = "ko",
    user_context: Optional[str] = None,
) -> tuple[List[Dict[str, Any]], int]:
    """
    Generate detailed implementation features grouped by category.

    Format follows DETAILED_COMPLETION_REPORT style:
    [
        {
            "title": "멀티뷰 워크스페이스",
            "items": [
                "1-10개 카메라 동시 시각화",
                "동기화된 재생 시스템",
                ...
            ]
        },
        ...
    ]

    Args:
        provider: LLM provider instance
        project_data: Project information
        commit_summary: Optional commit summary
        language: Output language ("ko" or "en")
        user_context: Optional user-edited content to reference

    Returns:
        Tuple of (list of implementation details, tokens used)
    """
    prompts = get_prompts(language)
    system_prompt = prompts["system_implementation"]

    info = _project_info_section(project_data, language)

    if language == "en":
        prompt = f"""Based on the following project information, organize the main implementation features by category.

{info}

Code Analysis:
- Total Commits: {project_data.get("total_commits", "N/A")}
- Commit Summary: {commit_summary or "N/A"}

**Writing Rules:**
1. Create 3-6 main feature categories
2. Include 3-5 detailed implementation items per category
3. Use technically specific descriptions
4. Choose category names that match project characteristics

**Example Format:**
[
  {{
    "title": "Multiview Workspace",
    "items": [
      "Support for 1-10 camera simultaneous visualization",
      "Synchronized playback system across views",
      "Individual view zoom/panning controls"
    ]
  }},
  {{
    "title": "Annotation System",
    "items": [
      "Fabric.js Canvas-based graphic rendering",
      "Bounding Box, Polygon, Keypoint support",
      "Independent annotation management per view"
    ]
  }}
]

Response Format:
Respond only with a JSON array."""
    else:
        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 구현 기능을 카테고리별로 정리해주세요.

{info}

코드 분석:
- 총 커밋: {project_data.get("total_commits", "N/A")}
- 커밋 요약: {commit_summary or "N/A"}

**작성 규칙:**
1. 3~6개의 주요 기능 카테고리를 생성
2. 각 카테고리에는 3~5개의 세부 구현 항목 포함
3. 기술적으로 구체적인 설명 사용
4. 프로젝트 특성에 맞는 카테고리 이름 선정

**예시 형식:**
[
  {{
    "title": "멀티뷰 워크스페이스",
    "items": [
      "1-10개 카메라 동시 시각화 지원",
      "뷰 간 동기화된 재생 시스템",
      "개별 뷰 줌/패닝 컨트롤"
    ]
  }},
  {{
    "title": "어노테이션 시스템",
    "items": [
      "Fabric.js Canvas 기반 그래픽 렌더링",
      "Bounding Box, Polygon, Keypoint 지원",
      "뷰별 독립적 어노테이션 관리"
    ]
  }}
]

응답 형식:
반드시 JSON 배열 형식으로만 응답하세요."""

    # Add user context if provided (for re-analysis)
    if user_context:
        prompt += prompts["user_edit_context"] + str(user_context)

    try:
        response, tokens = await provider.generate(
            prompt, system_prompt, max_tokens=LLM_MAX_TOKENS.IMPLEMENTATION, temperature=0.3
        )

        details = parse_json_from_llm(response)

        # Validate structure
        if isinstance(details, list):
            validated = []
            for item in details:
                if isinstance(item, dict) and "title" in item and "items" in item:
                    validated.append(
                        {
                            "title": str(item["title"]),
                            "items": [str(i) for i in item.get("items", []) if i],
                        }
                    )
            return validated, tokens
        return [], tokens

    except Exception:
        return [], 0


async def generate_detailed_achievements_llm(
    provider: BaseLLMProvider,
    project_data: Dict[str, Any],
    existing_achievements: Optional[List[Dict[str, Any]]] = None,
    language: str = "ko",
    user_context: Optional[str] = None,
) -> tuple[Dict[str, List[Dict[str, Any]]], int]:
    """
    Generate achievements grouped by category with before/after format.

    Format follows PROJECT_PERFORMANCE_SUMMARY style:
    {
        "성능 향상": [
            {
                "title": "Export 최적화",
                "description": "Keyframe 전용 export 구현",
                "before": "전체 프레임 저장",
                "after": "파일 크기 80% 감소, 속도 3-5배 향상"
            }
        ],
        "기능 확장": [...],
        ...
    }

    Args:
        provider: LLM provider instance
        project_data: Project information
        existing_achievements: Optional list of already detected achievements
        language: Output language ("ko" or "en")
        user_context: Optional user-edited content to reference

    Returns:
        Tuple of (dict of achievements by category, tokens used)
    """
    prompts = get_prompts(language)
    system_prompt = prompts["system_achievements"]

    info = _project_info_section(project_data, language)

    if language == "en":
        existing_str = ""
        if existing_achievements:
            existing_str = "\nPreviously detected achievements:\n" + "\n".join(
                f"- {a.get('metric_name', '')}: {a.get('metric_value', '')}"
                for a in existing_achievements
            )

        prompt = f"""Based on the following project information, organize the main achievements by category.

{info}

Code Statistics:
- Total Commits: {project_data.get("total_commits", "N/A")}
- Lines Added: {project_data.get("lines_added", "N/A")}
- Lines Deleted: {project_data.get("lines_deleted", "N/A")}
{existing_str}

**Achievement Categories:**
- Performance: Processing speed, response time, memory usage improvements
- Feature: New feature additions, scalability improvements
- User Experience (UX): UI/UX improvements, accessibility enhancements
- Code Quality: Refactoring, test coverage, modularization
- Productivity: Automation, reduced work time
- Stability: Error reduction, improved availability

**Writing Rules:**
1. Include only categories relevant to the project
2. Each achievement must include quantitative metrics (%, times, count, seconds, etc.)
3. Compare before/after improvements
4. Use realistic and believable numbers

**Example:**
{{
  "Performance": [
    {{
      "title": "Export Optimization",
      "description": "Implemented keyframe-only export for improved data accuracy",
      "before": "Full frame storage, large file generation",
      "after": "80% file size reduction, 3-5x speed improvement"
    }}
  ],
  "Feature": [
    {{
      "title": "Multiview Simultaneous Labeling",
      "description": "Expanded from single video to up to 10 cameras",
      "before": "Single camera support",
      "after": "1-10 cameras simultaneous support, applicable to various fields"
    }}
  ]
}}

Response Format:
Respond only with a JSON object."""
    else:
        existing_str = ""
        if existing_achievements:
            existing_str = "\n기존에 감지된 성과:\n" + "\n".join(
                f"- {a.get('metric_name', '')}: {a.get('metric_value', '')}"
                for a in existing_achievements
            )

        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 성과를 카테고리별로 정리해주세요.

{info}

코드 통계:
- 총 커밋: {project_data.get("total_commits", "N/A")}
- 추가된 라인: {project_data.get("lines_added", "N/A")}
- 삭제된 라인: {project_data.get("lines_deleted", "N/A")}
{existing_str}

**성과 카테고리:**
- 성능 향상 (Performance): 처리 속도, 응답 시간, 메모리 사용량 개선
- 기능 확장 (Feature): 새로운 기능 추가, 확장성 개선
- 사용자 경험 (UX): UI/UX 개선, 접근성 향상
- 코드 품질 (Quality): 리팩토링, 테스트 커버리지, 모듈화
- 생산성 향상 (Productivity): 자동화, 작업 시간 단축
- 안정성 (Stability): 오류 감소, 가용성 향상

**작성 규칙:**
1. 프로젝트와 관련 있는 카테고리만 포함
2. 각 성과는 반드시 정량적 수치 포함 (%, 배, 건, 초 등)
3. Before/After 형식으로 개선 전후 비교
4. 현실적이고 믿을 수 있는 수치 사용

**예시:**
{{
  "성능 향상": [
    {{
      "title": "Export 최적화",
      "description": "Keyframe 전용 export 구현으로 데이터 정확도 향상",
      "before": "전체 프레임 저장, 대용량 파일 생성",
      "after": "파일 크기 80% 감소, 속도 3-5배 향상"
    }}
  ],
  "기능 확장": [
    {{
      "title": "멀티뷰 동시 라벨링",
      "description": "기존 단일 비디오에서 최대 10개 카메라로 확장",
      "before": "단일 카메라 지원",
      "after": "1-10개 카메라 동시 지원, 다양한 분야 적용 가능"
    }}
  ]
}}

응답 형식:
반드시 JSON 객체 형식으로만 응답하세요."""

    # Add user context if provided (for re-analysis)
    if user_context:
        prompt += prompts["user_edit_context"] + str(user_context)

    try:
        response, tokens = await provider.generate(
            prompt, system_prompt, max_tokens=LLM_MAX_TOKENS.ACHIEVEMENTS, temperature=0.3
        )

        achievements = parse_json_from_llm(response)

        # Validate structure
        if isinstance(achievements, dict):
            validated = {}
            for category, items in achievements.items():
                if isinstance(items, list):
                    validated_items = []
                    for item in items:
                        if isinstance(item, dict) and "title" in item:
                            validated_items.append(
                                {
                                    "title": str(item.get("title", "")),
                                    "description": str(item.get("description", "")),
                                    "before": str(item.get("before", "")),
                                    "after": str(item.get("after", "")),
                                }
                            )
                    if validated_items:
                        validated[category] = validated_items
            return validated, tokens
        return {}, tokens

    except Exception:
        return {}, 0


async def generate_multi_repo_summary_llm(
    provider: BaseLLMProvider,
    project_data: Dict[str, Any],
    repo_summaries: List[Dict[str, Any]],
    style: str = "professional",
    language: str = "ko",
) -> Dict[str, Any]:
    """Generate a holistic AI summary for a multi-repo project.

    Shared implementation used by both LLMService and CLILLMService.

    Args:
        provider: LLM provider instance
        project_data: Project-level info (name, role, team_size, etc.)
        repo_summaries: List of per-repo dicts, each with:
            label, git_url, ai_summary, key_tasks, technologies
        style: Summary style.
        language: Output language.

    Returns same JSON structure as generate_project_summary().
    """
    prompts = get_prompts(language)
    style_map = {
        SummaryStyle.PROFESSIONAL: prompts["style_professional"],
        SummaryStyle.CASUAL: prompts["style_casual"],
        SummaryStyle.TECHNICAL: prompts["style_technical"],
    }
    system_prompt = f"""{prompts["system_resume"]}
{style_map.get(style, style_map[SummaryStyle.PROFESSIONAL])}
{prompts["json_format"]}"""

    # Build per-repo section
    repo_sections = []
    for repo in repo_summaries:
        label = repo.get("label", "Repository")
        techs = ", ".join(repo.get("technologies", [])[:15])
        tasks = "\n".join(f"  - {t}" for t in (repo.get("key_tasks") or [])[:5])
        summary = repo.get("ai_summary") or "(No summary)"
        repo_sections.append(
            f"### {label}\n"
            f"- Technologies: {techs or 'N/A'}\n"
            f"- Key Tasks:\n{tasks or '  (None)'}\n"
            f"- AI Summary: {summary}"
        )
    repos_text = "\n\n".join(repo_sections)

    if language == "en":
        prompt = f"""This project consists of MULTIPLE repositories. Based on the project info and each repository's analysis below, write a HOLISTIC project summary suitable for a resume.

Project Information:
- Name: {project_data.get("name", "N/A")}
- Description: {project_data.get("description", "N/A")}
- Role: {project_data.get("role", "N/A")}
- Team Size: {project_data.get("team_size", "N/A")} members
- Contribution: {project_data.get("contribution_percent", "N/A")}%
- Period: {project_data.get("start_date", "N/A")} ~ {project_data.get("end_date", "N/A")}

Per-Repository Analysis:
{repos_text}

Instructions:
1. Write a comprehensive HOLISTIC summary (5-8 sentences) that:
   - Explains the overall project scope spanning all repositories
   - Highlights correlations and interactions between the repositories
   - Describes your specific contributions across the full stack
   - Mentions technical challenges and how they were resolved
   - Provides measurable impact or outcomes

2. List 5-7 key features you implemented across ALL repositories combined

3. Highlight 4-5 technical achievements or architectural decisions spanning the whole project

4. Describe your overall responsibilities covering all repositories

Do NOT simply concatenate per-repo summaries. Synthesize a unified narrative.

Respond in JSON:
{{
    "summary": "5-8 sentence holistic project summary",
    "key_features": ["Cross-repo feature 1", "Feature 2", ...],
    "technical_highlights": ["Architecture decision 1", "Performance improvement 2", ...],
    "role_description": "Unified role description across all repos"
}}"""
    else:
        prompt = f"""이 프로젝트는 여러 레포지토리로 구성되어 있습니다. 아래의 프로젝트 정보와 각 레포지토리 분석 결과를 바탕으로 이력서에 적합한 **통합적인** 프로젝트 요약을 작성해주세요.

프로젝트 정보:
- 이름: {project_data.get("name", "N/A")}
- 설명: {project_data.get("description", "N/A")}
- 역할: {project_data.get("role", "N/A")}
- 팀 규모: {project_data.get("team_size", "N/A")}명
- 기여도: {project_data.get("contribution_percent", "N/A")}%
- 기간: {project_data.get("start_date", "N/A")} ~ {project_data.get("end_date", "N/A")}

레포지토리별 분석 결과:
{repos_text}

작성 지침:
1. 포괄적이고 **통합적인** 요약(5-8문장)을 작성하세요:
   - 모든 레포지토리를 아우르는 프로젝트 전체 범위 설명
   - 레포지토리 간의 상관관계와 상호작용 강조
   - 풀스택에 걸친 본인의 구체적인 기여 설명
   - 기술적 도전과 해결 방법
   - 측정 가능한 성과나 영향

2. 모든 레포지토리에 걸쳐 구현한 주요 기능 5-7개 나열

3. 프로젝트 전체에 걸친 기술적 성과나 아키텍처 결정 4-5개 강조

4. 모든 레포지토리를 아우르는 전체적인 역할 설명

각 레포별 요약을 단순히 이어붙이지 말고, **하나의 통합된 서사**로 작성하세요.

다음 JSON 형식으로 응답하세요:
{{
    "summary": "5-8문장의 통합적 프로젝트 요약",
    "key_features": ["레포 전체에 걸친 기능 1", "기능 2", ...],
    "technical_highlights": ["아키텍처 결정 1", "성능 개선 2", ...],
    "role_description": "모든 레포를 아우르는 통합 역할 설명"
}}"""

    try:
        response, tokens = await provider.generate(prompt, system_prompt)

        result = parse_json_from_llm(response or "")
        result["token_usage"] = tokens
        return result
    except json.JSONDecodeError:
        return {
            "summary": response or "",
            "key_features": [],
            "technical_highlights": [],
            "role_description": "",
            "token_usage": tokens,
        }
    except Exception:
        return {
            "summary": "",
            "key_features": [],
            "technical_highlights": [],
            "role_description": "",
            "token_usage": 0,
        }
