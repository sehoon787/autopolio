"""
LLM Service - Supports both OpenAI and Anthropic for text generation.
Facade that delegates to providers and generation functions.
"""
from typing import Dict, List, Any, Optional

import json

from api.config import get_settings
from .llm_prompts import get_prompts
from .llm_providers import (
    BaseLLMProvider,
    OpenAIProvider,
    AnthropicProvider,
    GeminiProvider,
)
from .llm_generation import (
    generate_key_tasks_llm,
    generate_implementation_details_llm,
    generate_detailed_achievements_llm,
)

settings = get_settings()

# Re-export for backward compatibility
__all__ = [
    "BaseLLMProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    "GeminiProvider",
    "LLMService",
]


class LLMService:
    """Service for LLM-based text generation."""

    def __init__(self, provider: str = None, model: str | None = None, api_key: str | None = None):
        self.provider_name = provider or settings.llm_provider
        self.model_override = model
        self.api_key_override = api_key
        self.provider = self._create_provider()
        self.total_tokens_used = 0

    def _create_provider(self) -> BaseLLMProvider:
        """Create the appropriate LLM provider."""
        if self.provider_name == "openai":
            key = self.api_key_override or settings.openai_api_key
            if not key:
                raise ValueError("OpenAI API key not configured")
            return OpenAIProvider(
                key,
                self.model_override or settings.openai_model
            )
        elif self.provider_name == "anthropic":
            key = self.api_key_override or settings.anthropic_api_key
            if not key:
                raise ValueError("Anthropic API key not configured")
            return AnthropicProvider(
                key,
                self.model_override or settings.anthropic_model
            )
        elif self.provider_name == "gemini":
            key = self.api_key_override or settings.gemini_api_key
            if not key:
                raise ValueError("Gemini API key not configured")
            return GeminiProvider(
                key,
                self.model_override or settings.gemini_model
            )
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider_name}")

    async def generate_project_summary(
        self,
        project_data: Dict[str, Any],
        style: str = "professional",
        language: str = "ko"
    ) -> Dict[str, Any]:
        """Generate a summary for a project."""
        prompts = get_prompts(language)

        style_map = {
            "professional": prompts["style_professional"],
            "casual": prompts["style_casual"],
            "technical": prompts["style_technical"],
        }

        system_prompt = f"""{prompts["system_resume"]}
{style_map.get(style, style_map['professional'])}
{prompts["json_format"]}"""

        # Build commit categories description
        commit_categories = project_data.get('commit_categories', {})
        categories_desc = ""
        if commit_categories:
            cat_parts = []
            if commit_categories.get("feature", 0) > 0:
                cat_parts.append(f"Features: {commit_categories['feature']}")
            if commit_categories.get("fix", 0) > 0:
                cat_parts.append(f"Bug fixes: {commit_categories['fix']}")
            if commit_categories.get("refactor", 0) > 0:
                cat_parts.append(f"Refactoring: {commit_categories['refactor']}")
            if commit_categories.get("docs", 0) > 0:
                cat_parts.append(f"Docs: {commit_categories['docs']}")
            if commit_categories.get("test", 0) > 0:
                cat_parts.append(f"Tests: {commit_categories['test']}")
            categories_desc = ", ".join(cat_parts)

        # Build code stats description
        lines_added = project_data.get('lines_added', 0)
        lines_deleted = project_data.get('lines_deleted', 0)
        files_changed = project_data.get('files_changed', 0)
        code_stats_desc = f"+{lines_added:,} / -{lines_deleted:,} lines across {files_changed} files" if lines_added else ""

        # Get key tasks if available
        key_tasks = project_data.get('key_tasks', [])
        key_tasks_desc = "\n".join(f"  - {task}" for task in key_tasks[:5]) if key_tasks else ""

        if language == "en":
            prompt = f"""Based on the following project information, write a DETAILED summary suitable for a resume.

Project Information:
- Name: {project_data.get('name', 'N/A')}
- Description: {project_data.get('description', 'N/A')}
- Role: {project_data.get('role', 'N/A')}
- Team Size: {project_data.get('team_size', 'N/A')} members
- Contribution: {project_data.get('contribution_percent', 'N/A')}%
- Tech Stack: {', '.join(project_data.get('technologies', []))}
- Period: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}

Code Contribution Analysis:
- Total Commits: {project_data.get('total_commits', 'N/A')}
- User Commits: {project_data.get('user_commits', 'N/A')}
- Code Changes: {code_stats_desc or 'N/A'}
- Commit Categories: {categories_desc or 'N/A'}
- Commit Summary: {project_data.get('commit_summary', 'N/A')}

Key Tasks Performed:
{key_tasks_desc or '(Not available)'}

Instructions:
1. Write a comprehensive summary (4-6 sentences) that highlights:
   - What the project does and its purpose
   - Your specific role and key contributions
   - Technical challenges overcome
   - Measurable impact or outcomes

2. List 4-5 key features you implemented or contributed to

3. Highlight 3-4 technical achievements or architectural decisions

4. Describe your responsibilities in detail

Respond in the following JSON format:
{{
    "summary": "4-6 sentence detailed project summary emphasizing your contributions and impact",
    "key_features": ["Specific feature 1 with impact", "Specific feature 2", "Specific feature 3", "Specific feature 4"],
    "technical_highlights": ["Technical achievement 1", "Architectural decision 2", "Performance improvement 3"],
    "role_description": "Detailed description of responsibilities and leadership"
}}"""
        else:
            prompt = f"""다음 프로젝트 정보를 바탕으로 이력서에 적합한 **상세한** 요약을 작성해주세요.

프로젝트 정보:
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 팀 규모: {project_data.get('team_size', 'N/A')}명
- 기여도: {project_data.get('contribution_percent', 'N/A')}%
- 기술 스택: {', '.join(project_data.get('technologies', []))}
- 기간: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}

코드 기여 분석:
- 총 커밋: {project_data.get('total_commits', 'N/A')}
- 내 커밋: {project_data.get('user_commits', 'N/A')}
- 코드 변경량: {code_stats_desc or 'N/A'}
- 커밋 유형: {categories_desc or 'N/A'}
- 커밋 메시지 요약: {project_data.get('commit_summary', 'N/A')}

주요 수행 업무:
{key_tasks_desc or '(정보 없음)'}

작성 지침:
1. 포괄적인 요약(4-6문장)을 작성하세요:
   - 프로젝트의 목적과 기능
   - 본인의 역할과 핵심 기여
   - 해결한 기술적 과제
   - 측정 가능한 성과나 영향

2. 구현하거나 기여한 주요 기능 4-5개 나열

3. 기술적 성과나 아키텍처 결정 3-4개 강조

4. 책임과 역할을 상세히 설명

다음 JSON 형식으로 응답하세요:
{{
    "summary": "4-6문장의 상세한 프로젝트 요약 (기여와 영향 강조)",
    "key_features": ["구체적인 기능 1 (영향 포함)", "구체적인 기능 2", "구체적인 기능 3", "구체적인 기능 4"],
    "technical_highlights": ["기술적 성과 1", "아키텍처 결정 2", "성능 개선 3"],
    "role_description": "책임과 리더십에 대한 상세 설명"
}}"""

        response, tokens = await self.provider.generate(prompt, system_prompt)
        self.total_tokens_used += tokens

        # Parse JSON response
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_str = response or ""
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]

            return json.loads(json_str.strip())
        except json.JSONDecodeError:
            # Return raw response if JSON parsing fails
            return {
                "summary": response or "",
                "key_features": [],
                "technical_highlights": [],
                "role_description": ""
            }

    async def generate_multi_repo_summary(
        self,
        project_data: Dict[str, Any],
        repo_summaries: List[Dict[str, Any]],
        style: str = "professional",
        language: str = "ko",
    ) -> Dict[str, Any]:
        """Generate a holistic AI summary for a multi-repo project.

        Args:
            project_data: Project-level info (name, role, team_size, etc.)
            repo_summaries: List of per-repo dicts, each with:
                label, git_url, ai_summary, key_tasks, technologies
            style: Summary style.
            language: Output language.

        Returns same JSON structure as generate_project_summary().
        """
        prompts = get_prompts(language)
        style_map = {
            "professional": prompts["style_professional"],
            "casual": prompts["style_casual"],
            "technical": prompts["style_technical"],
        }
        system_prompt = f"""{prompts["system_resume"]}
{style_map.get(style, style_map['professional'])}
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
- Name: {project_data.get('name', 'N/A')}
- Description: {project_data.get('description', 'N/A')}
- Role: {project_data.get('role', 'N/A')}
- Team Size: {project_data.get('team_size', 'N/A')} members
- Contribution: {project_data.get('contribution_percent', 'N/A')}%
- Period: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}

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
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 팀 규모: {project_data.get('team_size', 'N/A')}명
- 기여도: {project_data.get('contribution_percent', 'N/A')}%
- 기간: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}

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

        response, tokens = await self.provider.generate(prompt, system_prompt)
        self.total_tokens_used += tokens

        try:
            json_str = response or ""
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]
            result = json.loads(json_str.strip())
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

    async def generate_commit_summary(
        self,
        commit_messages: List[str],
        language: str = "ko"
    ) -> str:
        """Generate a summary of commit messages."""
        prompts = get_prompts(language)

        if not commit_messages:
            return "No commit history." if language == "en" else "커밋 내역이 없습니다."

        if language == "en":
            system_prompt = "You are an expert in analyzing development project commit history."
            prompt = f"""Analyze the following commit messages and summarize the main tasks performed in the project in 2-3 sentences.

Commit messages:
{chr(10).join(f'- {msg}' for msg in commit_messages[:30])}

Summary:"""
        else:
            system_prompt = "당신은 개발 프로젝트의 커밋 내역을 분석하는 전문가입니다."
            prompt = f"""다음 커밋 메시지들을 분석하고 프로젝트에서 수행한 주요 작업을 2-3문장으로 요약해주세요.

커밋 메시지:
{chr(10).join(f'- {msg}' for msg in commit_messages[:30])}

요약:"""

        content, tokens = await self.provider.generate(prompt, system_prompt, max_tokens=500)
        self.total_tokens_used += tokens
        return content or ""

    async def generate_achievement_description(
        self,
        metric_name: str,
        metric_value: str,
        context: str = ""
    ) -> str:
        """Generate a description for an achievement."""
        prompt = f"""다음 성과를 이력서에 적합한 형태로 1-2문장으로 설명해주세요.

성과 지표: {metric_name}
수치: {metric_value}
맥락: {context}

설명:"""

        content, tokens = await self.provider.generate(prompt, max_tokens=200)
        self.total_tokens_used += tokens
        return content or ""

    async def generate_skills_summary(
        self,
        technologies: List[str],
        project_count: int
    ) -> str:
        """Generate a skills summary."""
        prompt = f"""다음 기술 스택을 바탕으로 간단한 기술 요약을 작성해주세요.

사용한 기술:
{', '.join(technologies)}

총 프로젝트 수: {project_count}

기술 요약 (2-3문장):"""

        content, tokens = await self.provider.generate(prompt, max_tokens=300)
        self.total_tokens_used += tokens
        return content or ""

    async def optimize_for_template(
        self,
        content: str,
        max_length: int,
        platform: str
    ) -> str:
        """Optimize content for a specific template/platform."""
        platform_guidelines = {
            "saramin": "사람인 플랫폼에 적합하게 간결하고 전문적으로",
            "wanted": "원티드 플랫폼에 적합하게 성과 중심으로",
            "remember": "리멤버 플랫폼에 적합하게 핵심만 간단히",
            "notion": "노션 포트폴리오에 적합하게 상세하고 시각적으로"
        }

        guideline = platform_guidelines.get(platform, "간결하고 전문적으로")

        prompt = f"""다음 내용을 {guideline} 수정해주세요.
최대 {max_length}자 이내로 작성하세요.

원본:
{content}

수정된 내용:"""

        result, tokens = await self.provider.generate(prompt, max_tokens=max_length // 2)
        self.total_tokens_used += tokens
        return result or ""

    async def generate_key_tasks(
        self,
        project_data: Dict[str, Any],
        commit_summary: Optional[str] = None,
        language: str = "ko",
        user_context: Optional[str] = None,
        code_context: Optional[str] = None
    ) -> List[str]:
        """
        Generate key tasks in numbered format (1), (2), (3)...
        Delegates to llm_generation module.
        """
        tasks, tokens = await generate_key_tasks_llm(
            self.provider,
            project_data,
            commit_summary,
            language,
            user_context,
            code_context
        )
        self.total_tokens_used += tokens
        return tasks

    async def generate_implementation_details(
        self,
        project_data: Dict[str, Any],
        commit_summary: Optional[str] = None,
        language: str = "ko",
        user_context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate detailed implementation features grouped by category.
        Delegates to llm_generation module.
        """
        details, tokens = await generate_implementation_details_llm(
            self.provider,
            project_data,
            commit_summary,
            language,
            user_context
        )
        self.total_tokens_used += tokens
        return details

    async def generate_detailed_achievements(
        self,
        project_data: Dict[str, Any],
        existing_achievements: Optional[List[Dict[str, Any]]] = None,
        language: str = "ko",
        user_context: Optional[str] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Generate achievements grouped by category with before/after format.
        Delegates to llm_generation module.
        """
        achievements, tokens = await generate_detailed_achievements_llm(
            self.provider,
            project_data,
            existing_achievements,
            language,
            user_context
        )
        self.total_tokens_used += tokens
        return achievements
