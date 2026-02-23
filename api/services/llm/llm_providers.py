"""
LLM Providers - Abstract base class and concrete implementations for LLM providers.
"""

from typing import Optional, Tuple
from abc import ABC, abstractmethod


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> Tuple[str, int]:
        """Generate text. Returns (content, total_tokens)."""
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
        temperature: float = 0.7,
    ) -> Tuple[str, int]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key)

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        print(
            f"[OpenAI] Request: model={self.model}, max_tokens={max_tokens}, temperature={temperature}",
            flush=True,
        )

        response = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        content = response.choices[0].message.content
        total_tokens = response.usage.total_tokens if response.usage else 0
        print(
            f"[OpenAI] Response: tokens={total_tokens}, length={len(content or '')} chars",
            flush=True,
        )
        return content, total_tokens


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
        temperature: float = 0.7,
    ) -> Tuple[str, int]:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self.api_key)

        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        print(
            f"[Anthropic] Request: model={self.model}, max_tokens={max_tokens}",
            flush=True,
        )

        response = await client.messages.create(**kwargs)

        content = response.content[0].text
        total_tokens = (
            (response.usage.input_tokens + response.usage.output_tokens)
            if response.usage
            else 0
        )
        in_tokens = getattr(response.usage, "input_tokens", 0)
        out_tokens = getattr(response.usage, "output_tokens", 0)
        print(
            f"[Anthropic] Response: tokens={total_tokens} (in={in_tokens}, out={out_tokens}), length={len(content or '')} chars",
            flush=True,
        )
        return content, total_tokens


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider using the new google.genai SDK."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> Tuple[str, int]:
        from google import genai

        client = genai.Client(api_key=self.api_key)

        # Build contents with system instruction if provided
        contents = prompt
        config = genai.types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

        # Add system instruction if provided
        if system_prompt:
            config.system_instruction = system_prompt

        print(
            f"[Gemini] Request: model={self.model}, max_tokens={max_tokens}, temperature={temperature}",
            flush=True,
        )

        response = await client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        content = response.text
        total_tokens = 0
        if response.usage_metadata:
            total_tokens = getattr(
                response.usage_metadata, "prompt_token_count", 0
            ) + getattr(response.usage_metadata, "candidates_token_count", 0)
        print(
            f"[Gemini] Response: tokens={total_tokens}, length={len(content or '')} chars",
            flush=True,
        )
        return content, total_tokens
