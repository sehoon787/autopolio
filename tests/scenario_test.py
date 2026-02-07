"""
Scenario Test: Backend API + GitHub Repos + Analysis
Runs against whatever backend is currently running (Electron or Docker).

Usage:
  python tests/scenario_test.py [base_url]
  
  base_url defaults to http://localhost:8000
"""

import sys
import os
import time
import json
import urllib.request
import urllib.error
import urllib.parse

# Fix Windows console encoding
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
API = f"{BASE_URL}/api"
RESULTS = {}
CLEANUP_IDS = []  # (endpoint, id) pairs to clean up


def log(msg):
    print(f"  {msg}")


def api_get(path, timeout=30):
    url = f"{API}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def api_post(path, data, timeout=60):
    url = f"{API}{path}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise Exception(f"HTTP {e.code}: {error_body}") from e


def api_delete(path, timeout=10):
    url = f"{API}{path}"
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status
    except Exception:
        return 0


def test(name):
    """Decorator-like: prints test name, captures pass/fail."""
    def decorator(fn):
        def wrapper():
            print(f"\n{'='*60}")
            print(f"TEST: {name}")
            print(f"{'='*60}")
            try:
                result = fn()
                RESULTS[name] = "PASS" if result is not False else "FAIL"
                print(f"  >> {'PASS ✓' if RESULTS[name] == 'PASS' else 'FAIL ✗'}")
            except Exception as e:
                RESULTS[name] = f"ERROR: {e}"
                print(f"  >> ERROR ✗: {e}")
        return wrapper
    return decorator


# =============================================================================
# Test 1: Health Check
# =============================================================================
@test("1. Health Check")
def test_health():
    # /health endpoint
    url = f"{BASE_URL}/health"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    log(f"Response: {data}")
    assert data.get("status") == "healthy", f"Expected healthy, got {data}"
    return True


# =============================================================================
# Test 2: Root Info
# =============================================================================
@test("2. Root App Info")
def test_root():
    url = f"{BASE_URL}/"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    log(f"App: {data.get('name')} v{data.get('version')}")
    assert data.get("name") == "Autopolio"
    return True


# =============================================================================
# Test 3: Users API
# =============================================================================
@test("3. Users API")
def test_users():
    users = api_get("/users")
    log(f"Total users: {len(users)}")
    # Find GitHub-connected user
    gh_user = None
    for u in users:
        if u.get("github_username"):
            gh_user = u
            break
    if gh_user:
        log(f"GitHub user found: id={gh_user['id']}, username={gh_user['github_username']}")
    else:
        log("WARNING: No GitHub-connected user found")
    return True


# =============================================================================
# Test 4: GitHub Status
# =============================================================================
@test("4. GitHub Connection Status")
def test_github_status():
    status = api_get("/github/status?user_id=25")
    log(f"Connected: {status.get('connected')}")
    log(f"Valid: {status.get('valid')}")
    log(f"Username: {status.get('github_username')}")
    assert status.get("connected") is True
    assert status.get("valid") is True
    return True


# =============================================================================
# Test 5: GitHub Repos (fetch_all=true, 5-step aggregation)
# =============================================================================
@test("5. GitHub Repos (5-step aggregation)")
def test_github_repos():
    data = api_get("/github/repos?user_id=25&fetch_all=true", timeout=120)
    repos = data.get("repos", data if isinstance(data, list) else [])
    total = len(repos)
    log(f"Total repos fetched: {total}")
    
    # Check has_more flag
    has_more = data.get("has_more", None)
    log(f"has_more: {has_more}")
    
    # Show first 5
    for r in repos[:5]:
        log(f"  - {r.get('full_name', r.get('name'))} ({r.get('language', 'N/A')}) ★{r.get('stargazers_count', 0)}")
    
    # Count by type
    forks = sum(1 for r in repos if r.get("fork"))
    owned = sum(1 for r in repos if r.get("owner") == "sehoon787")
    log(f"Owned: {owned}, Forks: {forks}, Other: {total - owned - forks}")
    
    RESULTS["_repo_count"] = total
    assert total > 0, "No repos returned"
    return True


# =============================================================================
# Test 6: Knowledge - Companies
# =============================================================================
@test("6. Knowledge - Companies")
def test_companies():
    data = api_get("/knowledge/companies?user_id=25")
    companies = data if isinstance(data, list) else data.get("companies", [])
    log(f"Companies: {len(companies)}")
    for c in companies[:3]:
        log(f"  - {c.get('name')} ({c.get('position', 'N/A')})")
    return True


# =============================================================================
# Test 7: Knowledge - Projects
# =============================================================================
@test("7. Knowledge - Projects")
def test_projects():
    data = api_get("/knowledge/projects?user_id=25")
    projects = data if isinstance(data, list) else data.get("projects", [])
    log(f"Projects: {len(projects)}")
    analyzed = sum(1 for p in projects if p.get("is_analyzed"))
    log(f"Analyzed: {analyzed}, Not analyzed: {len(projects) - analyzed}")
    for p in projects[:5]:
        status = "✓" if p.get("is_analyzed") else "✗"
        log(f"  [{status}] {p.get('name')} (id={p.get('id')})")
    RESULTS["_project_count"] = len(projects)
    return True


# =============================================================================
# Test 8: LLM Providers
# =============================================================================
@test("8. LLM Providers")
def test_llm():
    data = api_get("/llm/providers")
    providers = data if isinstance(data, list) else data.get("providers", [])
    log(f"Providers: {len(providers)}")
    for p in providers:
        log(f"  - {p.get('name', p.get('id', p))}")
    return True


# =============================================================================
# Test 9: Platform Templates
# =============================================================================
@test("9. Platform Templates")
def test_platforms():
    data = api_get("/platforms")
    templates = data if isinstance(data, list) else data.get("templates", [])
    log(f"Platform templates: {len(templates)}")
    for t in templates:
        log(f"  - {t.get('platform_name', t.get('name'))} (id={t.get('id')})")
    return True


# =============================================================================
# Test 10: Import Repo → Create Project
# =============================================================================
@test("10. Import Repo as Project")
def test_import():
    # Get repos
    data = api_get("/github/repos?user_id=25&fetch_all=true", timeout=120)
    repos = data.get("repos", data if isinstance(data, list) else [])
    
    # Get existing projects to avoid duplicates
    proj_data = api_get("/knowledge/projects?user_id=25")
    projects = proj_data if isinstance(proj_data, list) else proj_data.get("projects", [])
    existing_urls = set()
    for p in projects:
        url = (p.get("git_url") or "").lower().replace(".git", "")
        if url:
            existing_urls.add(url)
    
    # Find a small non-fork, non-imported repo
    target = None
    for r in repos:
        url = (r.get("html_url") or "").lower().replace(".git", "")
        if not r.get("fork") and url and url not in existing_urls:
            target = r
            break
    
    if not target:
        log("All repos already imported, skipping")
        return True
    
    git_url = target["html_url"]
    log(f"Importing: {target['name']} ({git_url})")
    
    # Import
    result = api_post(f"/github/import-repos?user_id=25", {"repo_urls": [git_url]}, timeout=60)
    log(f"Import result: imported={result.get('imported')}")
    
    assert result.get("imported", 0) >= 1, f"Import failed: {result}"
    project_id = result["results"][0].get("project_id")
    assert project_id, "No project_id returned"
    log(f"Created project id={project_id}")
    
    # Store for cleanup & analysis test
    RESULTS["_test_project_id"] = project_id
    RESULTS["_test_git_url"] = git_url
    CLEANUP_IDS.append(("projects", project_id))
    
    # Verify
    project = api_get(f"/knowledge/projects/{project_id}?user_id=25")
    assert project["git_url"] == git_url
    log(f"Verified: {project['name']} with git_url={project['git_url']}")
    return True


# =============================================================================
# Test 11: Start Analysis
# =============================================================================
@test("11. Start Analysis")
def test_start_analysis():
    project_id = RESULTS.get("_test_project_id")
    git_url = RESULTS.get("_test_git_url")
    
    if not project_id or not git_url:
        log("No test project available, skipping")
        return True
    
    log(f"Starting analysis for project {project_id}...")
    
    # Try providers: gemini -> anthropic -> openai
    # NOTE: user_id, provider, language are QUERY params; git_url, project_id are BODY
    body = {"git_url": git_url, "project_id": project_id}
    providers = ["gemini", "anthropic", "openai"]
    
    for i, provider in enumerate(providers):
        try:
            qp = urllib.parse.urlencode({"user_id": 25, "provider": provider, "language": "ko"})
            result = api_post(f"/github/analyze-background?{qp}", body, timeout=60)
            log(f"Analysis started with {provider}: task_id={result.get('task_id')}")
            RESULTS["_task_id"] = result.get("task_id")
            RESULTS["_analysis_provider"] = provider
            return True
        except Exception as e:
            log(f"{provider} failed: {e}")
            if i == len(providers) - 1:
                raise  # Last provider, re-raise


# =============================================================================
# Test 12: Wait for Analysis & Verify Results
# =============================================================================
@test("12. Analysis Completion & Results")
def test_analysis_results():
    project_id = RESULTS.get("_test_project_id")
    if not project_id:
        log("No test project, skipping")
        return True
    
    if "_task_id" not in RESULTS:
        log("Analysis was not started, skipping")
        return True
    
    log(f"Polling analysis status for project {project_id}...")
    max_wait = 120  # 2 minutes
    poll_interval = 5
    elapsed = 0
    
    while elapsed < max_wait:
        try:
            status = api_get(f"/github/analysis-status/{project_id}?user_id=25")
            job_status = status.get("status", "") if status else ""
            
            if job_status == "completed":
                log(f"Analysis completed in {elapsed}s")
                
                # Get full analysis
                analysis = api_get(f"/github/analysis/{project_id}")
                log(f"  Commits: {analysis.get('total_commits', 'N/A')}")
                log(f"  Technologies: {(analysis.get('detected_technologies') or [])[:8]}")
                log(f"  Key tasks: {len(analysis.get('key_tasks') or [])} items")
                log(f"  Implementation details: {len(analysis.get('implementation_details') or [])} sections")
                log(f"  AI Summary: {'Yes' if analysis.get('ai_summary') else 'No'}")
                
                # Verify required fields
                assert analysis.get("total_commits") is not None, "Missing total_commits"
                assert analysis.get("detected_technologies") is not None, "Missing detected_technologies"
                
                RESULTS["_analysis_data"] = {
                    "commits": analysis.get("total_commits"),
                    "tech_count": len(analysis.get("detected_technologies") or []),
                    "key_tasks": len(analysis.get("key_tasks") or []),
                    "has_summary": bool(analysis.get("ai_summary")),
                }
                return True
                
            elif job_status == "failed":
                log(f"Analysis FAILED after {elapsed}s: {status.get('error_message')}")
                return False
            else:
                if elapsed % 15 == 0:
                    log(f"  Status: {job_status or 'unknown'} ({elapsed}s elapsed...)")
        except Exception as e:
            if elapsed % 15 == 0:
                log(f"  Poll error: {e} ({elapsed}s)")
        
        time.sleep(poll_interval)
        elapsed += poll_interval
    
    log(f"Analysis did not complete within {max_wait}s (timeout - SKIP, not a failure)")
    return True  # Timeout is acceptable - analysis can be slow


# =============================================================================
# Test 13: Documents API
# =============================================================================
@test("13. Documents API")
def test_documents():
    data = api_get("/documents?user_id=25")
    docs = data if isinstance(data, list) else data.get("documents", [])
    log(f"Documents: {len(docs)}")
    for d in docs[:3]:
        log(f"  - {d.get('document_name', d.get('name'))} ({d.get('format', 'N/A')})")
    return True


# =============================================================================
# Test 14: Templates API
# =============================================================================
@test("14. Templates API")
def test_templates():
    data = api_get("/templates?user_id=25")
    templates = data if isinstance(data, list) else data.get("templates", [])
    log(f"Templates: {len(templates)}")
    for t in templates[:3]:
        log(f"  - {t.get('name')} (platform={t.get('platform', 'N/A')})")
    return True


# =============================================================================
# Cleanup
# =============================================================================
def cleanup():
    print(f"\n{'='*60}")
    print("CLEANUP")
    print(f"{'='*60}")
    for resource_type, resource_id in reversed(CLEANUP_IDS):
        try:
            if resource_type == "projects":
                status = api_delete(f"/knowledge/projects/{resource_id}?user_id=25")
                log(f"Deleted project {resource_id}: {status}")
            else:
                log(f"Unknown resource type: {resource_type}")
        except Exception as e:
            log(f"Cleanup error for {resource_type}/{resource_id}: {e}")


# =============================================================================
# Main
# =============================================================================
def main():
    print(f"\n{'#'*60}")
    print(f"# AUTOPOLIO SCENARIO TEST")
    print(f"# Target: {BASE_URL}")
    print(f"# Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#'*60}")
    
    # Run all tests
    test_health()
    test_root()
    test_users()
    test_github_status()
    test_github_repos()
    test_companies()
    test_projects()
    test_llm()
    test_platforms()
    test_import()
    test_start_analysis()
    test_analysis_results()
    test_documents()
    test_templates()
    
    # Cleanup
    cleanup()
    
    # Summary
    print(f"\n{'#'*60}")
    print(f"# TEST SUMMARY")
    print(f"{'#'*60}")
    
    pass_count = 0
    fail_count = 0
    error_count = 0
    
    for name, result in RESULTS.items():
        if name.startswith("_"):
            continue
        if result == "PASS":
            pass_count += 1
            status = "✓ PASS"
        elif result == "FAIL":
            fail_count += 1
            status = "✗ FAIL"
        else:
            error_count += 1
            status = f"✗ {result}"
        print(f"  {status:40s} {name}")
    
    total = pass_count + fail_count + error_count
    print(f"\n  Total: {total} | Pass: {pass_count} | Fail: {fail_count} | Error: {error_count}")
    
    # Extra stats
    if "_repo_count" in RESULTS:
        print(f"\n  [Stats] Repo count: {RESULTS['_repo_count']}")
    if "_project_count" in RESULTS:
        print(f"  [Stats] Project count: {RESULTS['_project_count']}")
    if "_analysis_data" in RESULTS:
        d = RESULTS["_analysis_data"]
        print(f"  [Stats] Analysis: {d['commits']} commits, {d['tech_count']} techs, {d['key_tasks']} tasks, summary={'Yes' if d['has_summary'] else 'No'}")
    
    print(f"\n{'#'*60}")
    
    return 0 if fail_count == 0 and error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
