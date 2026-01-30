"""
GitHub Service - Handles GitHub API interactions and repository analysis.

Performance Optimizations (v1.9):
- Parallel file existence checks using asyncio.gather (40+ files → 3-5 seconds)
- Parallel commit details fetching with semaphore (50 commits → 5-8 seconds)
- Language info caching within analysis session (avoid duplicate API calls)
- LLM calls parallelization in generate_detailed_content
"""
import asyncio
import base64
import logging
from typing import Dict, List, Any, Optional, Tuple
import httpx
import re
from datetime import datetime, timezone
from collections import Counter

from api.services.technology_detection_service import TechnologyDetectionService

logger = logging.getLogger(__name__)

# Concurrency limits for parallel operations
MAX_CONCURRENT_FILE_CHECKS = 15  # GitHub API parallel file checks
MAX_CONCURRENT_COMMIT_DETAILS = 10  # Commit details fetching
MAX_CONCURRENT_LLM_CALLS = 3  # LLM API calls

# Extended analysis limits
MAX_DETAILED_COMMITS = 50  # Maximum commits to store in detailed analysis

# Work area patterns for detecting what areas of codebase a contributor worked on
WORK_AREA_PATTERNS: Dict[str, List[str]] = {
    "frontend": [
        "src/components", "src/pages", "src/views", "frontend/", "client/",
        "web/", "app/", "*.tsx", "*.jsx", "*.vue", "*.svelte",
        "components/", "pages/", "views/", "layouts/", "hooks/", "stores/"
    ],
    "backend": [
        "api/", "server/", "backend/", "src/services", "services/",
        "controllers/", "routes/", "routers/", "handlers/",
        "*.py", "*.go", "*.java", "*.rs", "*.rb"
    ],
    "tests": [
        "tests/", "test/", "__tests__/", "spec/", "specs/",
        "*.test.*", "*.spec.*", "*_test.*", "*_spec.*",
        "testing/", "e2e/", "integration/"
    ],
    "devops": [
        "Dockerfile", "docker-compose", ".github/", "ci/", "cd/",
        ".gitlab-ci", "Jenkinsfile", "terraform/", "ansible/",
        "kubernetes/", "k8s/", "helm/", "scripts/", "deploy/"
    ],
    "docs": [
        "docs/", "documentation/", "*.md", "README", "CHANGELOG",
        "*.rst", "*.txt", "wiki/", "guides/"
    ],
    "database": [
        "migrations/", "models/", "*.sql", "schema/", "seeds/",
        "fixtures/", "db/", "database/", "prisma/", "drizzle/"
    ],
    "config": [
        "config/", ".env", "*.config.*", "*.conf", "settings/",
        "*.yaml", "*.yml", "*.json", "*.toml"
    ],
}

# Conventional commit type mappings
COMMIT_TYPES: Dict[str, str] = {
    "feat": "New Feature",
    "fix": "Bug Fix",
    "refactor": "Refactoring",
    "docs": "Documentation",
    "test": "Testing",
    "chore": "Maintenance",
    "perf": "Performance",
    "style": "Code Style",
    "ci": "CI/CD",
    "build": "Build System",
    "revert": "Revert",
}


def parse_iso_datetime(date_str: Optional[str]) -> Optional[datetime]:
    """Parse ISO 8601 datetime string to datetime object."""
    if not date_str:
        return None
    try:
        # Handle 'Z' suffix by replacing with '+00:00'
        if date_str.endswith('Z'):
            date_str = date_str[:-1] + '+00:00'
        return datetime.fromisoformat(date_str)
    except (ValueError, TypeError):
        return None


class GitHubServiceError(Exception):
    """Base exception for GitHub service errors."""
    def __init__(self, message: str, status_code: int = 500, original_error: Exception = None):
        self.message = message
        self.status_code = status_code
        self.original_error = original_error
        super().__init__(self.message)


class GitHubRateLimitError(GitHubServiceError):
    """Raised when GitHub API rate limit is exceeded."""
    def __init__(self, message: str = "GitHub API 요청 한도 초과. 잠시 후 다시 시도하세요."):
        super().__init__(message, status_code=429)


class GitHubNotFoundError(GitHubServiceError):
    """Raised when a GitHub resource is not found."""
    def __init__(self, message: str = "레포지토리를 찾을 수 없습니다."):
        super().__init__(message, status_code=404)


class GitHubTimeoutError(GitHubServiceError):
    """Raised when GitHub API request times out."""
    def __init__(self, message: str = "GitHub API 응답 시간 초과. 다시 시도해주세요."):
        super().__init__(message, status_code=504)


class GitHubAuthError(GitHubServiceError):
    """Raised when GitHub authentication fails."""
    def __init__(self, message: str = "GitHub 인증이 만료되었거나 유효하지 않습니다. 다시 연동해주세요."):
        super().__init__(message, status_code=401)


class GitHubService:
    """Service for GitHub API interactions."""

    # Default timeout for API requests (30 seconds)
    DEFAULT_TIMEOUT = 30.0

    def __init__(self, access_token: str, timeout: float = None):
        self.access_token = access_token
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        self.timeout = timeout or self.DEFAULT_TIMEOUT
        # Cache for language info within session (avoid duplicate API calls)
        self._languages_cache: Dict[str, Dict[str, float]] = {}

    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make an authenticated request to GitHub API with proper error handling."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
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
                # Check if it's a rate limit error
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

    async def get_user_info(self) -> Dict[str, Any]:
        """Get authenticated user's info."""
        return await self._request("GET", "/user")

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
        )
        return self._format_repos(repos)

    async def get_all_user_repos(
        self,
        sort: str = "updated",
        max_pages: int = 10
    ) -> List[Dict[str, Any]]:
        """Get all user's repositories (multiple pages)."""
        all_repos = []
        per_page = 100  # GitHub max per page

        for page in range(1, max_pages + 1):
            repos = await self._request(
                "GET",
                f"/user/repos?page={page}&per_page={per_page}&sort={sort}"
            )
            if not repos:
                break
            all_repos.extend(repos)
            if len(repos) < per_page:
                break

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
                "pushed_at": r["pushed_at"]
            }
            for r in repos
        ]

    def _parse_repo_url(self, git_url: str) -> tuple[str, str]:
        """Parse owner and repo name from git URL."""
        # Handle various URL formats
        patterns = [
            r"github\.com[/:]([^/]+)/([^/\.]+)",
            r"^([^/]+)/([^/]+)$"
        ]
        for pattern in patterns:
            match = re.search(pattern, git_url)
            if match:
                return match.group(1), match.group(2).replace(".git", "")
        raise ValueError(f"Invalid GitHub URL: {git_url}")

    async def get_repo_info(self, git_url: str) -> Dict[str, Any]:
        """Get repository information."""
        owner, repo = self._parse_repo_url(git_url)
        return await self._request("GET", f"/repos/{owner}/{repo}")

    async def get_repo_languages(self, git_url: str) -> Dict[str, float]:
        """Get repository languages with percentages (cached within session)."""
        # Check cache first to avoid duplicate API calls
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

    async def get_commit_details(self, git_url: str, sha: str) -> Dict[str, Any]:
        """Get detailed information for a specific commit including stats."""
        owner, repo = self._parse_repo_url(git_url)
        try:
            commit = await self._request("GET", f"/repos/{owner}/{repo}/commits/{sha}")
            return {
                "sha": commit["sha"],
                "message": commit["commit"]["message"],
                "author": commit["commit"]["author"]["name"],
                "date": commit["commit"]["author"]["date"],
                "additions": commit.get("stats", {}).get("additions", 0),
                "deletions": commit.get("stats", {}).get("deletions", 0),
                "files_changed": len(commit.get("files", [])),
                "files": [
                    {
                        "filename": f["filename"],
                        "additions": f.get("additions", 0),
                        "deletions": f.get("deletions", 0),
                        "status": f.get("status", "modified")
                    }
                    for f in commit.get("files", [])[:20]  # Limit files per commit
                ]
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

    async def get_repo_stats(
        self,
        git_url: str,
        username: Optional[str] = None,
        max_commits_for_stats: int = 100
    ) -> Dict[str, Any]:
        """Get comprehensive repository statistics including code changes.

        Performance: Uses parallel commit details fetching (50 commits in ~5-8 seconds).
        """
        owner, repo = self._parse_repo_url(git_url)

        # Get commits
        commits = await self.get_commits(git_url, username, per_page=100, max_pages=3)

        total_additions = 0
        total_deletions = 0
        files_touched = set()

        # Get detailed stats for recent commits (limited to avoid rate limits)
        commits_to_analyze = commits[:max_commits_for_stats]

        # Parallel commit details fetching with semaphore
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)
        tasks = [
            self._get_commit_details_safe(semaphore, git_url, commit["sha"])
            for commit in commits_to_analyze
        ]

        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                continue
            if isinstance(result, dict):
                total_additions += result.get("additions", 0)
                total_deletions += result.get("deletions", 0)
                for file in result.get("files", []):
                    files_touched.add(file.get("filename", ""))

        return {
            "total_commits": len(commits),
            "analyzed_commits": len(commits_to_analyze),
            "lines_added": total_additions,
            "lines_deleted": total_deletions,
            "files_changed": len(files_touched),
            "files_list": list(files_touched)[:50]  # Limit output size
        }

    async def get_commit_stats(
        self,
        git_url: str,
        author: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get commit statistics for a repository."""
        commits = await self.get_commits(git_url, author)

        commit_messages = []

        for commit in commits[:50]:  # Limit detailed analysis
            commit_messages.append(commit["commit"]["message"].split("\n")[0])

        # Categorize commits by message patterns
        categories = Counter()
        for msg in commit_messages:
            msg_lower = msg.lower()
            if any(w in msg_lower for w in ["feat", "add", "new", "implement"]):
                categories["feature"] += 1
            elif any(w in msg_lower for w in ["fix", "bug", "patch", "resolve"]):
                categories["fix"] += 1
            elif any(w in msg_lower for w in ["refactor", "clean", "improve"]):
                categories["refactor"] += 1
            elif any(w in msg_lower for w in ["doc", "readme", "comment"]):
                categories["docs"] += 1
            elif any(w in msg_lower for w in ["test", "spec"]):
                categories["test"] += 1
            else:
                categories["other"] += 1

        return {
            "total_commits": len(commits),
            "commit_messages": commit_messages[:20],
            "commit_categories": dict(categories),
            "first_commit_date": parse_iso_datetime(commits[-1]["commit"]["author"]["date"]) if commits else None,
            "last_commit_date": parse_iso_datetime(commits[0]["commit"]["author"]["date"]) if commits else None,
        }

    async def _check_file_for_parsing(
        self,
        semaphore: asyncio.Semaphore,
        owner: str,
        repo: str,
        filename: str,
        tech_service: TechnologyDetectionService
    ) -> List[str]:
        """Check a file that needs parsing and return detected technologies."""
        async with semaphore:
            try:
                content = await self._request(
                    "GET",
                    f"/repos/{owner}/{repo}/contents/{filename}"
                )
                if isinstance(content, dict) and "content" in content:
                    decoded = base64.b64decode(content["content"]).decode("utf-8")
                    parser = tech_service.get_parser_for_file(filename)
                    if parser:
                        return parser(decoded)
            except httpx.HTTPStatusError:
                pass
            except Exception:
                pass
            return []

    async def _check_file_presence(
        self,
        semaphore: asyncio.Semaphore,
        owner: str,
        repo: str,
        filename: str,
        techs: List[str]
    ) -> List[str]:
        """Check if a file exists and return associated technologies."""
        async with semaphore:
            try:
                await self._request(
                    "GET",
                    f"/repos/{owner}/{repo}/contents/{filename}"
                )
                return techs
            except httpx.HTTPStatusError:
                pass
            except Exception:
                pass
            return []

    async def detect_technologies(self, git_url: str) -> List[str]:
        """Detect technologies used in the repository.

        Performance: Uses parallel file checks (40+ files in ~3-5 seconds).
        """
        owner, repo = self._parse_repo_url(git_url)
        technologies = set()
        tech_service = TechnologyDetectionService()

        # Files that need parsing (use TechnologyDetectionService)
        parsed_files = [
            "package.json",
            "requirements.txt",
            "pyproject.toml",
            "composer.json",
            "pom.xml",
            "build.gradle",
            "build.gradle.kts",
            "pubspec.yaml",
        ]

        # Files that indicate a technology by their presence
        presence_indicators = {
            "tsconfig.json": ["TypeScript"],
            "tailwind.config.js": ["Tailwind CSS"],
            "tailwind.config.ts": ["Tailwind CSS", "TypeScript"],
            "vite.config.js": ["Vite"],
            "vite.config.ts": ["Vite", "TypeScript"],
            "next.config.js": ["Next.js"],
            "next.config.mjs": ["Next.js"],
            "next.config.ts": ["Next.js", "TypeScript"],
            "nuxt.config.js": ["Nuxt.js"],
            "nuxt.config.ts": ["Nuxt.js", "TypeScript"],
            "svelte.config.js": ["Svelte"],
            "astro.config.mjs": ["Astro"],
            ".eslintrc": ["ESLint"],
            ".eslintrc.js": ["ESLint"],
            ".eslintrc.json": ["ESLint"],
            "eslint.config.js": ["ESLint"],
            ".prettierrc": ["Prettier"],
            ".prettierrc.js": ["Prettier"],
            "prettier.config.js": ["Prettier"],
            "jest.config.js": ["Jest"],
            "jest.config.ts": ["Jest", "TypeScript"],
            "vitest.config.ts": ["Vitest", "TypeScript"],
            "playwright.config.ts": ["Playwright", "TypeScript"],
            "cypress.config.js": ["Cypress"],
            "cypress.config.ts": ["Cypress", "TypeScript"],
            "Pipfile": ["Python", "Pipenv"],
            "setup.py": ["Python", "setuptools"],
            "Cargo.toml": ["Rust", "Cargo"],
            "go.mod": ["Go"],
            "Gemfile": ["Ruby", "Bundler"],
            "Package.swift": ["Swift", "SwiftPM"],
            "Dockerfile": ["Docker"],
            "docker-compose.yml": ["Docker", "Docker Compose"],
            "docker-compose.yaml": ["Docker", "Docker Compose"],
            ".github/workflows": ["GitHub Actions"],
            "Jenkinsfile": ["Jenkins"],
            ".gitlab-ci.yml": ["GitLab CI"],
            "terraform": ["Terraform"],
            "kubernetes": ["Kubernetes"],
            "k8s": ["Kubernetes"],
            "nginx.conf": ["Nginx"],
        }

        # Create semaphore for rate limiting
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_FILE_CHECKS)

        # Create tasks for files that need parsing
        parsing_tasks = [
            self._check_file_for_parsing(semaphore, owner, repo, filename, tech_service)
            for filename in parsed_files
        ]

        # Create tasks for presence-based indicators
        presence_tasks = [
            self._check_file_presence(semaphore, owner, repo, filename, techs)
            for filename, techs in presence_indicators.items()
        ]

        # Execute all tasks in parallel
        all_tasks = parsing_tasks + presence_tasks
        results = await asyncio.gather(*all_tasks, return_exceptions=True)

        # Collect results
        for result in results:
            if isinstance(result, Exception):
                continue
            if isinstance(result, list):
                technologies.update(result)

        # Add languages (uses cache, so no duplicate API call)
        try:
            languages = await self.get_repo_languages(git_url)
            for lang in languages.keys():
                technologies.add(lang)
        except Exception:
            pass

        return list(technologies)

    async def get_contributors_count(self, git_url: str) -> int:
        """Get the number of contributors for a repository."""
        owner, repo = self._parse_repo_url(git_url)
        try:
            # Use per_page=1 and check response headers for total count
            async with httpx.AsyncClient() as client:
                response = await client.request(
                    "GET",
                    f"{self.base_url}/repos/{owner}/{repo}/contributors?per_page=1&anon=true",
                    headers=self.headers,
                )
                response.raise_for_status()

                # Check Link header for last page number
                link_header = response.headers.get("Link", "")
                if 'rel="last"' in link_header:
                    import re
                    match = re.search(r'page=(\d+)>; rel="last"', link_header)
                    if match:
                        return int(match.group(1))

                # If no pagination, count directly
                contributors = response.json()
                return len(contributors)
        except httpx.HTTPStatusError:
            return 1  # Default to 1 if can't fetch

    async def get_quick_repo_info(
        self,
        git_url: str,
        username: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get quick repository info for auto-fill (without full analysis)."""
        repo_info = await self.get_repo_info(git_url)
        commit_stats = await self.get_commit_stats(git_url, username)
        contributors_count = await self.get_contributors_count(git_url)

        # Calculate contribution percentage
        contribution_percent = 0
        user_commits_count = 0
        if username and commit_stats["total_commits"] > 0:
            user_commits = await self.get_commits(git_url, username, per_page=100, max_pages=10)
            user_commits_count = len(user_commits)
            contribution_percent = round(user_commits_count / commit_stats["total_commits"] * 100)

        return {
            "name": repo_info.get("name", ""),
            "description": repo_info.get("description", ""),
            "html_url": repo_info.get("html_url", ""),
            "start_date": commit_stats["first_commit_date"].strftime('%Y-%m-%d') if commit_stats["first_commit_date"] else None,
            "end_date": commit_stats["last_commit_date"].strftime('%Y-%m-%d') if commit_stats["last_commit_date"] else None,
            "team_size": contributors_count,
            "contribution_percent": contribution_percent,
            "total_commits": commit_stats["total_commits"],
            "user_commits": user_commits_count,
        }

    async def analyze_repository(
        self,
        git_url: str,
        username: Optional[str] = None,
        include_detailed_stats: bool = True
    ) -> Dict[str, Any]:
        """Perform full repository analysis."""
        # Get basic info
        repo_info = await self.get_repo_info(git_url)

        # Get languages
        languages = await self.get_repo_languages(git_url)
        primary_language = max(languages.keys(), key=lambda k: languages[k]) if languages else None

        # Get commit stats
        commit_stats = await self.get_commit_stats(git_url, username)

        # Get user-specific commits if username provided
        user_commits = 0
        if username:
            user_commit_list = await self.get_commits(git_url, username)
            user_commits = len(user_commit_list)

        # Detect technologies
        technologies = await self.detect_technologies(git_url)

        # Get detailed code statistics (lines added/deleted)
        lines_added = 0
        lines_deleted = 0
        files_changed = 0

        if include_detailed_stats:
            try:
                repo_stats = await self.get_repo_stats(git_url, username, max_commits_for_stats=50)
                lines_added = repo_stats["lines_added"]
                lines_deleted = repo_stats["lines_deleted"]
                files_changed = repo_stats["files_changed"]
            except Exception:
                pass  # Fall back to 0 if stats collection fails

        return {
            "default_branch": repo_info.get("default_branch", "main"),
            "total_commits": commit_stats["total_commits"],
            "user_commits": user_commits,
            "first_commit_date": commit_stats["first_commit_date"],
            "last_commit_date": commit_stats["last_commit_date"],
            "lines_added": lines_added,
            "lines_deleted": lines_deleted,
            "files_changed": files_changed,
            "languages": languages,
            "primary_language": primary_language,
            "detected_technologies": technologies,
            "commit_messages_summary": "\n".join(commit_stats["commit_messages"][:10]),
            "commit_categories": commit_stats["commit_categories"],
        }

    async def get_file_tree(
        self,
        git_url: str,
        path: str = "",
        ref: Optional[str] = None,
        recursive: bool = False
    ) -> List[Dict[str, Any]]:
        """Get file tree for a repository or specific directory.

        Args:
            git_url: GitHub repository URL
            path: Path within the repository (empty for root)
            ref: Branch, tag, or commit SHA (defaults to default branch)
            recursive: If True, get full tree recursively

        Returns:
            List of file/directory entries with type, name, path, and size
        """
        owner, repo = self._parse_repo_url(git_url)

        if recursive:
            # Use Git Trees API for recursive listing
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
                    # Filter by path prefix if specified
                    if path and not item["path"].startswith(path):
                        continue

                    # Skip the path itself if it's a directory
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
                # Fall back to contents API
                pass

        # Use Contents API for single directory
        endpoint = f"/repos/{owner}/{repo}/contents/{path}"
        if ref:
            endpoint += f"?ref={ref}"

        try:
            contents = await self._request("GET", endpoint)

            # Ensure we always return a list
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
        """Get content of a specific file.

        Args:
            git_url: GitHub repository URL
            file_path: Path to the file within the repository
            ref: Branch, tag, or commit SHA (defaults to default branch)

        Returns:
            Dict with file content, encoding, and metadata
        """
        import base64

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

    async def extract_tech_versions(self, git_url: str) -> Dict[str, List[str]]:
        """Extract technology versions from package files."""
        import json
        owner, repo = self._parse_repo_url(git_url)
        versions: Dict[str, List[str]] = {}

        # Parse package.json for Frontend versions
        try:
            content = await self._request(
                "GET",
                f"/repos/{owner}/{repo}/contents/package.json"
            )
            if isinstance(content, dict) and "content" in content:
                import base64
                decoded = base64.b64decode(content["content"]).decode("utf-8")
                pkg = json.loads(decoded)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

                # Key packages to extract versions for
                key_packages = [
                    "react", "vue", "angular", "next", "nuxt", "svelte",
                    "typescript", "vite", "webpack", "express", "nestjs",
                    "redux", "@reduxjs/toolkit", "zustand", "axios",
                    "tailwindcss", "@mui/material", "antd"
                ]

                frontend = []
                for name, version in deps.items():
                    pkg_name = name.lower().replace("@", "").replace("/", "-")
                    if any(k in name.lower() for k in key_packages) or len(frontend) < 15:
                        clean_version = version.replace("^", "").replace("~", "").replace(">=", "").replace("<=", "")
                        if clean_version and not clean_version.startswith("*"):
                            display_name = name.split("/")[-1] if "/" in name else name
                            frontend.append(f"{display_name} {clean_version}")

                if frontend:
                    versions["Frontend"] = frontend[:12]
        except Exception:
            pass

        # Parse requirements.txt for Backend versions
        try:
            content = await self._request(
                "GET",
                f"/repos/{owner}/{repo}/contents/requirements.txt"
            )
            if isinstance(content, dict) and "content" in content:
                import base64
                decoded = base64.b64decode(content["content"]).decode("utf-8")
                backend = []
                for line in decoded.split("\n"):
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "==" in line:
                        name, version = line.split("==", 1)
                        backend.append(f"{name.strip()} {version.strip().split(';')[0]}")
                    elif ">=" in line:
                        name, version = line.split(">=", 1)
                        backend.append(f"{name.strip()} >={version.strip().split(',')[0]}")

                if backend:
                    versions["Backend"] = backend[:12]
        except Exception:
            pass

        # Parse pyproject.toml for Poetry/Python versions
        try:
            content = await self._request(
                "GET",
                f"/repos/{owner}/{repo}/contents/pyproject.toml"
            )
            if isinstance(content, dict) and "content" in content:
                import base64
                decoded = base64.b64decode(content["content"]).decode("utf-8")

                # Simple TOML parsing for dependencies
                if "Backend" not in versions:
                    backend = []
                    in_deps = False
                    for line in decoded.split("\n"):
                        if "[tool.poetry.dependencies]" in line or "[project.dependencies]" in line:
                            in_deps = True
                            continue
                        if in_deps:
                            if line.startswith("["):
                                break
                            if "=" in line and not line.strip().startswith("#"):
                                parts = line.split("=", 1)
                                if len(parts) == 2:
                                    name = parts[0].strip()
                                    version = parts[1].strip().strip('"').strip("'")
                                    if name and version and name != "python":
                                        backend.append(f"{name} {version}")
                    if backend:
                        versions["Backend"] = backend[:12]
        except Exception:
            pass

        # Parse pom.xml for Java versions
        try:
            content = await self._request(
                "GET",
                f"/repos/{owner}/{repo}/contents/pom.xml"
            )
            if isinstance(content, dict) and "content" in content:
                import base64
                decoded = base64.b64decode(content["content"]).decode("utf-8")
                java = []

                # Simple XML parsing for versions
                import re
                # Find Spring Boot version
                spring_match = re.search(r'<spring-boot.version>([^<]+)</spring-boot.version>', decoded)
                if spring_match:
                    java.append(f"Spring Boot {spring_match.group(1)}")

                # Find Java version
                java_match = re.search(r'<java.version>([^<]+)</java.version>', decoded)
                if java_match:
                    java.append(f"Java {java_match.group(1)}")

                if java:
                    versions["Backend"] = java[:10]
        except Exception:
            pass

        # Parse pubspec.yaml for Flutter versions
        try:
            content = await self._request(
                "GET",
                f"/repos/{owner}/{repo}/contents/pubspec.yaml"
            )
            if isinstance(content, dict) and "content" in content:
                import base64
                decoded = base64.b64decode(content["content"]).decode("utf-8")
                mobile = []

                # Simple YAML parsing
                in_deps = False
                for line in decoded.split("\n"):
                    if "dependencies:" in line and not line.strip().startswith("#"):
                        in_deps = True
                        continue
                    if in_deps:
                        if line and not line.startswith(" ") and not line.startswith("\t"):
                            break
                        if ":" in line:
                            parts = line.strip().split(":")
                            if len(parts) >= 2:
                                name = parts[0].strip()
                                version = parts[1].strip()
                                if name and version and not name.startswith("#"):
                                    # Clean version
                                    version = version.replace("^", "").replace(">=", "").strip()
                                    if version:
                                        mobile.append(f"{name} {version}")

                if mobile:
                    versions["Mobile"] = mobile[:10]
        except Exception:
            pass

        return versions

    async def _generate_implementation_details(
        self,
        project_data: Dict[str, Any],
        analysis_data: Dict[str, Any],
        llm
    ) -> Tuple[List[Dict], int]:
        """Generate implementation details using LLM."""
        import json

        implementation_prompt = f"""다음 프로젝트 정보를 바탕으로 주요 구현 기능을 분석해주세요.

프로젝트: {project_data.get('name', 'N/A')}
설명: {project_data.get('description', 'N/A')}
역할: {project_data.get('role', 'N/A')}

커밋 메시지 요약:
{analysis_data.get('commit_messages_summary', 'N/A')[:1500]}

기술 스택: {', '.join(analysis_data.get('detected_technologies', [])[:15])}
커밋 카테고리: {analysis_data.get('commit_categories', {})}

JSON 형식으로 3-5개의 주요 구현 기능을 작성해주세요. 각 기능은 실제 개발 업무와 관련된 구체적인 내용이어야 합니다:
[
  {{
    "title": "기능 제목 (영문 부제 포함, 예: 멀티뷰 워크스페이스 (Multiview Workspace))",
    "items": [
      "구체적인 구현 내용 1: 기술적 세부사항 포함",
      "구체적인 구현 내용 2: 어떤 기술을 사용했는지 명시"
    ]
  }}
]

JSON만 반환하세요."""

        try:
            impl_response, impl_tokens = await llm.provider.generate(
                implementation_prompt,
                system_prompt="당신은 소프트웨어 프로젝트를 분석하는 기술 전문가입니다. 커밋 메시지와 기술 스택을 바탕으로 실제 구현된 기능을 구조화합니다.",
                max_tokens=2000,
                temperature=0.3
            )

            json_str = impl_response
            if "```json" in impl_response:
                json_str = impl_response.split("```json")[1].split("```")[0]
            elif "```" in impl_response:
                json_str = impl_response.split("```")[1].split("```")[0]

            return json.loads(json_str.strip()), impl_tokens
        except Exception as e:
            logger.exception("Failed to generate implementation_details: %s: %s", type(e).__name__, e)
            return [], 0

    async def _generate_development_timeline(
        self,
        project_data: Dict[str, Any],
        analysis_data: Dict[str, Any],
        llm
    ) -> Tuple[List[Dict], int]:
        """Generate development timeline using LLM."""
        import json

        start_date = project_data.get('start_date', '')
        end_date = project_data.get('end_date', '')

        timeline_prompt = f"""다음 프로젝트 정보를 바탕으로 개발 타임라인을 작성해주세요.

프로젝트: {project_data.get('name', 'N/A')}
기간: {start_date} ~ {end_date or '진행중'}
커밋 메시지 요약:
{analysis_data.get('commit_messages_summary', 'N/A')[:1500]}

커밋 카테고리: {analysis_data.get('commit_categories', {})}
총 커밋: {analysis_data.get('total_commits', 0)}

JSON 형식으로 시간순 개발 타임라인을 2-4개 단계로 작성해주세요:
[
  {{
    "period": "YYYY-MM ~ MM (예: 2024-01 ~ 02)",
    "title": "단계 제목 (예: 기본 인프라 구축)",
    "activities": ["활동 1", "활동 2", "활동 3"]
  }}
]

JSON만 반환하세요."""

        try:
            timeline_response, timeline_tokens = await llm.provider.generate(
                timeline_prompt,
                system_prompt="당신은 소프트웨어 개발 프로젝트의 타임라인을 분석하는 전문가입니다.",
                max_tokens=1500,
                temperature=0.3
            )

            json_str = timeline_response
            if "```json" in timeline_response:
                json_str = timeline_response.split("```json")[1].split("```")[0]
            elif "```" in timeline_response:
                json_str = timeline_response.split("```")[1].split("```")[0]

            return json.loads(json_str.strip()), timeline_tokens
        except Exception as e:
            logger.exception("Failed to generate development_timeline: %s: %s", type(e).__name__, e)
            return [], 0

    async def _generate_detailed_achievements(
        self,
        project_data: Dict[str, Any],
        analysis_data: Dict[str, Any],
        llm
    ) -> Tuple[Dict, int]:
        """Generate detailed achievements using LLM."""
        import json

        achievements_prompt = f"""다음 프로젝트 정보를 바탕으로 주요 성과를 카테고리별로 분석해주세요.

프로젝트: {project_data.get('name', 'N/A')}
설명: {project_data.get('description', 'N/A')}
커밋 메시지 요약:
{analysis_data.get('commit_messages_summary', 'N/A')[:1500]}

코드 통계:
- 추가된 라인: {analysis_data.get('lines_added', 0)}
- 삭제된 라인: {analysis_data.get('lines_deleted', 0)}
- 변경된 파일: {analysis_data.get('files_changed', 0)}

커밋 카테고리: {analysis_data.get('commit_categories', {})}

JSON 형식으로 성과를 카테고리별로 작성해주세요. 각 성과는 구체적인 수치나 비교를 포함해야 합니다:
{{
  "새로운 기능 추가": [
    {{"title": "기능 제목", "description": "기존 대비 개선점 또는 새로운 가치"}}
  ],
  "성능 개선": [
    {{"title": "개선 항목", "description": "수치적 개선 (예: 80% 향상, 3배 빨라짐)"}}
  ],
  "코드 품질": [
    {{"title": "품질 개선", "description": "리팩토링, 테스트 추가 등"}}
  ]
}}

JSON만 반환하세요. 해당 카테고리가 없으면 빈 배열로 두세요."""

        try:
            achievements_response, achievements_tokens = await llm.provider.generate(
                achievements_prompt,
                system_prompt="당신은 소프트웨어 프로젝트의 성과를 분석하는 전문가입니다. 커밋 히스토리와 코드 통계를 바탕으로 정량적인 성과를 추출합니다.",
                max_tokens=1500,
                temperature=0.3
            )

            json_str = achievements_response
            if "```json" in achievements_response:
                json_str = achievements_response.split("```json")[1].split("```")[0]
            elif "```" in achievements_response:
                json_str = achievements_response.split("```")[1].split("```")[0]

            return json.loads(json_str.strip()), achievements_tokens
        except Exception as e:
            logger.exception("Failed to generate detailed_achievements: %s: %s", type(e).__name__, e)
            return {}, 0

    async def generate_detailed_content(
        self,
        project_data: Dict[str, Any],
        analysis_data: Dict[str, Any],
        llm_service=None
    ) -> Tuple[Dict[str, Any], int]:
        """Generate detailed content using LLM.

        Performance: Uses parallel LLM calls (3 calls in ~10-15 seconds instead of 30-40 seconds).

        Returns:
            Tuple of (result dict, total tokens used)
        """
        from api.services.llm_service import LLMService
        from api.config import get_settings

        settings = get_settings()
        total_tokens = 0

        # Check if LLM is configured
        if not settings.llm_provider and llm_service is None:
            logger.warning("No LLM provider configured")
            return {}, 0

        try:
            if llm_service is None:
                llm_service = LLMService(settings.llm_provider)
            llm = llm_service
            logger.info("Using LLM service: %s", type(llm).__name__)
            if hasattr(llm, 'provider_name'):
                logger.debug("Provider name: %s", llm.provider_name)
        except ValueError as e:
            # LLM not configured
            logger.error("LLM init failed: %s", e)
            return {}, 0

        result = {}

        # Execute all LLM calls in parallel for better performance
        tasks = [
            self._generate_implementation_details(project_data, analysis_data, llm),
            self._generate_development_timeline(project_data, analysis_data, llm),
            self._generate_detailed_achievements(project_data, analysis_data, llm),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        # Implementation details
        if not isinstance(results[0], Exception):
            impl_details, impl_tokens = results[0]
            result["implementation_details"] = impl_details
            total_tokens += impl_tokens
        else:
            logger.exception("implementation_details failed: %s", results[0])
            result["implementation_details"] = []

        # Development timeline
        if not isinstance(results[1], Exception):
            timeline, timeline_tokens = results[1]
            result["development_timeline"] = timeline
            total_tokens += timeline_tokens
        else:
            logger.exception("development_timeline failed: %s", results[1])
            result["development_timeline"] = []

        # Detailed achievements
        if not isinstance(results[2], Exception):
            achievements, achievements_tokens = results[2]
            result["detailed_achievements"] = achievements
            total_tokens += achievements_tokens
        else:
            logger.exception("detailed_achievements failed: %s", results[2])
            result["detailed_achievements"] = {}

        return result, total_tokens

    # ============ Extended Analysis Methods ============

    def _parse_conventional_commit(self, message: str) -> Dict[str, Any]:
        """Parse Conventional Commit message format.

        Examples:
            "feat(auth): add login API" -> {"type": "feat", "scope": "auth", "description": "add login API"}
            "fix: resolve memory leak" -> {"type": "fix", "scope": None, "description": "resolve memory leak"}
            "Update readme" -> {"type": "other", "scope": None, "description": "Update readme"}
        """
        # Conventional commit pattern: type(scope)!?: description
        # The ! indicates breaking change
        pattern = r'^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$'
        match = re.match(pattern, message.split('\n')[0].strip())

        if match:
            commit_type = match.group(1).lower()
            scope = match.group(2)
            is_breaking = match.group(3) is not None
            description = match.group(4)

            # Normalize commit type
            if commit_type not in COMMIT_TYPES:
                # Try to match common variations
                type_mappings = {
                    "feature": "feat",
                    "bugfix": "fix",
                    "hotfix": "fix",
                    "ref": "refactor",
                    "doc": "docs",
                    "tests": "test",
                    "testing": "test",
                    "performance": "perf",
                    "styles": "style",
                    "config": "chore",
                    "deps": "chore",
                    "wip": "chore",
                }
                commit_type = type_mappings.get(commit_type, commit_type)

            return {
                "type": commit_type if commit_type in COMMIT_TYPES else "other",
                "type_label": COMMIT_TYPES.get(commit_type, "Other"),
                "scope": scope,
                "description": description,
                "is_breaking": is_breaking,
            }

        # Try to infer type from message content
        msg_lower = message.lower()
        inferred_type = "other"

        if any(w in msg_lower for w in ["add", "implement", "create", "new"]):
            inferred_type = "feat"
        elif any(w in msg_lower for w in ["fix", "bug", "resolve", "patch"]):
            inferred_type = "fix"
        elif any(w in msg_lower for w in ["refactor", "clean", "improve", "restructure"]):
            inferred_type = "refactor"
        elif any(w in msg_lower for w in ["doc", "readme", "comment"]):
            inferred_type = "docs"
        elif any(w in msg_lower for w in ["test", "spec"]):
            inferred_type = "test"

        return {
            "type": inferred_type,
            "type_label": COMMIT_TYPES.get(inferred_type, "Other"),
            "scope": None,
            "description": message.split('\n')[0].strip(),
            "is_breaking": False,
        }

    def _detect_work_areas(self, file_paths: List[str]) -> List[str]:
        """Detect work areas from a list of file paths.

        Args:
            file_paths: List of file paths (e.g., ["src/components/Button.tsx", "api/routes/users.py"])

        Returns:
            List of detected work areas (e.g., ["frontend", "backend"])
        """
        detected_areas = set()

        for file_path in file_paths:
            path_lower = file_path.lower()

            for area, patterns in WORK_AREA_PATTERNS.items():
                for pattern in patterns:
                    # Check if pattern matches (handle glob-like patterns)
                    if pattern.startswith("*."):
                        # Extension pattern
                        if path_lower.endswith(pattern[1:]):
                            detected_areas.add(area)
                            break
                    elif pattern.endswith("/"):
                        # Directory pattern
                        if pattern[:-1] in path_lower or path_lower.startswith(pattern[:-1]):
                            detected_areas.add(area)
                            break
                    else:
                        # Exact match or contains
                        if pattern in path_lower:
                            detected_areas.add(area)
                            break

        return list(detected_areas)

    def _extract_file_extensions(self, file_paths: List[str]) -> Dict[str, int]:
        """Extract and count file extensions from file paths.

        Args:
            file_paths: List of file paths

        Returns:
            Dict mapping extensions to counts (e.g., {".py": 45, ".ts": 30})
        """
        extensions: Counter = Counter()

        for path in file_paths:
            # Extract extension
            if '.' in path.split('/')[-1]:
                ext = '.' + path.split('.')[-1].lower()
                # Filter out non-code extensions
                if ext not in ['.lock', '.sum', '.map', '.svg', '.png', '.jpg', '.gif']:
                    extensions[ext] += 1

        return dict(extensions.most_common(20))

    async def get_all_contributors(self, git_url: str) -> List[Dict[str, Any]]:
        """Get all contributors for a repository.

        Returns:
            List of contributor info with username, commits, avatar_url
        """
        owner, repo = self._parse_repo_url(git_url)

        try:
            # Fetch contributors from GitHub API
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

    async def analyze_contributor(
        self,
        git_url: str,
        username: str,
        commit_limit: int = 100
    ) -> Dict[str, Any]:
        """Analyze a specific contributor's activity in a repository.

        Args:
            git_url: GitHub repository URL
            username: GitHub username to analyze
            commit_limit: Maximum commits to analyze

        Returns:
            Dict with contributor statistics, work areas, technologies, etc.
        """
        # Get commits by this user
        commits = await self.get_commits(
            git_url,
            author=username,
            per_page=100,
            max_pages=max(1, commit_limit // 100)
        )

        if not commits:
            return {
                "username": username,
                "total_commits": 0,
                "lines_added": 0,
                "lines_deleted": 0,
                "file_extensions": {},
                "work_areas": [],
                "detected_technologies": [],
                "detailed_commits": [],
                "commit_types": {},
            }

        # Get detailed info for recent commits (parallel)
        commits_to_analyze = commits[:min(MAX_DETAILED_COMMITS, len(commits))]
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)
        tasks = [
            self._get_commit_details_safe(semaphore, git_url, c["sha"])
            for c in commits_to_analyze
        ]
        detailed_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        total_additions = 0
        total_deletions = 0
        all_files: List[str] = []
        detailed_commits: List[Dict] = []
        commit_types: Counter = Counter()

        for i, result in enumerate(detailed_results):
            if isinstance(result, Exception):
                continue

            commit = commits_to_analyze[i]
            total_additions += result.get("additions", 0)
            total_deletions += result.get("deletions", 0)

            # Collect file paths
            for f in result.get("files", []):
                all_files.append(f.get("filename", ""))

            # Parse conventional commit
            parsed = self._parse_conventional_commit(commit["commit"]["message"])
            commit_types[parsed["type"]] += 1

            # Build detailed commit info
            detailed_commits.append({
                "sha": commit["sha"][:7],
                "message": commit["commit"]["message"].split('\n')[0][:100],
                "author": commit["commit"]["author"]["name"],
                "date": commit["commit"]["author"]["date"],
                "commit_type": parsed["type"],
                "type_label": parsed["type_label"],
                "scope": parsed["scope"],
                "files_changed": result.get("files_changed", 0),
                "lines_added": result.get("additions", 0),
                "lines_deleted": result.get("deletions", 0),
                "work_areas": self._detect_work_areas([f.get("filename", "") for f in result.get("files", [])]),
            })

        # Detect work areas and file extensions
        work_areas = self._detect_work_areas(all_files)
        file_extensions = self._extract_file_extensions(all_files)

        # Detect technologies from file patterns
        technologies = self._detect_technologies_from_files(all_files)

        # Get commit dates
        first_commit_date = None
        last_commit_date = None
        if commits:
            last_commit_date = parse_iso_datetime(commits[0]["commit"]["author"]["date"])
            first_commit_date = parse_iso_datetime(commits[-1]["commit"]["author"]["date"])

        return {
            "username": username,
            "total_commits": len(commits),
            "first_commit_date": first_commit_date,
            "last_commit_date": last_commit_date,
            "lines_added": total_additions,
            "lines_deleted": total_deletions,
            "file_extensions": file_extensions,
            "work_areas": work_areas,
            "detected_technologies": technologies,
            "detailed_commits": detailed_commits[:MAX_DETAILED_COMMITS],  # Limit stored commits
            "commit_types": dict(commit_types),
        }

    def _detect_technologies_from_files(self, file_paths: List[str]) -> List[str]:
        """Detect technologies based on file paths and extensions.

        Args:
            file_paths: List of file paths

        Returns:
            List of detected technologies
        """
        technologies = set()

        # Extension to technology mapping
        ext_tech_map = {
            ".py": "Python",
            ".js": "JavaScript",
            ".ts": "TypeScript",
            ".tsx": "TypeScript",
            ".jsx": "JavaScript",
            ".vue": "Vue.js",
            ".svelte": "Svelte",
            ".go": "Go",
            ".rs": "Rust",
            ".java": "Java",
            ".kt": "Kotlin",
            ".swift": "Swift",
            ".rb": "Ruby",
            ".php": "PHP",
            ".cs": "C#",
            ".cpp": "C++",
            ".c": "C",
            ".dart": "Dart",
            ".scala": "Scala",
            ".sql": "SQL",
            ".graphql": "GraphQL",
            ".prisma": "Prisma",
        }

        # Path pattern to technology mapping
        path_tech_map = {
            "react": "React",
            "next": "Next.js",
            "nuxt": "Nuxt.js",
            "angular": "Angular",
            "vue": "Vue.js",
            "svelte": "Svelte",
            "express": "Express",
            "fastapi": "FastAPI",
            "django": "Django",
            "flask": "Flask",
            "spring": "Spring",
            "rails": "Ruby on Rails",
            "laravel": "Laravel",
            "docker": "Docker",
            "kubernetes": "Kubernetes",
            "terraform": "Terraform",
            "graphql": "GraphQL",
            "prisma": "Prisma",
            "drizzle": "Drizzle",
            "playwright": "Playwright",
            "cypress": "Cypress",
            "jest": "Jest",
            "vitest": "Vitest",
        }

        for path in file_paths:
            path_lower = path.lower()

            # Check extensions
            if '.' in path.split('/')[-1]:
                ext = '.' + path.split('.')[-1].lower()
                if ext in ext_tech_map:
                    technologies.add(ext_tech_map[ext])

            # Check path patterns
            for pattern, tech in path_tech_map.items():
                if pattern in path_lower:
                    technologies.add(tech)

        return list(technologies)

    async def analyze_code_quality(self, git_url: str) -> Dict[str, Any]:
        """Analyze code quality metrics for a repository.

        Returns:
            Dict with quality metrics like file sizes, test ratio, doc ratio
        """
        owner, repo = self._parse_repo_url(git_url)

        try:
            # Get repository tree recursively
            repo_info = await self.get_repo_info(git_url)
            default_branch = repo_info.get("default_branch", "main")

            tree = await self._request(
                "GET",
                f"/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
            )

            items = tree.get("tree", [])
            files = [item for item in items if item.get("type") == "blob"]

            if not files:
                return self._empty_quality_metrics()

            # Categorize files
            total_files = len(files)
            total_size = sum(f.get("size", 0) for f in files)
            file_sizes = [f.get("size", 0) for f in files]

            test_files = 0
            doc_files = 0
            code_files = 0
            config_files = 0
            language_bytes: Counter = Counter()

            code_extensions = {
                '.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs', '.java',
                '.kt', '.swift', '.rb', '.php', '.cs', '.cpp', '.c', '.dart',
                '.scala', '.vue', '.svelte'
            }
            test_patterns = ['test', 'spec', '__tests__', 'tests/', 'test/']
            doc_extensions = {'.md', '.rst', '.txt', '.adoc'}
            config_extensions = {'.json', '.yaml', '.yml', '.toml', '.ini', '.env'}

            for f in files:
                path = f.get("path", "").lower()
                size = f.get("size", 0)

                # Get extension
                ext = ""
                if '.' in path.split('/')[-1]:
                    ext = '.' + path.split('.')[-1]

                # Categorize
                is_test = any(p in path for p in test_patterns)
                is_doc = ext in doc_extensions
                is_config = ext in config_extensions
                is_code = ext in code_extensions

                if is_test:
                    test_files += 1
                elif is_doc:
                    doc_files += 1
                elif is_config:
                    config_files += 1
                elif is_code:
                    code_files += 1

                # Track language distribution
                if is_code and ext:
                    language_bytes[ext] += size

            # Calculate ratios
            test_ratio = test_files / total_files if total_files > 0 else 0
            doc_ratio = doc_files / total_files if total_files > 0 else 0
            code_ratio = code_files / total_files if total_files > 0 else 0

            # Calculate language distribution
            total_code_bytes = sum(language_bytes.values())
            language_distribution = {}
            if total_code_bytes > 0:
                for ext, bytes_count in language_bytes.most_common(10):
                    language_distribution[ext] = round(bytes_count / total_code_bytes * 100, 2)

            return {
                "total_files": total_files,
                "total_lines": total_size // 50,  # Rough estimate: 50 bytes per line
                "avg_file_size": round(sum(file_sizes) / len(file_sizes), 2) if file_sizes else 0,
                "max_file_size": max(file_sizes) if file_sizes else 0,
                "test_file_ratio": round(test_ratio * 100, 2),
                "doc_file_ratio": round(doc_ratio * 100, 2),
                "code_file_ratio": round(code_ratio * 100, 2),
                "config_file_count": config_files,
                "language_distribution": language_distribution,
                "file_count_by_type": {
                    "code": code_files,
                    "test": test_files,
                    "docs": doc_files,
                    "config": config_files,
                },
            }

        except Exception as e:
            logger.warning("Failed to analyze code quality: %s", e)
            return self._empty_quality_metrics()

    def _empty_quality_metrics(self) -> Dict[str, Any]:
        """Return empty quality metrics structure."""
        return {
            "total_files": 0,
            "total_lines": 0,
            "avg_file_size": 0,
            "max_file_size": 0,
            "test_file_ratio": 0,
            "doc_file_ratio": 0,
            "code_file_ratio": 0,
            "config_file_count": 0,
            "language_distribution": {},
            "file_count_by_type": {
                "code": 0,
                "test": 0,
                "docs": 0,
                "config": 0,
            },
        }

    async def get_detailed_commits(
        self,
        git_url: str,
        author: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get detailed commit information with Conventional Commit parsing.

        Args:
            git_url: GitHub repository URL
            author: Filter by author username (optional)
            limit: Maximum number of commits to return

        Returns:
            List of detailed commit objects with parsed info
        """
        commits = await self.get_commits(
            git_url,
            author=author,
            per_page=min(100, limit),
            max_pages=max(1, limit // 100)
        )

        commits_to_analyze = commits[:limit]

        # Get detailed info in parallel
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)
        tasks = [
            self._get_commit_details_safe(semaphore, git_url, c["sha"])
            for c in commits_to_analyze
        ]
        details = await asyncio.gather(*tasks, return_exceptions=True)

        result = []
        for i, commit in enumerate(commits_to_analyze):
            detail = details[i] if not isinstance(details[i], Exception) else {}

            # Parse conventional commit
            parsed = self._parse_conventional_commit(commit["commit"]["message"])

            # Detect work areas from files
            files = detail.get("files", []) if isinstance(detail, dict) else []
            file_paths = [f.get("filename", "") for f in files]
            work_areas = self._detect_work_areas(file_paths)

            result.append({
                "sha": commit["sha"],
                "short_sha": commit["sha"][:7],
                "message": commit["commit"]["message"].split('\n')[0],
                "full_message": commit["commit"]["message"],
                "author": commit["commit"]["author"]["name"],
                "author_email": commit["commit"]["author"].get("email"),
                "date": commit["commit"]["author"]["date"],
                "commit_type": parsed["type"],
                "type_label": parsed["type_label"],
                "scope": parsed["scope"],
                "description": parsed["description"],
                "is_breaking": parsed["is_breaking"],
                "files_changed": detail.get("files_changed", 0) if isinstance(detail, dict) else 0,
                "lines_added": detail.get("additions", 0) if isinstance(detail, dict) else 0,
                "lines_deleted": detail.get("deletions", 0) if isinstance(detail, dict) else 0,
                "work_areas": work_areas,
            })

        return result
