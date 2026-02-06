"""
Key Tasks Generator - Generates key tasks using LLM for project analysis.

Extracted from api/routers/github.py in v1.12 refactoring.
"""
import logging
from typing import Optional, Tuple, List, Dict, Any

logger = logging.getLogger(__name__)


async def generate_key_tasks(
    project,  # Project model
    repo_analysis,  # RepoAnalysis model
    llm_service=None,
    cli_mode: str = None,
    cli_model: str = None,
    language: str = "ko",
    user_context: Optional[str] = None,
    code_contributions: Optional[Dict[str, Any]] = None
) -> Tuple[List[str], int]:
    """
    Generate key tasks using LLM based on project analysis.
    Returns a tuple of (list of key tasks, token count).
    Supports both API mode (LLMService) and CLI mode (CLILLMService).

    Args:
        project: Project model
        repo_analysis: Repository analysis model
        llm_service: Optional pre-initialized LLM service
        cli_mode: CLI mode ("claude_code" or "gemini_cli")
        cli_model: CLI model name
        language: Output language ("ko" or "en")
        user_context: Optional user-edited content to reference for re-analysis
        code_contributions: Optional user's code contributions with patches for context

    Returns:
        Tuple of (list of key task strings, token count)
    """
    from api.services.llm import LLMService, CLILLMService

    try:
        if llm_service is None:
            if cli_mode:
                logger.info("[KeyTasks] Using CLI mode: %s, model: %s", cli_mode, cli_model)
                llm_service = CLILLMService(cli_mode, model=cli_model)
            else:
                llm_service = LLMService()

        logger.debug("[KeyTasks] LLM service type: %s, language: %s", type(llm_service).__name__, language)
        if hasattr(llm_service, 'provider_name'):
            logger.debug("[KeyTasks] Provider name: %s", llm_service.provider_name)

        # Build project data for LLM service
        project_data = {
            "name": project.name,
            "description": project.description or "",
            "role": project.role or ("Developer" if language == "en" else "개발자"),
            "technologies": repo_analysis.detected_technologies or [],
            "total_commits": repo_analysis.total_commits or 0,
            "lines_added": repo_analysis.lines_added or 0,
        }

        commit_summary = repo_analysis.commit_messages_summary or ""

        # Build code context from contributions
        code_context = None
        if code_contributions and code_contributions.get("contributions"):
            # Format significant code changes for LLM context
            code_snippets = []
            for contrib in code_contributions["contributions"][:10]:  # Top 10 commits
                commit_info = f"Commit: {contrib['message']}"
                for file_info in contrib.get("files", [])[:3]:  # Top 3 files per commit
                    if file_info.get("patch"):
                        code_snippets.append(f"{commit_info}\nFile: {file_info['filename']}\n{file_info['patch'][:500]}")
            if code_snippets:
                code_context = "\n\n---\n\n".join(code_snippets[:5])  # Limit to 5 snippets
                logger.info("[KeyTasks] Including %d code snippets in context", len(code_snippets[:5]))

        # Use LLMService's generate_key_tasks method with language support
        tasks = await llm_service.generate_key_tasks(
            project_data=project_data,
            commit_summary=commit_summary,
            language=language,
            user_context=user_context,
            code_context=code_context
        )

        tokens = llm_service.total_tokens_used if hasattr(llm_service, 'total_tokens_used') else 0
        return tasks, tokens

    except Exception as e:
        # Log error but don't fail the analysis
        import traceback
        logger.warning("Failed to generate key tasks: %s: %s", type(e).__name__, e)
        logger.debug("[KeyTasks] Traceback: %s", traceback.format_exc())
        return [], 0
