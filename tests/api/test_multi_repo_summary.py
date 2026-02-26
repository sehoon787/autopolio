"""
Test: generate_multi_repo_summary for both LLMService and CLILLMService.

Verifies that the shared generate_multi_repo_summary_llm function works
correctly and that both services delegate to it properly.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch


def _run(coro):
    """Run an async coroutine synchronously."""
    return asyncio.run(coro)


def _make_fake_provider(response_json: dict):
    """Create a mock provider that returns a fixed JSON string."""
    provider = AsyncMock()
    provider.generate = AsyncMock(return_value=(json.dumps(response_json), 42))
    return provider


SAMPLE_PROJECT_DATA = {
    "name": "Autopolio",
    "description": "Portfolio automation platform",
    "role": "Full-stack Developer",
    "team_size": 3,
    "contribution_percent": 80,
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
}

SAMPLE_REPO_SUMMARIES = [
    {
        "label": "Backend API",
        "git_url": "https://github.com/user/backend.git",
        "ai_summary": "FastAPI backend with 6-step pipeline",
        "key_tasks": ["REST API 설계", "파이프라인 구현"],
        "technologies": ["Python", "FastAPI", "SQLAlchemy"],
    },
    {
        "label": "Frontend",
        "git_url": "https://github.com/user/frontend.git",
        "ai_summary": "React TypeScript SPA",
        "key_tasks": ["컴포넌트 개발", "상태 관리"],
        "technologies": ["React", "TypeScript", "Tailwind CSS"],
    },
]

EXPECTED_LLM_RESPONSE = {
    "summary": "Autopolio is a full-stack platform...",
    "key_features": ["REST API", "React SPA", "Pipeline"],
    "technical_highlights": ["FastAPI + React integration"],
    "role_description": "Full-stack developer across all repos",
}


class TestGenerateMultiRepoSummaryLLM:
    """Test the shared generate_multi_repo_summary_llm function directly."""

    def test_returns_parsed_json(self):
        """Valid JSON response should be parsed correctly."""
        from api.services.llm.llm_generation import generate_multi_repo_summary_llm

        provider = _make_fake_provider(EXPECTED_LLM_RESPONSE)
        result = _run(generate_multi_repo_summary_llm(
            provider, SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
        ))

        assert result["summary"] == EXPECTED_LLM_RESPONSE["summary"]
        assert result["key_features"] == EXPECTED_LLM_RESPONSE["key_features"]
        assert result["technical_highlights"] == EXPECTED_LLM_RESPONSE["technical_highlights"]
        assert result["role_description"] == EXPECTED_LLM_RESPONSE["role_description"]
        assert result["token_usage"] == 42

    def test_handles_markdown_wrapped_json(self):
        """JSON wrapped in ```json ... ``` should be parsed."""
        from api.services.llm.llm_generation import generate_multi_repo_summary_llm

        wrapped = f"```json\n{json.dumps(EXPECTED_LLM_RESPONSE)}\n```"
        provider = AsyncMock()
        provider.generate = AsyncMock(return_value=(wrapped, 10))

        result = _run(generate_multi_repo_summary_llm(
            provider, SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
        ))

        assert result["summary"] == EXPECTED_LLM_RESPONSE["summary"]
        assert result["token_usage"] == 10

    def test_fallback_on_invalid_json(self):
        """Non-JSON response should return raw text as summary."""
        from api.services.llm.llm_generation import generate_multi_repo_summary_llm

        provider = AsyncMock()
        provider.generate = AsyncMock(return_value=("This is not JSON", 5))

        result = _run(generate_multi_repo_summary_llm(
            provider, SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
        ))

        assert result["summary"] == "This is not JSON"
        assert result["key_features"] == []
        assert result["token_usage"] == 5

    def test_fallback_on_exception(self):
        """Provider exception should return empty result."""
        from api.services.llm.llm_generation import generate_multi_repo_summary_llm

        provider = AsyncMock()
        provider.generate = AsyncMock(side_effect=RuntimeError("Connection failed"))

        result = _run(generate_multi_repo_summary_llm(
            provider, SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
        ))

        assert result["summary"] == ""
        assert result["key_features"] == []
        assert result["token_usage"] == 0

    def test_english_language(self):
        """English prompt should be used when language='en'."""
        from api.services.llm.llm_generation import generate_multi_repo_summary_llm

        provider = _make_fake_provider(EXPECTED_LLM_RESPONSE)
        result = _run(generate_multi_repo_summary_llm(
            provider, SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
            language="en",
        ))

        call_args = provider.generate.call_args
        prompt = call_args[0][0]
        assert "MULTIPLE repositories" in prompt
        assert "HOLISTIC" in prompt
        assert result["summary"] == EXPECTED_LLM_RESPONSE["summary"]

    def test_korean_language(self):
        """Korean prompt should be used when language='ko'."""
        from api.services.llm.llm_generation import generate_multi_repo_summary_llm

        provider = _make_fake_provider(EXPECTED_LLM_RESPONSE)
        result = _run(generate_multi_repo_summary_llm(
            provider, SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
            language="ko",
        ))

        call_args = provider.generate.call_args
        prompt = call_args[0][0]
        assert "여러 레포지토리" in prompt
        assert "통합적인" in prompt
        assert result["summary"] == EXPECTED_LLM_RESPONSE["summary"]


class TestCLILLMServiceMultiRepo:
    """Test that CLILLMService.generate_multi_repo_summary delegates correctly."""

    def test_cli_service_has_method(self):
        """CLILLMService should have generate_multi_repo_summary method."""
        from api.services.llm.cli_llm_service import CLILLMService

        assert hasattr(CLILLMService, "generate_multi_repo_summary")
        assert callable(getattr(CLILLMService, "generate_multi_repo_summary"))

    def test_cli_service_delegates_to_shared_function(self):
        """CLILLMService.generate_multi_repo_summary should call the shared function."""
        from api.services.llm.cli_llm_service import CLILLMService

        service = CLILLMService.__new__(CLILLMService)
        service.cli_type = "claude_code"
        service.model = None
        service.total_tokens_used = 0
        service.provider = MagicMock()

        mock_result = {
            "summary": "mocked summary",
            "key_features": ["feat1"],
            "token_usage": 100,
        }

        with patch(
            "api.services.llm.llm_generation.generate_multi_repo_summary_llm",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_fn:
            result = _run(service.generate_multi_repo_summary(
                SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
            ))

            mock_fn.assert_called_once_with(
                service.provider,
                SAMPLE_PROJECT_DATA,
                SAMPLE_REPO_SUMMARIES,
                "professional",
                "ko",
            )
            assert result["summary"] == "mocked summary"


class TestLLMServiceMultiRepo:
    """Test that LLMService.generate_multi_repo_summary delegates correctly."""

    def test_llm_service_delegates_and_tracks_tokens(self):
        """LLMService.generate_multi_repo_summary should delegate and track tokens."""
        from api.services.llm.llm_service import LLMService

        service = LLMService.__new__(LLMService)
        service.provider = MagicMock()
        service.total_tokens_used = 0

        mock_result = {
            "summary": "mocked summary",
            "key_features": ["feat1"],
            "token_usage": 50,
        }

        # Patch at the import location in llm_service module
        with patch(
            "api.services.llm.llm_service.generate_multi_repo_summary_llm",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_fn:
            result = _run(service.generate_multi_repo_summary(
                SAMPLE_PROJECT_DATA, SAMPLE_REPO_SUMMARIES,
            ))

            mock_fn.assert_called_once()
            assert result["summary"] == "mocked summary"
            assert service.total_tokens_used == 50
