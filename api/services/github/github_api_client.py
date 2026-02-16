"""
GitHub API Client - Low-level GitHub API interactions.

Extracted from github_service.py for better modularity.
Contains base API request methods and authentication.
"""
import asyncio
import base64
import logging
from typing import Dict, List, Any, Optional
import httpx
import re

from .github_exceptions import (
    GitHubServiceError,
    GitHubRateLimitError,
    GitHubNotFoundError,
    GitHubTimeoutError,
    GitHubAuthError,
)
from .github_constants import (
    MAX_CONCURRENT_FILE_CHECKS,
    MAX_CONCURRENT_COMMIT_DETAILS,
    parse_iso_datetime,
)

logger = logging.getLogger(__name__)


class GitHubApiClient:
    """Low-level client for GitHub API interactions."""

    DEFAULT_TIMEOUT = 30.0

    def __init__(self, access_token: str, timeout: float = None):
        self.access_token = access_token
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        self.timeout = timeout or self.DEFAULT_TIMEOUT
        # Cache for language info within session
        self._languages_cache: Dict[str, Dict[str, float]] = {}
        # Shared httpx client for connection pooling
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create a shared httpx client for connection pooling."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return self._client

    async def close(self):
        """Close the shared httpx client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make an authenticated request to GitHub API with proper error handling."""
        try:
            client = await self._get_client()
            response = await client.request(
                method,
                f"{self.base_url}{endpoint}",
                headers=self.headers,
                **kwargs
            )
            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException as e:
            raise GitHubTimeoutError() from e
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise GitHubAuthError() from e
            elif e.response.status_code == 403:
                if "rate limit" in e.response.text.lower():
                    raise GitHubRateLimitError() from e
                raise GitHubServiceError(
                    f"GitHub API 접근 거부: {e.response.text[:100]}",
                    status_code=403
                ) from e
            elif e.response.status_code == 404:
                raise GitHubNotFoundError() from e
            else:
                raise GitHubServiceError(
                    f"GitHub API 오류 (HTTP {e.response.status_code})",
                    status_code=e.response.status_code
                ) from e
        except httpx.RequestError as e:
            raise GitHubServiceError(
                f"GitHub API 연결 오류: {str(e)}",
                status_code=502
            ) from e

    def _parse_repo_url(self, git_url: str) -> tuple[str, str]:
        """Parse owner and repo name from git URL."""
        patterns = [
            r"github\.com[/:]([^/]+)/([^/\.]+)",
            r"^([^/]+)/([^/]+)$"
        ]
        for pattern in patterns:
            match = re.search(pattern, git_url)
            if match:
                return match.group(1), match.group(2).replace(".git", "")
        raise ValueError(f"Invalid GitHub URL: {git_url}")

    # ==========================================================================
    # User & Repository Info
    # ==========================================================================

    async def get_user_info(self) -> Dict[str, Any]:
        """Get authenticated user's info."""
        return await self._request("GET", "/user")

    async def get_repo_info(self, git_url: str) -> Dict[str, Any]:
        """Get repository information."""
        owner, repo = self._parse_repo_url(git_url)
        return await self._request("GET", f"/repos/{owner}/{repo}")

    async def get_repo_languages(self, git_url: str) -> Dict[str, float]:
        """Get repository languages with percentages (cached within session)."""
        cache_key = git_url.lower()
        if cache_key in self._languages_cache:
            return self._languages_cache[cache_key]

        owner, repo = self._parse_repo_url(git_url)
        languages = await self._request("GET", f"/repos/{owner}/{repo}/languages")

        total = sum(languages.values())
        if total == 0:
            self._languages_cache[cache_key] = {}
            return {}

        result = {
            lang: round(bytes_count / total * 100, 2)
            for lang, bytes_count in languages.items()
        }
        self._languages_cache[cache_key] = result
        return result

    # ==========================================================================
    # Repository Listing
    # ==========================================================================

    async def get_user_repos(
        self,
        page: int = 1,
        per_page: int = 100,
        sort: str = "updated"
    ) -> List[Dict[str, Any]]:
        """Get user's repositories (single page)."""
        repos = await self._request(
            "GET",
            f"/user/repos?page={page}&per_page={per_page}&sort={sort}"
            f"&affiliation=owner,collaborator,organization_member&visibility=all"
        )
        return self._format_repos(repos)

    async def _fetch_paginated(
        self,
        endpoint_template: str,
        per_page: int = 100,
        max_pages: int = 10,
        extract_items: bool = False,
    ) -> List[Dict[str, Any]]:
        """Fetch paginated results from a GitHub API endpoint.

        Args:
            endpoint_template: URL with {page} and {per_page} placeholders.
            per_page: Items per page.
            max_pages: Maximum pages to fetch.
            extract_items: If True, extract .items from search API response.
        """
        results = []
        for page in range(1, max_pages + 1):
            try:
                endpoint = endpoint_template.format(page=page, per_page=per_page)
                data = await self._request("GET", endpoint)
                items = data.get("items", []) if extract_items else data
                if not items:
                    break
                results.extend(items)
                if len(items) < per_page:
                    break
            except Exception:
                break
        return results

    async def _fetch_org_repos(
        self,
        org_logins: List[str],
        sort: str = "updated",
        per_page: int = 100,
        max_pages: int = 10,
        type_param: str = "",
    ) -> List[Dict[str, Any]]:
        """Fetch repos from multiple orgs in parallel."""
        if not org_logins:
            return []

        type_suffix = f"&type={type_param}" if type_param else ""

        async def fetch_one_org(org_login: str) -> List[Dict[str, Any]]:
            return await self._fetch_paginated(
                f"/orgs/{org_login}/repos?page={{page}}&per_page={{per_page}}&sort={sort}{type_suffix}",
                per_page=per_page,
                max_pages=max_pages,
            )

        org_results = await asyncio.gather(
            *[fetch_one_org(login) for login in org_logins],
            return_exceptions=True,
        )
        repos = []
        for result in org_results:
            if isinstance(result, list):
                repos.extend(result)
        return repos

    async def get_all_user_repos(
        self,
        sort: str = "updated",
        max_pages: int = 10
    ) -> List[Dict[str, Any]]:
        """Get all user's repositories using parallel fetching.

        Runs 5 endpoint groups in parallel for ~3-5x speedup:
        1. /user/repos (owner + collaborator + org member)
        2. /users/{username}/repos (public profile)
        3. /user/orgs → /orgs/{org}/repos (org repos)
        4. /search/repositories?q=user:{username} (search fallback)
        5. /user/memberships/orgs → /orgs/{org}/repos (membership-based)
        """
        import time
        start = time.time()
        per_page = 100

        # Step 0: Get user info + org lists in parallel (needed by other steps)
        user_info_task = self._request("GET", "/user")
        orgs_task = self._request("GET", "/user/orgs")
        memberships_task = self._request("GET", "/user/memberships/orgs")

        # Fetch user info and org lists concurrently
        results = await asyncio.gather(
            user_info_task, orgs_task, memberships_task,
            return_exceptions=True,
        )

        user_info = results[0] if not isinstance(results[0], Exception) else {}
        orgs = results[1] if not isinstance(results[1], Exception) else []
        memberships = results[2] if not isinstance(results[2], Exception) else []

        username = user_info.get("login", "") if isinstance(user_info, dict) else ""
        logger.info(f"[GitHub] User: {username}")

        # Extract org logins
        org_logins = [o.get("login") for o in orgs if o.get("login")] if isinstance(orgs, list) else []
        membership_logins = [
            m.get("organization", {}).get("login")
            for m in memberships
            if isinstance(m, dict) and m.get("organization", {}).get("login")
        ] if isinstance(memberships, list) else []
        # Deduplicate org logins (step 5 may overlap with step 3)
        all_org_logins = list(dict.fromkeys(org_logins + membership_logins))

        # Steps 1-4 + org repos: run ALL in parallel
        step1 = self._fetch_paginated(
            "/user/repos?page={page}&per_page={per_page}&sort=" + sort
            + "&affiliation=owner,collaborator,organization_member&visibility=all",
            per_page=per_page, max_pages=max_pages,
        )
        async def _empty() -> List[Dict[str, Any]]:
            return []

        step2 = self._fetch_paginated(
            f"/users/{username}/repos?page={{page}}&per_page={{per_page}}&sort={sort}&type=all",
            per_page=per_page, max_pages=max_pages,
        ) if username else _empty()
        step3_5 = self._fetch_org_repos(
            all_org_logins, sort=sort, per_page=per_page, max_pages=max_pages, type_param="all",
        )
        step4 = self._fetch_paginated(
            f"/search/repositories?q=user:{username}&per_page={{per_page}}&page={{page}}",
            per_page=per_page, max_pages=4, extract_items=True,
        ) if username else _empty()

        step_results = await asyncio.gather(
            step1, step2, step3_5, step4,
            return_exceptions=True,
        )

        # Merge and deduplicate
        seen_ids = set()
        all_repos = []
        for result in step_results:
            if isinstance(result, Exception):
                logger.warning(f"[GitHub] Repo fetch step failed: {result}")
                continue
            for repo in result:
                repo_id = repo.get("id")
                if repo_id and repo_id not in seen_ids:
                    seen_ids.add(repo_id)
                    all_repos.append(repo)

        elapsed = time.time() - start
        logger.info(f"[GitHub] Total repos fetched: {len(all_repos)} in {elapsed:.1f}s")

        try:
            await self.close()
        except Exception:
            pass

        return self._format_repos(all_repos)

    def _format_repos(self, repos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Format repository data."""
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "full_name": r["full_name"],
                "description": r["description"],
                "html_url": r["html_url"],
                "clone_url": r["clone_url"],
                "language": r["language"],
                "stargazers_count": r["stargazers_count"],
                "forks_count": r["forks_count"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "pushed_at": r["pushed_at"],
                "fork": r.get("fork", False),
                "owner": r.get("owner", {}).get("login", "") if isinstance(r.get("owner"), dict) else ""
            }
            for r in repos
        ]

    # ==========================================================================
    # Commits
    # ==========================================================================

    async def get_commits(
        self,
        git_url: str,
        author: Optional[str] = None,
        per_page: int = 100,
        max_pages: int = 5
    ) -> List[Dict[str, Any]]:
        """Get repository commits."""
        owner, repo = self._parse_repo_url(git_url)
        all_commits = []

        for page in range(1, max_pages + 1):
            endpoint = f"/repos/{owner}/{repo}/commits?per_page={per_page}&page={page}"
            if author:
                endpoint += f"&author={author}"

            try:
                commits = await self._request("GET", endpoint)
                if not commits:
                    break
                all_commits.extend(commits)
            except httpx.HTTPStatusError:
                break

        return all_commits

    async def get_commit_details(
        self,
        git_url: str,
        sha: str,
        include_patch: bool = False
    ) -> Dict[str, Any]:
        """Get detailed information for a specific commit."""
        owner, repo = self._parse_repo_url(git_url)
        try:
            commit = await self._request("GET", f"/repos/{owner}/{repo}/commits/{sha}")
            files_data = []
            for f in commit.get("files", [])[:20]:
                file_info = {
                    "filename": f["filename"],
                    "additions": f.get("additions", 0),
                    "deletions": f.get("deletions", 0),
                    "status": f.get("status", "modified")
                }
                if include_patch and "patch" in f:
                    patch = f["patch"]
                    if len(patch) <= 2000:
                        file_info["patch"] = patch
                    else:
                        file_info["patch"] = patch[:2000] + "\n... (truncated)"
                files_data.append(file_info)

            return {
                "sha": commit["sha"],
                "message": commit["commit"]["message"],
                "author": commit["commit"]["author"]["name"],
                "date": commit["commit"]["author"]["date"],
                "additions": commit.get("stats", {}).get("additions", 0),
                "deletions": commit.get("stats", {}).get("deletions", 0),
                "files_changed": len(commit.get("files", [])),
                "files": files_data
            }
        except httpx.HTTPStatusError:
            return {"sha": sha, "additions": 0, "deletions": 0, "files_changed": 0}

    async def _get_commit_details_safe(
        self,
        semaphore: asyncio.Semaphore,
        git_url: str,
        sha: str
    ) -> Dict[str, Any]:
        """Get commit details with semaphore for rate limiting."""
        async with semaphore:
            try:
                return await self.get_commit_details(git_url, sha)
            except Exception:
                return {"sha": sha, "additions": 0, "deletions": 0, "files": []}

    async def _get_commit_details_with_patch(
        self,
        semaphore: asyncio.Semaphore,
        git_url: str,
        sha: str
    ) -> Dict[str, Any]:
        """Get commit details with patch, with semaphore for rate limiting."""
        async with semaphore:
            try:
                return await self.get_commit_details(git_url, sha, include_patch=True)
            except Exception as e:
                logger.warning(f"Failed to get commit details for {sha}: {e}")
                return {"sha": sha, "additions": 0, "deletions": 0, "files": []}

    # ==========================================================================
    # Contributors
    # ==========================================================================

    async def get_contributors_count(self, git_url: str) -> int:
        """Get the number of contributors for a repository."""
        owner, repo = self._parse_repo_url(git_url)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(
                    "GET",
                    f"{self.base_url}/repos/{owner}/{repo}/contributors?per_page=1&anon=true",
                    headers=self.headers,
                )
                response.raise_for_status()

                link_header = response.headers.get("Link", "")
                if 'rel="last"' in link_header:
                    match = re.search(r'page=(\d+)>; rel="last"', link_header)
                    if match:
                        return int(match.group(1))

                contributors = response.json()
                return len(contributors)
        except httpx.HTTPStatusError:
            return 1

    async def get_all_contributors(self, git_url: str) -> List[Dict[str, Any]]:
        """Get all contributors for a repository."""
        owner, repo = self._parse_repo_url(git_url)
        try:
            contributors = await self._request(
                "GET",
                f"/repos/{owner}/{repo}/contributors?per_page=100"
            )
            return [
                {
                    "username": c.get("login", ""),
                    "avatar_url": c.get("avatar_url", ""),
                    "contributions": c.get("contributions", 0),
                    "html_url": c.get("html_url", ""),
                }
                for c in contributors
            ]
        except Exception as e:
            logger.warning("Failed to fetch contributors: %s", e)
            return []

    # ==========================================================================
    # File Operations
    # ==========================================================================

    async def get_file_tree(
        self,
        git_url: str,
        path: str = "",
        ref: Optional[str] = None,
        recursive: bool = False
    ) -> List[Dict[str, Any]]:
        """Get file tree for a repository or specific directory."""
        owner, repo = self._parse_repo_url(git_url)

        if recursive:
            if not ref:
                repo_info = await self.get_repo_info(git_url)
                ref = repo_info.get("default_branch", "main")

            try:
                tree = await self._request(
                    "GET",
                    f"/repos/{owner}/{repo}/git/trees/{ref}?recursive=1"
                )

                items = []
                for item in tree.get("tree", []):
                    if path and not item["path"].startswith(path):
                        continue
                    if path and item["path"] == path:
                        continue

                    items.append({
                        "type": "directory" if item["type"] == "tree" else "file",
                        "name": item["path"].split("/")[-1],
                        "path": item["path"],
                        "size": item.get("size", 0),
                        "sha": item.get("sha", ""),
                    })

                return items
            except httpx.HTTPStatusError:
                pass

        endpoint = f"/repos/{owner}/{repo}/contents/{path}"
        if ref:
            endpoint += f"?ref={ref}"

        try:
            contents = await self._request("GET", endpoint)
            if isinstance(contents, dict):
                contents = [contents]

            return [
                {
                    "type": "directory" if item["type"] == "dir" else "file",
                    "name": item["name"],
                    "path": item["path"],
                    "size": item.get("size", 0),
                    "sha": item.get("sha", ""),
                    "download_url": item.get("download_url"),
                }
                for item in contents
            ]
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return []
            raise

    async def get_file_content(
        self,
        git_url: str,
        file_path: str,
        ref: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get content of a specific file."""
        owner, repo = self._parse_repo_url(git_url)

        endpoint = f"/repos/{owner}/{repo}/contents/{file_path}"
        if ref:
            endpoint += f"?ref={ref}"

        file_data = await self._request("GET", endpoint)

        content = ""
        if file_data.get("encoding") == "base64" and file_data.get("content"):
            try:
                content = base64.b64decode(file_data["content"]).decode("utf-8")
            except UnicodeDecodeError:
                content = "[Binary file]"

        return {
            "name": file_data.get("name", ""),
            "path": file_data.get("path", ""),
            "size": file_data.get("size", 0),
            "sha": file_data.get("sha", ""),
            "content": content,
            "encoding": file_data.get("encoding", ""),
            "download_url": file_data.get("download_url"),
        }
