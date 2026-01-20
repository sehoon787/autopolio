"""
LLM Service - Supports both OpenAI and Anthropic for text generation.
"""
from typing import Dict, List, Any, Optional
from abc import ABC, abstractmethod
import json

from api.config import get_settings

settings = get_settings()


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        pass


class OpenAIProvider(BaseLLMProvider):
    """OpenAI GPT provider."""

    def __init__(self, api_key: str, model: str = "gpt-4-turbo-preview"):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key)

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature
        )

        return response.choices[0].message.content


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider."""

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self.api_key)

        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}]
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        response = await client.messages.create(**kwargs)

        return response.content[0].text


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        import google.generativeai as genai

        genai.configure(api_key=self.api_key)

        # Combine system prompt with user prompt
        full_prompt = prompt
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n{prompt}"

        model = genai.GenerativeModel(self.model)
        response = await model.generate_content_async(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
        )

        return response.text


class LLMService:
    """Service for LLM-based text generation."""

    def __init__(self, provider: str = None):
        self.provider_name = provider or settings.llm_provider
        self.provider = self._create_provider()

    def _create_provider(self) -> BaseLLMProvider:
        """Create the appropriate LLM provider."""
        if self.provider_name == "openai":
            if not settings.openai_api_key:
                raise ValueError("OpenAI API key not configured")
            return OpenAIProvider(
                settings.openai_api_key,
                settings.openai_model
            )
        elif self.provider_name == "anthropic":
            if not settings.anthropic_api_key:
                raise ValueError("Anthropic API key not configured")
            return AnthropicProvider(
                settings.anthropic_api_key,
                settings.anthropic_model
            )
        elif self.provider_name == "gemini":
            if not settings.gemini_api_key:
                raise ValueError("Gemini API key not configured")
            return GeminiProvider(
                settings.gemini_api_key,
                settings.gemini_model
            )
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider_name}")

    async def generate_project_summary(
        self,
        project_data: Dict[str, Any],
        style: str = "professional"
    ) -> Dict[str, Any]:
        """Generate a summary for a project."""
        style_instructions = {
            "professional": "전문적이고 간결한 어조로 작성하세요.",
            "casual": "친근하고 읽기 쉬운 어조로 작성하세요.",
            "technical": "기술적인 세부사항을 강조하며 작성하세요."
        }

        system_prompt = f"""당신은 이력서/포트폴리오 작성을 돕는 전문가입니다.
{style_instructions.get(style, style_instructions['professional'])}
응답은 반드시 JSON 형식으로 작성하세요."""

        prompt = f"""다음 프로젝트 정보를 바탕으로 이력서에 적합한 요약을 작성해주세요.

프로젝트 정보:
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 팀 규모: {project_data.get('team_size', 'N/A')}명
- 기여도: {project_data.get('contribution_percent', 'N/A')}%
- 기술 스택: {', '.join(project_data.get('technologies', []))}
- 기간: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}

커밋 분석 (있는 경우):
- 총 커밋: {project_data.get('total_commits', 'N/A')}
- 커밋 메시지 요약: {project_data.get('commit_summary', 'N/A')}

다음 JSON 형식으로 응답하세요:
{{
    "summary": "2-3문장의 프로젝트 요약",
    "key_features": ["주요 기능 1", "주요 기능 2", "주요 기능 3"],
    "technical_highlights": ["기술적 특징 1", "기술적 특징 2"],
    "role_description": "역할에 대한 상세 설명"
}}"""

        response = await self.provider.generate(prompt, system_prompt)

        # Parse JSON response
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]

            return json.loads(json_str.strip())
        except json.JSONDecodeError:
            # Return raw response if JSON parsing fails
            return {
                "summary": response,
                "key_features": [],
                "technical_highlights": [],
                "role_description": ""
            }

    async def generate_commit_summary(
        self,
        commit_messages: List[str]
    ) -> str:
        """Generate a summary of commit messages."""
        if not commit_messages:
            return "커밋 내역이 없습니다."

        system_prompt = "당신은 개발 프로젝트의 커밋 내역을 분석하는 전문가입니다."

        prompt = f"""다음 커밋 메시지들을 분석하고 프로젝트에서 수행한 주요 작업을 2-3문장으로 요약해주세요.

커밋 메시지:
{chr(10).join(f'- {msg}' for msg in commit_messages[:30])}

요약:"""

        return await self.provider.generate(prompt, system_prompt, max_tokens=500)

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

        return await self.provider.generate(prompt, max_tokens=200)

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

        return await self.provider.generate(prompt, max_tokens=300)

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

        return await self.provider.generate(prompt, max_tokens=max_length // 2)
