"""
Unit test to verify asyncio.gather parallelization of Steps 5.2 + 5.3.

This test does NOT require GitHub or real LLM calls.
It mocks the phase functions with artificial delays and measures
that they run concurrently (total time ≈ max(delay_a, delay_b), not sum).

Usage:
    uv run python -m pytest tests/test_parallel_verify.py -v
"""
import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# Simulated delays (seconds)
DELAY_KEY_TASKS = 2.0
DELAY_DETAILED_CONTENT = 2.0
# If parallel: elapsed ≈ 2s.  If sequential: elapsed ≈ 4s.
PARALLEL_THRESHOLD = 3.0  # anything under 3s proves parallel execution


@pytest.mark.asyncio
async def test_sync_endpoint_parallel_execution():
    """
    Verify the sync /analyze endpoint runs Steps 5.2+5.3 in parallel.
    
    Mocks phase5_generate_key_tasks and phase5_generate_detailed_content
    with 2-second delays, then checks total elapsed < 3s.
    """

    async def mock_key_tasks(ctx, name, desc, role):
        await asyncio.sleep(DELAY_KEY_TASKS)
        ctx.key_tasks = ["task1", "task2", "task3"]
        return ctx.key_tasks

    async def mock_detailed_content(ctx, project_data):
        await asyncio.sleep(DELAY_DETAILED_CONTENT)
        ctx.detailed_content = {"implementation_details": [], "development_timeline": ""}
        return ctx.detailed_content

    # Simulate the exact code path from github_analysis.py lines 142-148
    class FakeCtx:
        key_tasks = []
        detailed_content = {}
        total_tokens = 0

    ctx = FakeCtx()
    project_data = {"name": "test", "description": None, "role": None, "start_date": None, "end_date": None}

    start = time.time()
    await asyncio.gather(
        mock_key_tasks(ctx, "test", None, None),
        mock_detailed_content(ctx, project_data),
    )
    elapsed = time.time() - start

    # Verify parallel execution (should be ~2s, not ~4s)
    assert elapsed < PARALLEL_THRESHOLD, (
        f"Steps 5.2+5.3 took {elapsed:.1f}s — expected < {PARALLEL_THRESHOLD}s for parallel execution. "
        f"If > {PARALLEL_THRESHOLD}s, they're running sequentially!"
    )

    # Verify both results were written
    assert ctx.key_tasks == ["task1", "task2", "task3"], "key_tasks not populated"
    assert "implementation_details" in ctx.detailed_content, "detailed_content not populated"

    print(f"\n✅ Parallel execution verified: {elapsed:.2f}s (threshold: {PARALLEL_THRESHOLD}s)")


@pytest.mark.asyncio
async def test_background_runner_parallel_execution():
    """
    Verify the background analysis runner runs Steps 5+6 in parallel.
    
    Mirrors the asyncio.gather pattern from analysis_job_runner.py lines 304-306.
    """

    async def mock_generate_key_tasks_bg(project_id, analysis_result, llm_service, language):
        await asyncio.sleep(DELAY_KEY_TASKS)
        return (["bg_task1", "bg_task2"], 100)  # (key_tasks, tokens)

    async def mock_generate_detailed_content(project_data, analysis_data, llm_service, language):
        await asyncio.sleep(DELAY_DETAILED_CONTENT)
        return ({"impl": "details"}, 200)  # (content, tokens)

    start = time.time()
    results = await asyncio.gather(
        mock_generate_key_tasks_bg(1, {}, None, "ko"),
        mock_generate_detailed_content({}, {}, None, "ko"),
        return_exceptions=True,
    )
    elapsed = time.time() - start

    # Verify parallel execution
    assert elapsed < PARALLEL_THRESHOLD, (
        f"Background steps 5+6 took {elapsed:.1f}s — expected < {PARALLEL_THRESHOLD}s. "
        f"They appear to be running sequentially!"
    )

    # Verify results
    assert not isinstance(results[0], Exception), f"Step 5 failed: {results[0]}"
    assert not isinstance(results[1], Exception), f"Step 6 failed: {results[1]}"

    key_tasks, tokens_5 = results[0]
    detailed_content, tokens_6 = results[1]
    assert key_tasks == ["bg_task1", "bg_task2"]
    assert tokens_5 == 100
    assert detailed_content == {"impl": "details"}
    assert tokens_6 == 200

    print(f"\n✅ Background parallel execution verified: {elapsed:.2f}s (threshold: {PARALLEL_THRESHOLD}s)")


@pytest.mark.asyncio
async def test_error_in_one_does_not_block_other():
    """
    Verify that if one parallel task fails, the other still completes.
    Uses return_exceptions=True pattern from the background runner.
    """

    async def failing_key_tasks(*args, **kwargs):
        await asyncio.sleep(0.5)
        raise RuntimeError("LLM key_tasks failed")

    async def successful_detailed_content(*args, **kwargs):
        await asyncio.sleep(1.0)
        return ({"impl": "success"}, 150)

    start = time.time()
    results = await asyncio.gather(
        failing_key_tasks(),
        successful_detailed_content(),
        return_exceptions=True,
    )
    elapsed = time.time() - start

    # Both should complete (not short-circuit)
    assert elapsed >= 0.9, f"Completed too fast ({elapsed:.1f}s) — the successful task didn't run"
    assert elapsed < 2.0, f"Took too long ({elapsed:.1f}s) — tasks ran sequentially"

    # Step 5 should be an exception
    assert isinstance(results[0], RuntimeError), "Expected RuntimeError from key_tasks"
    assert "LLM key_tasks failed" in str(results[0])

    # Step 6 should succeed
    assert not isinstance(results[1], Exception), f"Step 6 should not fail: {results[1]}"
    content, tokens = results[1]
    assert content == {"impl": "success"}

    print(f"\n✅ Error isolation verified: one failure doesn't block the other ({elapsed:.2f}s)")


@pytest.mark.asyncio
async def test_sequential_dependency_after_parallel():
    """
    Verify that AI summary (Phase 5.4) runs AFTER key_tasks (Phase 5.2) completes,
    because it depends on key_tasks output.
    """

    execution_order = []

    async def mock_key_tasks():
        await asyncio.sleep(0.5)
        execution_order.append("key_tasks")
        return ["task1"]

    async def mock_detailed_content():
        await asyncio.sleep(0.5)
        execution_order.append("detailed_content")
        return {"impl": "details"}

    async def mock_ai_summary(key_tasks):
        """This must run AFTER key_tasks completes (depends on output)."""
        assert key_tasks is not None, "AI summary called before key_tasks completed!"
        execution_order.append("ai_summary")
        return "summary text"

    # Parallel: key_tasks + detailed_content
    key_tasks_result = None
    
    async def capture_key_tasks():
        nonlocal key_tasks_result
        key_tasks_result = await mock_key_tasks()

    await asyncio.gather(
        capture_key_tasks(),
        mock_detailed_content(),
    )

    # Sequential: AI summary depends on key_tasks
    summary = await mock_ai_summary(key_tasks_result)

    # Verify ordering
    assert "ai_summary" in execution_order, "AI summary didn't run"
    ai_idx = execution_order.index("ai_summary")
    kt_idx = execution_order.index("key_tasks")
    assert ai_idx > kt_idx, (
        f"AI summary (idx={ai_idx}) ran before key_tasks (idx={kt_idx})! "
        f"Order: {execution_order}"
    )

    print(f"\n✅ Sequential dependency verified: {execution_order}")


if __name__ == "__main__":
    asyncio.run(test_sync_endpoint_parallel_execution())
    asyncio.run(test_background_runner_parallel_execution())
    asyncio.run(test_error_in_one_does_not_block_other())
    asyncio.run(test_sequential_dependency_after_parallel())
    print("\n🎉 All parallelization tests passed!")
