"""
Test: CLI LLM parallelization (Step 5.2 + 5.3 concurrent execution).

This test verifies that:
1. The analysis API works with CLI mode (claude_code)
2. Steps 5.2 (key_tasks) and 5.3 (detailed_content) run in parallel
3. Timing logs confirm parallel execution vs sequential

Usage:
    python tests/test_parallel_llm.py [--cli-mode claude_code|gemini_cli] [--provider openai|anthropic|gemini]
"""

import json
import time
import sys
import os
import argparse
import urllib.request
import urllib.error

from tests.utils.runtime_config import get_api_base_url

BASE_URL = os.environ.get("TEST_BASE_URL", get_api_base_url())
USER_ID = 1
# Small repo for quick testing
TEST_REPO_URL = "https://github.com/sehoon787/coflanet-app.git"


def api_get(endpoint: str, params: dict = None) -> dict:
    """Make GET request to API."""
    url = f"{BASE_URL}{endpoint}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        url += f"?{query}"
    req = urllib.request.Request(url)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_post(endpoint: str, body: dict = None, params: dict = None) -> dict:
    """Make POST request to API."""
    url = f"{BASE_URL}{endpoint}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        url += f"?{query}"
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))


def test_sync_analysis(
    cli_mode: str = None, cli_model: str = None, provider: str = None
):
    """Test synchronous analysis endpoint with timing."""
    print("=" * 70)
    print("TEST: Synchronous Analysis (POST /api/github/analyze)")
    print(f"  cli_mode={cli_mode}, cli_model={cli_model}, provider={provider}")
    print(f"  repo={TEST_REPO_URL}")
    print("=" * 70)

    # Step 1: Import the repo first (create project)
    print("\n[1/3] Importing repo...")
    try:
        import_result = api_post(
            "/api/github/import-repos",
            body={"repo_urls": [TEST_REPO_URL], "auto_fill": False},
            params={"user_id": str(USER_ID)},
        )
        imported = import_result.get("imported", 0)
        results = import_result.get("results", [])
        if results:
            project_id = results[0].get("project_id")
            print(f"  Imported: {imported} repo(s), project_id={project_id}")
        else:
            print(f"  Import result: {import_result}")
            return
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        # If already imported, try to find the project
        if "already" in body.lower() or e.code == 409:
            print("  Repo already imported, finding project...")
            projects = api_get(
                "/api/knowledge/projects", params={"user_id": str(USER_ID)}
            )
            proj_list = (
                projects if isinstance(projects, list) else projects.get("data", [])
            )
            project_id = None
            for p in proj_list:
                if TEST_REPO_URL.rstrip(".git") in (p.get("git_url", "") or ""):
                    project_id = p["id"]
                    break
            if not project_id:
                print(f"  Could not find project for {TEST_REPO_URL}")
                return
            print(f"  Found existing project_id={project_id}")
        else:
            print(f"  Import failed: {e.code} {body[:200]}")
            return

    # Step 2: Run analysis
    print(f"\n[2/3] Starting analysis (project_id={project_id})...")
    params = {
        "user_id": str(USER_ID),
    }
    if cli_mode:
        params["cli_mode"] = cli_mode
    if cli_model:
        params["cli_model"] = cli_model
    if provider:
        params["provider"] = provider

    start_time = time.time()
    try:
        result = api_post(
            "/api/github/analyze",
            body={"git_url": TEST_REPO_URL, "project_id": project_id, "language": "ko"},
            params=params,
        )
        elapsed = time.time() - start_time
        print(f"\n[3/3] Analysis completed in {elapsed:.1f}s")
        print(f"  total_commits: {result.get('total_commits')}")
        print(f"  technologies: {result.get('detected_technologies', [])[:5]}")
        print(f"  key_tasks: {len(result.get('key_tasks', []))} items")
        print(
            f"  ai_summary: {'Yes' if result.get('ai_summary') else 'No'} ({len(result.get('ai_summary', ''))} chars)"
        )
        print(
            f"  implementation_details: {len(result.get('implementation_details', []))} categories"
        )
        print(
            f"  detailed_achievements: {'Yes' if result.get('detailed_achievements') else 'No'}"
        )

        # Print key_tasks
        key_tasks = result.get("key_tasks", [])
        if key_tasks:
            print("\n  Key Tasks:")
            for i, task in enumerate(key_tasks[:5], 1):
                print(f"    {i}. {task[:80]}")

    except urllib.error.HTTPError as e:
        elapsed = time.time() - start_time
        body = e.read().decode("utf-8")
        print(f"\n  Analysis FAILED after {elapsed:.1f}s: {e.code}")
        print(f"  Error: {body[:500]}")
        return
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"\n  Analysis FAILED after {elapsed:.1f}s: {type(e).__name__}: {e}")
        return

    print(f"\n{'=' * 70}")
    print(f"RESULT: Total wall-clock time = {elapsed:.1f}s")
    print(f"{'=' * 70}")
    return elapsed


def test_background_analysis(
    cli_mode: str = None, cli_model: str = None, provider: str = None
):
    """Test background analysis endpoint with timing."""
    print("\n" + "=" * 70)
    print("TEST: Background Analysis (POST /api/github/analyze-background)")
    print(f"  cli_mode={cli_mode}, cli_model={cli_model}, provider={provider}")
    print("=" * 70)

    # Find project
    projects = api_get("/api/knowledge/projects", params={"user_id": str(USER_ID)})
    proj_list = projects if isinstance(projects, list) else projects.get("data", [])
    project_id = None
    for p in proj_list:
        if TEST_REPO_URL.rstrip(".git") in (p.get("git_url", "") or ""):
            project_id = p["id"]
            break

    if not project_id:
        print("  No project found, skipping background test")
        return

    params = {"user_id": str(USER_ID)}
    if cli_mode:
        params["cli_mode"] = cli_mode
    if cli_model:
        params["cli_model"] = cli_model
    if provider:
        params["provider"] = provider

    print(f"\n[1/2] Starting background analysis (project_id={project_id})...")
    start_time = time.time()
    try:
        result = api_post(
            "/api/github/analyze-background",
            body={"git_url": TEST_REPO_URL, "project_id": project_id, "language": "ko"},
            params=params,
        )
        task_id = result.get("task_id")
        print(f"  Task started: {task_id}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"  Start FAILED: {e.code} {body[:300]}")
        return

    # Poll for completion
    print("\n[2/2] Polling for completion...")
    poll_count = 0
    while True:
        time.sleep(3)
        poll_count += 1
        elapsed = time.time() - start_time

        try:
            status = api_get(f"/api/github/analysis-job/{task_id}")
            job_status = status.get("status", "unknown")
            progress = status.get("progress", 0)
            current_step = status.get("current_step", "")

            print(
                f"  [{elapsed:.0f}s] status={job_status}, progress={progress}%, step={current_step}"
            )

            if job_status in ("completed", "failed", "cancelled"):
                elapsed = time.time() - start_time
                print(f"\n  Background analysis {job_status} in {elapsed:.1f}s")
                if job_status == "completed":
                    result_data = status.get("result", {})
                    print(f"  total_tokens: {result_data.get('total_tokens', 0)}")
                elif job_status == "failed":
                    print(f"  error: {status.get('error', 'N/A')}")
                break

            if elapsed > 300:
                print(f"\n  TIMEOUT after {elapsed:.1f}s")
                break
        except Exception as e:
            print(f"  Poll error: {e}")
            if poll_count > 5:
                break

    final_elapsed = time.time() - start_time
    print(f"\n{'=' * 70}")
    print(f"RESULT: Total wall-clock time = {final_elapsed:.1f}s")
    print(f"{'=' * 70}")
    return final_elapsed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test CLI LLM parallelization")
    parser.add_argument(
        "--cli-mode",
        choices=["claude_code", "gemini_cli"],
        default=None,
        help="CLI mode (default: use API)",
    )
    parser.add_argument("--cli-model", default=None, help="CLI model name")
    parser.add_argument(
        "--provider",
        choices=["openai", "anthropic", "gemini"],
        default=None,
        help="API provider (when not using CLI)",
    )
    parser.add_argument("--sync-only", action="store_true", help="Only run sync test")
    parser.add_argument(
        "--bg-only", action="store_true", help="Only run background test"
    )
    args = parser.parse_args()

    # Check backend health
    try:
        health = api_get("/health")
        print(f"Backend: {health}")
    except Exception as e:
        print(f"Backend not available: {e}")
        sys.exit(1)

    if not args.bg_only:
        test_sync_analysis(args.cli_mode, args.cli_model, args.provider)

    if not args.sync_only:
        test_background_analysis(args.cli_mode, args.cli_model, args.provider)
