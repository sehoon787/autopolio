"""
Bug fix verification tests for:
- Bug A: user_code_contributions in background analysis paths
- Bug B: Codex CLI _parse_codex_jsonl error handling
- Bug C: Claude Code OAuth stdin fix
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = pytest.mark.anyio


# ============================================================
# Bug A: save_llm_results with user_code_contributions
# ============================================================


class TestSaveLLMResultsCodeContributions:
    """Verify save_llm_results stores user_code_contributions to DB."""

    async def test_save_llm_results_with_contributions(self):
        """save_llm_results should store user_code_contributions on RepoAnalysis."""
        from api.services.analysis.analysis_job_helpers import save_llm_results

        mock_repo_analysis = MagicMock()
        mock_repo_analysis.id = 1

        contributions = {
            "summary": {"analyzed_commits": 10, "lines_added": 500},
            "technologies": ["Python", "FastAPI"],
            "work_areas": ["backend", "tests"],
            "commits": [{"sha": "abc123"}],  # extra field should NOT be saved
        }

        with patch(
            "api.services.analysis.analysis_job_helpers.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_session = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(
                return_value=mock_session
            )
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            # Mock db.execute to return our mock_repo_analysis
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_repo_analysis
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_session.commit = AsyncMock()

            await save_llm_results(
                analysis_id=1,
                project_id=1,
                is_primary=False,
                language="ko",
                key_tasks=["task1"],
                detailed_content={},
                ai_summary=None,
                ai_key_features=None,
                user_code_contributions=contributions,
            )

            # Verify user_code_contributions was set with only expected fields
            saved = mock_repo_analysis.user_code_contributions
            assert saved is not None
            assert saved["summary"] == {"analyzed_commits": 10, "lines_added": 500}
            assert saved["technologies"] == ["Python", "FastAPI"]
            assert saved["work_areas"] == ["backend", "tests"]
            assert "commits" not in saved  # raw commits should NOT be saved

    async def test_save_llm_results_without_contributions(self):
        """save_llm_results should not touch user_code_contributions when None."""
        from api.services.analysis.analysis_job_helpers import save_llm_results

        mock_repo_analysis = MagicMock()
        mock_repo_analysis.id = 1
        # Do NOT set user_code_contributions initially
        mock_repo_analysis.user_code_contributions = "ORIGINAL"

        with patch(
            "api.services.analysis.analysis_job_helpers.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_session = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(
                return_value=mock_session
            )
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_repo_analysis
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_session.commit = AsyncMock()

            await save_llm_results(
                analysis_id=1,
                project_id=1,
                is_primary=False,
                language="ko",
                key_tasks=[],
                detailed_content={},
                user_code_contributions=None,  # explicitly None
            )

            # Should NOT have been overwritten
            assert mock_repo_analysis.user_code_contributions == "ORIGINAL"


# ============================================================
# Bug B: Codex CLI _parse_codex_jsonl error handling
# ============================================================


class TestCodexJSONLParsing:
    """Verify _parse_codex_jsonl handles error and turn.failed events."""

    def _make_service(self):
        from api.services.llm.cli_llm_service import CLILLMService

        return CLILLMService(cli_type="codex_cli")

    def test_parse_error_event_raises(self):
        """'error' event type should raise RuntimeError."""
        svc = self._make_service()
        jsonl = '{"type":"error","message":"rate limit exceeded"}\n'

        with pytest.raises(RuntimeError, match="Codex CLI error: rate limit exceeded"):
            svc._parse_codex_jsonl(jsonl)

    def test_parse_turn_failed_event_raises(self):
        """'turn.failed' event type should raise RuntimeError."""
        svc = self._make_service()
        jsonl = '{"type":"turn.failed","error":{"message":"model overloaded"}}\n'

        with pytest.raises(
            RuntimeError, match="Codex CLI turn failed: model overloaded"
        ):
            svc._parse_codex_jsonl(jsonl)

    def test_parse_turn_failed_string_error(self):
        """'turn.failed' with string error should still raise."""
        svc = self._make_service()
        jsonl = '{"type":"turn.failed","error":"something broke"}\n'

        with pytest.raises(
            RuntimeError, match="Codex CLI turn failed: something broke"
        ):
            svc._parse_codex_jsonl(jsonl)

    def test_parse_normal_output(self):
        """Normal agent messages should be parsed correctly."""
        svc = self._make_service()
        jsonl = (
            '{"type":"thread.started"}\n'
            '{"type":"turn.started"}\n'
            '{"type":"item.completed","item":{"type":"agent_message","text":"Hello world"}}\n'
            '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":50}}\n'
        )

        content, tokens = svc._parse_codex_jsonl(jsonl)
        assert content == "Hello world"
        assert tokens == 150

    def test_parse_empty_output_returns_empty_string(self):
        """No agent messages should return empty string, NOT raw output."""
        svc = self._make_service()
        jsonl = (
            '{"type":"thread.started"}\n'
            '{"type":"turn.started"}\n'
            '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":0}}\n'
        )

        content, tokens = svc._parse_codex_jsonl(jsonl)
        assert content == ""  # NOT the raw JSONL text (bug fix)
        assert tokens == 10  # tokens still tracked even with empty content

    def test_parse_multiple_messages_concatenated(self):
        """Multiple agent messages should be joined with newline."""
        svc = self._make_service()
        jsonl = (
            '{"type":"item.completed","item":{"type":"agent_message","text":"Part 1"}}\n'
            '{"type":"item.completed","item":{"type":"agent_message","text":"Part 2"}}\n'
            '{"type":"turn.completed","usage":{"input_tokens":50,"output_tokens":30}}\n'
        )

        content, tokens = svc._parse_codex_jsonl(jsonl)
        assert content == "Part 1\nPart 2"
        assert tokens == 80

    def test_parse_error_before_messages_raises(self):
        """Error event before any messages should still raise."""
        svc = self._make_service()
        jsonl = (
            '{"type":"thread.started"}\n'
            '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}\n'
            '{"type":"error","message":"connection lost"}\n'
        )

        with pytest.raises(RuntimeError, match="Codex CLI error: connection lost"):
            svc._parse_codex_jsonl(jsonl)


# ============================================================
# Bug C: Claude Code OAuth stdin handling
# ============================================================


class TestSpawnLoginStdin:
    """Verify _spawn_login_and_extract_url uses PIPE for stdin (code-exchange flow)."""

    def test_spawn_uses_pipe_stdin(self):
        """_spawn_login_and_extract_url should use stdin=PIPE for code-exchange flow."""
        from api.services.llm.cli_service import CLIService
        import inspect

        svc = CLIService()
        source = inspect.getsource(svc._spawn_login_and_extract_url)

        # stdin=subprocess.PIPE should be present (CLI needs stdin for auth code)
        assert "stdin=subprocess.PIPE" in source

    def test_spawn_login_exists(self):
        """_spawn_login_and_extract_url should exist on CLIService."""
        from api.services.llm.cli_service import CLIService

        svc = CLIService()
        assert hasattr(svc, "_spawn_login_and_extract_url")


# ============================================================
# Bug A: Integration - code_contributions flows through runner
# ============================================================


class TestRunnerCodeContributionsFlow:
    """Verify code_contributions collection is wired into the background runners."""

    def test_run_llm_steps_accepts_code_contributions_param(self):
        """_run_llm_steps should accept code_contributions keyword argument."""
        import inspect
        from api.services.analysis.analysis_job_runner import _run_llm_steps

        sig = inspect.signature(_run_llm_steps)
        assert "code_contributions" in sig.parameters

    def test_save_llm_results_accepts_user_code_contributions_param(self):
        """save_llm_results should accept user_code_contributions keyword argument."""
        import inspect
        from api.services.analysis.analysis_job_helpers import save_llm_results

        sig = inspect.signature(save_llm_results)
        assert "user_code_contributions" in sig.parameters

    def test_runner_source_calls_get_user_code_contributions(self):
        """Single-repo runner should call get_user_code_contributions."""
        import inspect
        from api.services.analysis import analysis_job_runner

        source = inspect.getsource(analysis_job_runner)
        assert "get_user_code_contributions" in source

    def test_multi_runner_source_calls_get_user_code_contributions(self):
        """Multi-repo runner should call get_user_code_contributions."""
        import inspect
        from api.services.analysis import analysis_job_multi

        source = inspect.getsource(analysis_job_multi)
        assert "get_user_code_contributions" in source

    def test_runner_passes_code_contributions_to_generate_detailed_content(self):
        """Both runners should pass code_contributions to generate_detailed_content."""
        import inspect
        from api.services.analysis import analysis_job_runner, analysis_job_multi

        for mod in [analysis_job_runner, analysis_job_multi]:
            source = inspect.getsource(mod)
            assert "code_contributions=code_contributions" in source, (
                f"{mod.__name__} does not pass code_contributions to generate_detailed_content"
            )

    def test_runner_passes_contributions_to_save_llm_results(self):
        """Both runners should pass user_code_contributions to save_llm_results."""
        import inspect
        from api.services.analysis import analysis_job_runner, analysis_job_multi

        for mod in [analysis_job_runner, analysis_job_multi]:
            source = inspect.getsource(mod)
            assert "user_code_contributions=code_contributions" in source, (
                f"{mod.__name__} does not pass user_code_contributions to save_llm_results"
            )


# ============================================================
# Schema / Endpoint verification
# ============================================================


class TestSchemaFieldExposure:
    """Verify user_code_contributions field is exposed in all response schemas."""

    def test_effective_analysis_response_has_field(self):
        """EffectiveAnalysisResponse must include user_code_contributions."""
        from api.schemas.github import EffectiveAnalysisResponse

        fields = EffectiveAnalysisResponse.model_fields
        assert "user_code_contributions" in fields

    def test_repo_analysis_summary_has_field(self):
        """RepoAnalysisSummary must include user_code_contributions."""
        from api.schemas.github import RepoAnalysisSummary

        fields = RepoAnalysisSummary.model_fields
        assert "user_code_contributions" in fields

    def test_repo_analysis_response_has_field(self):
        """RepoAnalysisResponse must include user_code_contributions."""
        from api.schemas.github import RepoAnalysisResponse

        fields = RepoAnalysisResponse.model_fields
        assert "user_code_contributions" in fields

    def test_endpoint_effective_passes_field(self):
        """github_edits.py effective endpoint should pass user_code_contributions."""
        import inspect
        from api.routers.github import github_edits

        source = inspect.getsource(github_edits.get_effective_analysis)
        assert "user_code_contributions=" in source

    def test_endpoint_per_repo_passes_field(self):
        """github_edits.py per-repo endpoint should pass user_code_contributions."""
        import inspect
        from api.routers.github import github_edits

        source = inspect.getsource(github_edits.get_per_repo_analyses)
        assert "user_code_contributions=" in source

    def test_gemini_login_uses_pipe_stdin(self):
        """_start_gemini_login should use stdin=PIPE for process management."""
        import inspect
        from api.services.llm.cli_service import CLIService

        source = inspect.getsource(CLIService._start_gemini_login)
        assert "stdin=subprocess.PIPE" in source
