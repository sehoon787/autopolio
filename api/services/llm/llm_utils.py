"""
LLM Utilities - Shared helpers for LLM response parsing and service creation.

Used by: llm_generation.py, analysis_job_helpers.py, analysis_job_runner.py,
         analysis_job_multi.py, achievement_service.py, pipeline_steps.py
"""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_json_from_llm(response: str) -> Any:
    """Parse JSON from LLM response, stripping ```json fences if present."""
    json_str = response.strip() if response else ""
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0]
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0]
    try:
        return json.loads(json_str.strip())
    except json.JSONDecodeError as e:
        logger.warning(
            "[parse_json_from_llm] JSON parse failed: %s (preview=%.200s)",
            e,
            json_str[:200],
        )
        raise


def create_llm_service(options: dict):
    """Create LLM service from options dict (CLI/API branching).

    Returns LLMService or CLILLMService instance, or None if creation fails.
    """
    from api.services.llm import LLMService, CLILLMService

    cli_mode = options.get("cli_mode")
    cli_model = options.get("cli_model")
    provider = options.get("provider")
    api_key = options.get("api_key")

    if cli_mode:
        return CLILLMService(cli_mode, model=cli_model)
    elif provider:
        return LLMService(provider, api_key=api_key)
    else:
        return LLMService(api_key=api_key)
