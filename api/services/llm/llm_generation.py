"""
LLM Generation Functions - Large generation methods extracted from LLMService.
"""

from typing import Dict, List, Any, Optional
import json

from .llm_providers import BaseLLMProvider
from .llm_prompts import get_prompts


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

    technologies = project_data.get("technologies", [])

    if language == "en":
        tech_str = ", ".join(technologies) if technologies else "Not specified"
        prompt = f"""Based on the following project information, write the key tasks performed.

Project Information:
- Name: {project_data.get("name", "N/A")}
- Description: {project_data.get("description", "N/A")}
- Role: {project_data.get("role", "N/A")}
- Tech Stack: {tech_str}
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
        tech_str = ", ".join(technologies) if technologies else "미지정"
        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 수행 업무를 작성해주세요.

프로젝트 정보:
- 이름: {project_data.get("name", "N/A")}
- 설명: {project_data.get("description", "N/A")}
- 역할: {project_data.get("role", "N/A")}
- 기술 스택: {tech_str}
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
            prompt, system_prompt, max_tokens=1500, temperature=0.3
        )

        # Parse JSON response
        json_str = response
        if "```json" in response:
            json_str = response.split("```json")[1].split("```")[0]
        elif "```" in response:
            json_str = response.split("```")[1].split("```")[0]

        tasks = json.loads(json_str.strip())

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

    technologies = project_data.get("technologies", [])

    if language == "en":
        tech_str = ", ".join(technologies) if technologies else "Not specified"
        prompt = f"""Based on the following project information, organize the main implementation features by category.

Project Information:
- Name: {project_data.get("name", "N/A")}
- Description: {project_data.get("description", "N/A")}
- Role: {project_data.get("role", "N/A")}
- Tech Stack: {tech_str}

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
        tech_str = ", ".join(technologies) if technologies else "미지정"
        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 구현 기능을 카테고리별로 정리해주세요.

프로젝트 정보:
- 이름: {project_data.get("name", "N/A")}
- 설명: {project_data.get("description", "N/A")}
- 역할: {project_data.get("role", "N/A")}
- 기술 스택: {tech_str}

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
            prompt, system_prompt, max_tokens=2000, temperature=0.3
        )

        # Parse JSON response
        json_str = response
        if "```json" in response:
            json_str = response.split("```json")[1].split("```")[0]
        elif "```" in response:
            json_str = response.split("```")[1].split("```")[0]

        details = json.loads(json_str.strip())

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

    technologies = project_data.get("technologies", [])

    if language == "en":
        tech_str = ", ".join(technologies) if technologies else "Not specified"
        existing_str = ""
        if existing_achievements:
            existing_str = "\nPreviously detected achievements:\n" + "\n".join(
                f"- {a.get('metric_name', '')}: {a.get('metric_value', '')}"
                for a in existing_achievements
            )

        prompt = f"""Based on the following project information, organize the main achievements by category.

Project Information:
- Name: {project_data.get("name", "N/A")}
- Description: {project_data.get("description", "N/A")}
- Role: {project_data.get("role", "N/A")}
- Tech Stack: {tech_str}

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
        tech_str = ", ".join(technologies) if technologies else "미지정"
        existing_str = ""
        if existing_achievements:
            existing_str = "\n기존에 감지된 성과:\n" + "\n".join(
                f"- {a.get('metric_name', '')}: {a.get('metric_value', '')}"
                for a in existing_achievements
            )

        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 성과를 카테고리별로 정리해주세요.

프로젝트 정보:
- 이름: {project_data.get("name", "N/A")}
- 설명: {project_data.get("description", "N/A")}
- 역할: {project_data.get("role", "N/A")}
- 기술 스택: {tech_str}

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
            prompt, system_prompt, max_tokens=2500, temperature=0.3
        )

        # Parse JSON response
        json_str = response
        if "```json" in response:
            json_str = response.split("```json")[1].split("```")[0]
        elif "```" in response:
            json_str = response.split("```")[1].split("```")[0]

        achievements = json.loads(json_str.strip())

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
