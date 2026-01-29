"""
CLI LLM Service Tests

Tests stdin-based prompt delivery to Claude Code / Gemini CLI.
Run with: python test_cli.py
"""
import asyncio
import sys
sys.path.insert(0, '.')
from api.services.cli_llm_service import CLILLMService


async def test_short_prompt():
    """Test with a simple short prompt."""
    print('\n' + '='*60)
    print('[Test 1] Short prompt test')
    print('='*60)

    svc = CLILLMService('claude_code', model='claude-sonnet-4-20250514')
    try:
        result, tokens = await svc.generate_with_cli('Say hello in exactly 5 words')
        print(f'[Test 1] Result: {result}')
        print(f'[Test 1] Tokens: {tokens}')
        print('[Test 1] PASSED')
        return True
    except Exception as e:
        print(f'[Test 1] Error: {type(e).__name__}: {e}')
        import traceback
        traceback.print_exc()
        print('[Test 1] FAILED')
        return False


async def test_long_prompt():
    """Test with a long prompt (>8000 chars) that would fail with command-line args."""
    print('\n' + '='*60)
    print('[Test 2] Long prompt test (stdin required)')
    print('='*60)

    # Create a prompt that exceeds Windows command-line limit (~8191 chars)
    base_text = "This is a test sentence for the long prompt. "
    long_context = base_text * 200  # ~9400 chars

    prompt = f"""Analyze the following text and provide a brief 2-sentence summary:

{long_context}

Summarize the above in 2 sentences."""

    print(f'[Test 2] Prompt length: {len(prompt)} chars')

    svc = CLILLMService('claude_code', model='claude-sonnet-4-20250514')
    try:
        result, tokens = await svc.generate_with_cli(prompt)
        print(f'[Test 2] Result: {result[:200]}...' if len(result) > 200 else f'[Test 2] Result: {result}')
        print(f'[Test 2] Tokens: {tokens}')
        print('[Test 2] PASSED')
        return True
    except Exception as e:
        print(f'[Test 2] Error: {type(e).__name__}: {e}')
        import traceback
        traceback.print_exc()
        print('[Test 2] FAILED')
        return False


async def test_special_characters():
    """Test with Korean characters and special symbols."""
    print('\n' + '='*60)
    print('[Test 3] Special characters test (Korean, symbols)')
    print('='*60)

    prompt = """다음 프로젝트를 요약해주세요:

프로젝트명: 포트폴리오 자동화 시스템
기술스택: React, TypeScript, FastAPI, PostgreSQL
성과: 생산성 80% 향상, 오류율 50% 감소

한국어로 2문장으로 요약해주세요. 특수문자 테스트: "따옴표" '작은따옴표' & < > | ^ % $"""

    print(f'[Test 3] Prompt length: {len(prompt)} chars')

    svc = CLILLMService('claude_code', model='claude-sonnet-4-20250514')
    try:
        result, tokens = await svc.generate_with_cli(prompt)
        print(f'[Test 3] Result: {result}')
        print(f'[Test 3] Tokens: {tokens}')
        print('[Test 3] PASSED')
        return True
    except Exception as e:
        print(f'[Test 3] Error: {type(e).__name__}: {e}')
        import traceback
        traceback.print_exc()
        print('[Test 3] FAILED')
        return False


async def test_analysis_prompt():
    """Test with a realistic project analysis prompt (similar to actual usage)."""
    print('\n' + '='*60)
    print('[Test 4] Realistic analysis prompt test')
    print('='*60)

    # Simulate the kind of prompt used in actual project analysis
    project_data = {
        "name": "Autopolio",
        "description": "GitHub 레포지토리 분석, Base Common Knowledge 구축, 템플릿 기반 이력서/포트폴리오 자동 생성 플랫폼",
        "role": "Full-stack Developer",
        "team_size": 1,
        "technologies": ["FastAPI", "React", "TypeScript", "SQLite", "Electron", "Tailwind CSS"],
        "total_commits": 150,
        "commit_summary": """
feat: Add CLI LLM service for Claude Code and Gemini CLI
fix: Resolve OAuth callback issues in Electron
refactor: Improve technology detection with 200+ patterns
feat: Add i18n support for Korean and English
feat: Implement project export functionality
fix: Handle Windows command-line length limits
        """.strip()
    }

    techs = ", ".join(project_data["technologies"])

    prompt = f"""You are a professional resume/portfolio writer. Analyze this software project and provide a structured analysis.

Project: {project_data["name"]}
Description: {project_data["description"]}
Role: {project_data["role"]}
Team size: {project_data["team_size"]}
Technologies: {techs}
Total commits: {project_data["total_commits"]}
Commit summary:
{project_data["commit_summary"]}

Provide the analysis in the following JSON format:
{{
  "key_tasks": ["task1", "task2", "task3"],
  "implementation_details": ["detail1", "detail2"],
  "achievements": ["achievement1", "achievement2"],
  "technical_decisions": ["decision1", "decision2"]
}}

Important:
- key_tasks: 3-5 main tasks/responsibilities
- implementation_details: Technical implementation highlights
- achievements: Quantifiable results or impacts
- technical_decisions: Important architectural/technical choices made

Respond ONLY with the JSON object, no additional text."""

    print(f'[Test 4] Prompt length: {len(prompt)} chars')

    svc = CLILLMService('claude_code', model='claude-sonnet-4-20250514')
    try:
        result, tokens = await svc.generate_with_cli(prompt)
        print(f'[Test 4] Result preview: {result[:500]}...' if len(result) > 500 else f'[Test 4] Result: {result}')
        print(f'[Test 4] Tokens: {tokens}')

        # Try to parse as JSON to verify format
        import json
        try:
            parsed = json.loads(result)
            print(f'[Test 4] JSON parsed successfully. Keys: {list(parsed.keys())}')
        except json.JSONDecodeError:
            print('[Test 4] Warning: Result is not valid JSON')

        print('[Test 4] PASSED')
        return True
    except Exception as e:
        print(f'[Test 4] Error: {type(e).__name__}: {e}')
        import traceback
        traceback.print_exc()
        print('[Test 4] FAILED')
        return False


async def main():
    print('='*60)
    print('CLI LLM Service Test Suite')
    print('Testing stdin-based prompt delivery')
    print('='*60)

    results = []

    # Run tests sequentially to avoid overwhelming the CLI
    results.append(await test_short_prompt())
    results.append(await test_long_prompt())
    results.append(await test_special_characters())
    results.append(await test_analysis_prompt())

    print('\n' + '='*60)
    print('TEST SUMMARY')
    print('='*60)

    passed = sum(results)
    total = len(results)

    print(f'Passed: {passed}/{total}')

    if passed == total:
        print('All tests PASSED!')
    else:
        print(f'FAILED tests: {total - passed}')
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
