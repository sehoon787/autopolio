"""
Content Generator Service - LLM-based content generation for project analysis.

Extracted from github_service.py for better modularity.
Handles:
- Implementation details generation
- Development timeline generation
- Achievement generation
"""

import asyncio
import json
import logging
from typing import Dict, List, Any, Optional, Tuple

from api.services.github.github_constants import call_llm_generate

logger = logging.getLogger(__name__)


async def generate_implementation_details(
    project_data: Dict[str, Any],
    analysis_data: Dict[str, Any],
    llm,
    language: str = "ko",
    code_context: Optional[str] = None,
) -> Tuple[List[Dict], int]:
    """Generate implementation details using LLM.

    Args:
        project_data: Project information (name, description, role)
        analysis_data: Analysis data (commits, tech stack, etc.)
        llm: LLM service instance
        language: Output language ("ko" or "en")
        code_context: Optional code snippets for context

    Returns:
        Tuple of (implementation details list, tokens used)
    """
    # Build code context section
    code_section = ""
    if code_context:
        if language == "en":
            code_section = f"""

Actual Code Changes (analyze to understand specific implementations):
{code_context}

"""
        else:
            code_section = f"""

실제 코드 변경 내용 (구체적인 구현 내용 파악용):
{code_context}

"""

    if language == "en":
        implementation_prompt = f"""Analyze the following project information and identify the main implementation features.

Project: {project_data.get("name", "N/A")}
Description: {project_data.get("description", "N/A")}
Role: {project_data.get("role", "N/A")}

Commit message summary:
{analysis_data.get("commit_messages_summary", "N/A")[:1500]}

Tech stack: {", ".join(analysis_data.get("detected_technologies", [])[:15])}
Commit categories: {analysis_data.get("commit_categories", {})}
{code_section}
IMPORTANT: ALL output (titles, items) MUST be in English. If the input data is in Korean or another language, translate it to English.

Write 3-5 main implementation features in JSON format. Each feature should be specific and related to actual development work:
[
  {{
    "title": "Feature title (in English)",
    "items": [
      "Specific implementation detail 1: including technical specifics",
      "Specific implementation detail 2: specify technologies used"
    ]
  }}
]

Return only JSON."""
        system_prompt = "You are a technical expert analyzing software projects. Structure the actual implemented features based on commit messages, tech stack, and code changes. ALWAYS respond in English regardless of input language."
    else:
        implementation_prompt = f"""다음 프로젝트 정보를 바탕으로 주요 구현 기능을 분석해주세요.

프로젝트: {project_data.get("name", "N/A")}
설명: {project_data.get("description", "N/A")}
역할: {project_data.get("role", "N/A")}

커밋 메시지 요약:
{analysis_data.get("commit_messages_summary", "N/A")[:1500]}

기술 스택: {", ".join(analysis_data.get("detected_technologies", [])[:15])}
커밋 카테고리: {analysis_data.get("commit_categories", {})}
{code_section}
JSON 형식으로 3-5개의 주요 구현 기능을 작성해주세요. 각 기능은 실제 개발 업무와 관련된 구체적인 내용이어야 합니다:
[
  {{
    "title": "기능 제목 (영문 부제 포함, 예: 멀티뷰 워크스페이스 (Multiview Workspace))",
    "items": [
      "구체적인 구현 내용 1: 기술적 세부사항 포함",
      "구체적인 구현 내용 2: 어떤 기술을 사용했는지 명시"
    ]
  }}
]

JSON만 반환하세요."""
        system_prompt = "당신은 소프트웨어 프로젝트를 분석하는 기술 전문가입니다. 커밋 메시지, 기술 스택, 그리고 코드 변경 내용을 바탕으로 실제 구현된 기능을 구조화합니다."

    try:
        impl_response, impl_tokens = await call_llm_generate(
            llm,
            implementation_prompt,
            system_prompt=system_prompt,
            max_tokens=4000,
            temperature=0.3,
        )

        logger.info(
            "[implementation_details] Response len=%d, tokens=%d",
            len(impl_response) if impl_response else 0,
            impl_tokens,
        )

        json_str = impl_response
        if "```json" in impl_response:
            json_str = impl_response.split("```json")[1].split("```")[0]
        elif "```" in impl_response:
            json_str = impl_response.split("```")[1].split("```")[0]

        return json.loads(json_str.strip()), impl_tokens
    except json.JSONDecodeError as e:
        logger.error(
            "[implementation_details] JSON parse failed: %s (preview=%.200s)",
            e,
            (impl_response or "")[:200],
        )
        return [], 0
    except Exception as e:
        logger.error("[implementation_details] Failed: %s: %s", type(e).__name__, e)
        return [], 0


async def generate_development_timeline(
    project_data: Dict[str, Any],
    analysis_data: Dict[str, Any],
    llm,
    language: str = "ko",
    code_context: Optional[str] = None,
) -> Tuple[List[Dict], int]:
    """Generate development timeline using LLM.

    Args:
        project_data: Project information (name, start_date, end_date)
        analysis_data: Analysis data (commits, categories, etc.)
        llm: LLM service instance
        language: Output language ("ko" or "en")
        code_context: Optional code snippets for context (unused but kept for interface consistency)

    Returns:
        Tuple of (timeline phases list, tokens used)
    """
    start_date = project_data.get("start_date", "")
    end_date = project_data.get("end_date", "")

    if language == "en":
        timeline_prompt = f"""Create a development timeline based on the following project information.

Project: {project_data.get("name", "N/A")}
Period: {start_date} ~ {end_date or "In Progress"}
Commit message summary:
{analysis_data.get("commit_messages_summary", "N/A")[:1500]}

Commit categories: {analysis_data.get("commit_categories", {})}
Total commits: {analysis_data.get("total_commits", 0)}

IMPORTANT: ALL output (titles, activities) MUST be in English. If the input data is in Korean or another language, translate it to English.

Write a chronological development timeline in 2-4 phases in JSON format:
[
  {{
    "period": "YYYY-MM ~ MM (e.g., 2024-01 ~ 02)",
    "title": "Phase title in English (e.g., Basic Infrastructure Setup)",
    "activities": ["Activity 1 in English", "Activity 2 in English", "Activity 3 in English"]
  }}
]

Return only JSON."""
        system_prompt = "You are an expert in analyzing software development project timelines. ALWAYS respond in English regardless of input language."
    else:
        timeline_prompt = f"""다음 프로젝트 정보를 바탕으로 개발 타임라인을 작성해주세요.

프로젝트: {project_data.get("name", "N/A")}
기간: {start_date} ~ {end_date or "진행중"}
커밋 메시지 요약:
{analysis_data.get("commit_messages_summary", "N/A")[:1500]}

커밋 카테고리: {analysis_data.get("commit_categories", {})}
총 커밋: {analysis_data.get("total_commits", 0)}

JSON 형식으로 시간순 개발 타임라인을 2-4개 단계로 작성해주세요:
[
  {{
    "period": "YYYY-MM ~ MM (예: 2024-01 ~ 02)",
    "title": "단계 제목 (예: 기본 인프라 구축)",
    "activities": ["활동 1", "활동 2", "활동 3"]
  }}
]

JSON만 반환하세요."""
        system_prompt = (
            "당신은 소프트웨어 개발 프로젝트의 타임라인을 분석하는 전문가입니다."
        )

    try:
        timeline_response, timeline_tokens = await call_llm_generate(
            llm,
            timeline_prompt,
            system_prompt=system_prompt,
            max_tokens=3000,
            temperature=0.3,
        )

        logger.info(
            "[development_timeline] Response len=%d, tokens=%d",
            len(timeline_response) if timeline_response else 0,
            timeline_tokens,
        )

        json_str = timeline_response
        if "```json" in timeline_response:
            json_str = timeline_response.split("```json")[1].split("```")[0]
        elif "```" in timeline_response:
            json_str = timeline_response.split("```")[1].split("```")[0]

        return json.loads(json_str.strip()), timeline_tokens
    except json.JSONDecodeError as e:
        logger.error(
            "[development_timeline] JSON parse failed: %s (preview=%.200s)",
            e,
            (timeline_response or "")[:200],
        )
        return [], 0
    except Exception as e:
        logger.error("[development_timeline] Failed: %s: %s", type(e).__name__, e)
        return [], 0


async def generate_detailed_achievements(
    project_data: Dict[str, Any],
    analysis_data: Dict[str, Any],
    llm,
    language: str = "ko",
    code_context: Optional[str] = None,
) -> Tuple[Dict, int]:
    """Generate detailed achievements using LLM.

    Args:
        project_data: Project information (name, description)
        analysis_data: Analysis data (commits, code statistics, etc.)
        llm: LLM service instance
        language: Output language ("ko" or "en")
        code_context: Optional code snippets for context (unused but kept for interface consistency)

    Returns:
        Tuple of (achievements dict by category, tokens used)
    """
    if language == "en":
        achievements_prompt = f"""Analyze the following project information and organize achievements by category.

Project: {project_data.get("name", "N/A")}
Description: {project_data.get("description", "N/A")}
Commit message summary:
{analysis_data.get("commit_messages_summary", "N/A")[:1500]}

Code statistics:
- Lines added: {analysis_data.get("lines_added", 0)}
- Lines deleted: {analysis_data.get("lines_deleted", 0)}
- Files changed: {analysis_data.get("files_changed", 0)}

Commit categories: {analysis_data.get("commit_categories", {})}

IMPORTANT: ALL output (titles, descriptions, category names) MUST be in English. If the input data is in Korean or another language, translate it to English.

Write achievements by category in JSON format. Each achievement should include specific metrics or comparisons:
{{
  "New Features": [
    {{"title": "Feature title in English", "description": "Improvement or new value compared to before"}}
  ],
  "Performance Improvement": [
    {{"title": "Improvement item in English", "description": "Numerical improvement (e.g., 80% improvement, 3x faster)"}}
  ],
  "Code Quality": [
    {{"title": "Quality improvement in English", "description": "Refactoring, test additions, etc."}}
  ]
}}

Return only JSON. Use empty arrays for categories that don't apply."""
        system_prompt = "You are an expert in analyzing software project achievements. Extract quantitative achievements based on commit history and code statistics. ALWAYS respond in English regardless of input language."
    else:
        achievements_prompt = f"""다음 프로젝트 정보를 바탕으로 주요 성과를 카테고리별로 분석해주세요.

프로젝트: {project_data.get("name", "N/A")}
설명: {project_data.get("description", "N/A")}
커밋 메시지 요약:
{analysis_data.get("commit_messages_summary", "N/A")[:1500]}

코드 통계:
- 추가된 라인: {analysis_data.get("lines_added", 0)}
- 삭제된 라인: {analysis_data.get("lines_deleted", 0)}
- 변경된 파일: {analysis_data.get("files_changed", 0)}

커밋 카테고리: {analysis_data.get("commit_categories", {})}

JSON 형식으로 성과를 카테고리별로 작성해주세요. 각 성과는 구체적인 수치나 비교를 포함해야 합니다:
{{
  "새로운 기능 추가": [
    {{"title": "기능 제목", "description": "기존 대비 개선점 또는 새로운 가치"}}
  ],
  "성능 개선": [
    {{"title": "개선 항목", "description": "수치적 개선 (예: 80% 향상, 3배 빨라짐)"}}
  ],
  "코드 품질": [
    {{"title": "품질 개선", "description": "리팩토링, 테스트 추가 등"}}
  ]
}}

JSON만 반환하세요. 해당 카테고리가 없으면 빈 배열로 두세요."""
        system_prompt = "당신은 소프트웨어 프로젝트의 성과를 분석하는 전문가입니다. 커밋 히스토리와 코드 통계를 바탕으로 정량적인 성과를 추출합니다."

    try:
        achievements_response, achievements_tokens = await call_llm_generate(
            llm,
            achievements_prompt,
            system_prompt=system_prompt,
            max_tokens=3000,
            temperature=0.3,
        )

        logger.info(
            "[detailed_achievements] Response len=%d, tokens=%d",
            len(achievements_response) if achievements_response else 0,
            achievements_tokens,
        )

        json_str = achievements_response
        if "```json" in achievements_response:
            json_str = achievements_response.split("```json")[1].split("```")[0]
        elif "```" in achievements_response:
            json_str = achievements_response.split("```")[1].split("```")[0]

        return json.loads(json_str.strip()), achievements_tokens
    except json.JSONDecodeError as e:
        logger.error(
            "[detailed_achievements] JSON parse failed: %s (preview=%.200s)",
            e,
            (achievements_response or "")[:200],
        )
        return {}, 0
    except Exception as e:
        logger.error("[detailed_achievements] Failed: %s: %s", type(e).__name__, e)
        return {}, 0


async def generate_detailed_content(
    project_data: Dict[str, Any],
    analysis_data: Dict[str, Any],
    llm_service=None,
    language: str = "ko",
    code_contributions: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], int]:
    """Generate detailed content using LLM.

    Performance: Uses parallel LLM calls (3 calls in ~10-15 seconds instead of 30-40 seconds).

    Args:
        project_data: Project information
        analysis_data: Analysis data (commits, tech stack, etc.)
        llm_service: Optional LLM service instance
        language: Output language ("ko" or "en")
        code_contributions: Optional user's code contributions with patches

    Returns:
        Tuple of (result dict with implementation_details, development_timeline,
                 detailed_achievements, total tokens used)
    """
    from api.services.llm import LLMService
    from api.config import get_settings

    settings = get_settings()
    total_tokens = 0

    # Check if LLM is configured
    if not settings.llm_provider and llm_service is None:
        logger.warning("No LLM provider configured")
        return {}, 0

    try:
        if llm_service is None:
            llm_service = LLMService(settings.llm_provider)
        llm = llm_service
        logger.info("Using LLM service: %s, language: %s", type(llm).__name__, language)
        if hasattr(llm, "provider_name"):
            logger.debug("Provider name: %s", llm.provider_name)
    except ValueError as e:
        # LLM not configured
        logger.error("LLM init failed: %s", e)
        return {}, 0

    result = {}

    # Build code context from contributions for more detailed analysis
    code_context = None
    if code_contributions and code_contributions.get("contributions"):
        code_snippets = []
        for contrib in code_contributions["contributions"][:10]:
            commit_info = f"Commit: {contrib['message']}"
            for file_info in contrib.get("files", [])[:3]:
                if file_info.get("patch"):
                    code_snippets.append(
                        f"{commit_info}\nFile: {file_info['filename']}\n{file_info['patch'][:500]}"
                    )
        if code_snippets:
            code_context = "\n\n---\n\n".join(code_snippets[:5])
            logger.info(
                "[DetailedContent] Including %d code snippets in context",
                len(code_snippets[:5]),
            )

    # CLI mode requires sequential execution to avoid concurrent subprocess conflicts
    # (credential file locks, rate limits, session management)
    from api.services.llm.cli_llm_service import CLILLMService

    is_cli_mode = isinstance(llm, CLILLMService)

    if is_cli_mode:
        logger.info(
            "[DetailedContent] CLI mode detected — running LLM calls sequentially"
        )

        # Implementation details
        try:
            impl_details, impl_tokens = await generate_implementation_details(
                project_data, analysis_data, llm, language, code_context
            )
            result["implementation_details"] = impl_details
            total_tokens += impl_tokens
            logger.info(
                "[DetailedContent] implementation_details: %d items, %d tokens",
                len(impl_details) if isinstance(impl_details, list) else 0,
                impl_tokens,
            )
        except Exception as e:
            logger.error(
                "[DetailedContent] implementation_details failed: %s: %s",
                type(e).__name__,
                e,
            )
            result["implementation_details"] = []

        # Development timeline
        try:
            timeline, timeline_tokens = await generate_development_timeline(
                project_data, analysis_data, llm, language, code_context
            )
            result["development_timeline"] = timeline
            total_tokens += timeline_tokens
            logger.info(
                "[DetailedContent] development_timeline: %d items, %d tokens",
                len(timeline) if isinstance(timeline, list) else 0,
                timeline_tokens,
            )
        except Exception as e:
            logger.error(
                "[DetailedContent] development_timeline failed: %s: %s",
                type(e).__name__,
                e,
            )
            result["development_timeline"] = []

        # Detailed achievements
        try:
            achievements, achievements_tokens = await generate_detailed_achievements(
                project_data, analysis_data, llm, language, code_context
            )
            result["detailed_achievements"] = achievements
            total_tokens += achievements_tokens
            logger.info(
                "[DetailedContent] detailed_achievements: %d categories, %d tokens",
                len(achievements) if isinstance(achievements, dict) else 0,
                achievements_tokens,
            )
        except Exception as e:
            logger.error(
                "[DetailedContent] detailed_achievements failed: %s: %s",
                type(e).__name__,
                e,
            )
            result["detailed_achievements"] = {}
    else:
        # API mode: Execute all LLM calls in parallel for better performance
        tasks = [
            generate_implementation_details(
                project_data, analysis_data, llm, language, code_context
            ),
            generate_development_timeline(
                project_data, analysis_data, llm, language, code_context
            ),
            generate_detailed_achievements(
                project_data, analysis_data, llm, language, code_context
            ),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        # Implementation details
        if not isinstance(results[0], Exception):
            impl_details, impl_tokens = results[0]
            result["implementation_details"] = impl_details
            total_tokens += impl_tokens
        else:
            logger.error("implementation_details failed: %s", results[0])
            result["implementation_details"] = []

        # Development timeline
        if not isinstance(results[1], Exception):
            timeline, timeline_tokens = results[1]
            result["development_timeline"] = timeline
            total_tokens += timeline_tokens
        else:
            logger.error("development_timeline failed: %s", results[1])
            result["development_timeline"] = []

        # Detailed achievements
        if not isinstance(results[2], Exception):
            achievements, achievements_tokens = results[2]
            result["detailed_achievements"] = achievements
            total_tokens += achievements_tokens
        else:
            logger.error("detailed_achievements failed: %s", results[2])
            result["detailed_achievements"] = {}

    return result, total_tokens
