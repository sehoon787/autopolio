"""
Repository Analyzer - Repository analysis and technology detection.

Extracted from github_service.py for better modularity.
Contains analysis methods that build on top of the API client.
"""

import asyncio
import base64
import json
import logging
from typing import Dict, List, Any, Optional
from collections import Counter

import httpx

from .technology_detection_service import TechnologyDetectionService
from api.services.github.github_constants import (
    MAX_CONCURRENT_FILE_CHECKS,
    MAX_CONCURRENT_COMMIT_DETAILS,
    parse_iso_datetime,
)
from .contributor_analyzer import (
    detect_ai_tools,
)

logger = logging.getLogger(__name__)


class RepoAnalyzer:
    """Repository analysis functionality that builds on GitHubApiClient."""

    def __init__(self, api_client):
        """
        Args:
            api_client: GitHubApiClient instance
        """
        self.api = api_client

    # ==========================================================================
    # Commit Statistics
    # ==========================================================================

    async def get_commit_stats(
        self, git_url: str, author: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get commit statistics for a repository."""
        commits = await self.api.get_commits(git_url, author)

        commit_messages = []
        for commit in commits[:50]:
            commit_messages.append(commit["commit"]["message"].split("\n")[0])

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
            "first_commit_date": parse_iso_datetime(
                commits[-1]["commit"]["author"]["date"]
            )
            if commits
            else None,
            "last_commit_date": parse_iso_datetime(
                commits[0]["commit"]["author"]["date"]
            )
            if commits
            else None,
        }

    async def get_repo_stats(
        self,
        git_url: str,
        username: Optional[str] = None,
        max_commits_for_stats: int = 100,
    ) -> Dict[str, Any]:
        """Get comprehensive repository statistics including code changes."""
        commits = await self.api.get_commits(
            git_url, username, per_page=100, max_pages=3
        )

        total_additions = 0
        total_deletions = 0
        files_touched = set()

        commits_to_analyze = commits[:max_commits_for_stats]

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)
        tasks = [
            self.api._get_commit_details_safe(semaphore, git_url, commit["sha"])
            for commit in commits_to_analyze
        ]

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
            "files_list": list(files_touched)[:50],
        }

    # ==========================================================================
    # Technology Detection
    # ==========================================================================

    async def _check_file_for_parsing(
        self,
        semaphore: asyncio.Semaphore,
        owner: str,
        repo: str,
        filename: str,
        tech_service: TechnologyDetectionService,
    ) -> List[str]:
        """Check a file that needs parsing and return detected technologies."""
        async with semaphore:
            try:
                content = await self.api._request(
                    "GET", f"/repos/{owner}/{repo}/contents/{filename}"
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
        techs: List[str],
    ) -> List[str]:
        """Check if a file exists and return associated technologies."""
        async with semaphore:
            try:
                await self.api._request(
                    "GET", f"/repos/{owner}/{repo}/contents/{filename}"
                )
                return techs
            except httpx.HTTPStatusError:
                pass
            except Exception:
                pass
            return []

    async def detect_technologies(self, git_url: str) -> List[str]:
        """Detect technologies used in the repository."""
        owner, repo = self.api._parse_repo_url(git_url)
        technologies = set()
        tech_service = TechnologyDetectionService()

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

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_FILE_CHECKS)

        parsing_tasks = [
            self._check_file_for_parsing(semaphore, owner, repo, filename, tech_service)
            for filename in parsed_files
        ]

        presence_tasks = [
            self._check_file_presence(semaphore, owner, repo, filename, techs)
            for filename, techs in presence_indicators.items()
        ]

        all_tasks = parsing_tasks + presence_tasks
        results = await asyncio.gather(*all_tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                continue
            if isinstance(result, list):
                technologies.update(result)

        try:
            languages = await self.api.get_repo_languages(git_url)
            for lang in languages.keys():
                technologies.add(lang)
        except Exception:
            pass

        return list(technologies)

    # ==========================================================================
    # Tech Version Extraction
    # ==========================================================================

    async def extract_tech_versions(self, git_url: str) -> Dict[str, List[str]]:
        """Extract technology versions from package files."""
        owner, repo = self.api._parse_repo_url(git_url)
        versions: Dict[str, List[str]] = {}

        # Parse package.json
        try:
            content = await self.api._request(
                "GET", f"/repos/{owner}/{repo}/contents/package.json"
            )
            if isinstance(content, dict) and "content" in content:
                decoded = base64.b64decode(content["content"]).decode("utf-8")
                pkg = json.loads(decoded)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

                key_packages = [
                    "react",
                    "vue",
                    "angular",
                    "next",
                    "nuxt",
                    "svelte",
                    "typescript",
                    "vite",
                    "webpack",
                    "express",
                    "nestjs",
                    "redux",
                    "@reduxjs/toolkit",
                    "zustand",
                    "axios",
                    "tailwindcss",
                    "@mui/material",
                    "antd",
                ]

                frontend = []
                for name, version in deps.items():
                    if (
                        any(k in name.lower() for k in key_packages)
                        or len(frontend) < 15
                    ):
                        clean_version = (
                            version.replace("^", "")
                            .replace("~", "")
                            .replace(">=", "")
                            .replace("<=", "")
                        )
                        if clean_version and not clean_version.startswith("*"):
                            display_name = name.split("/")[-1] if "/" in name else name
                            frontend.append(f"{display_name} {clean_version}")

                if frontend:
                    versions["Frontend"] = frontend[:12]
        except Exception:
            pass

        # Parse requirements.txt
        try:
            content = await self.api._request(
                "GET", f"/repos/{owner}/{repo}/contents/requirements.txt"
            )
            if isinstance(content, dict) and "content" in content:
                decoded = base64.b64decode(content["content"]).decode("utf-8")
                backend = []
                for line in decoded.split("\n"):
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "==" in line:
                        name, version = line.split("==", 1)
                        backend.append(
                            f"{name.strip()} {version.strip().split(';')[0]}"
                        )
                    elif ">=" in line:
                        name, version = line.split(">=", 1)
                        backend.append(
                            f"{name.strip()} >={version.strip().split(',')[0]}"
                        )

                if backend:
                    versions["Backend"] = backend[:12]
        except Exception:
            pass

        # Parse pyproject.toml
        try:
            content = await self.api._request(
                "GET", f"/repos/{owner}/{repo}/contents/pyproject.toml"
            )
            if isinstance(content, dict) and "content" in content:
                decoded = base64.b64decode(content["content"]).decode("utf-8")

                if "Backend" not in versions:
                    backend = []
                    in_deps = False
                    for line in decoded.split("\n"):
                        if (
                            "[tool.poetry.dependencies]" in line
                            or "[project.dependencies]" in line
                        ):
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

        return versions

    # ==========================================================================
    # Full Repository Analysis
    # ==========================================================================

    async def analyze_repository(
        self,
        git_url: str,
        username: Optional[str] = None,
        include_detailed_stats: bool = True,
    ) -> Dict[str, Any]:
        """Perform full repository analysis."""
        repo_info = await self.api.get_repo_info(git_url)

        languages = await self.api.get_repo_languages(git_url)
        primary_language = (
            max(languages.keys(), key=lambda k: languages[k]) if languages else None
        )

        commit_stats = await self.get_commit_stats(git_url, username)

        user_commits = 0
        if username:
            user_commit_list = await self.api.get_commits(git_url, username)
            user_commits = len(user_commit_list)

        technologies = await self.detect_technologies(git_url)

        lines_added = 0
        lines_deleted = 0
        files_changed = 0

        if include_detailed_stats:
            try:
                repo_stats = await self.get_repo_stats(
                    git_url, username, max_commits_for_stats=50
                )
                lines_added = repo_stats["lines_added"]
                lines_deleted = repo_stats["lines_deleted"]
                files_changed = repo_stats["files_changed"]
            except Exception:
                pass

        # Detect AI tools from full commit messages (Co-Authored-By patterns)
        ai_tools_detected = []
        try:
            all_commits = await self.api.get_commits(git_url, per_page=100, max_pages=5)
            full_messages = [
                c["commit"]["message"]
                for c in all_commits
                if c.get("commit", {}).get("message")
            ]
            ai_tools_detected = detect_ai_tools(full_messages)
        except Exception as e:
            logger.warning("Failed to detect AI tools for %s: %s", git_url, e)

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
            "ai_tools_detected": ai_tools_detected or None,
        }

    async def get_quick_repo_info(
        self, git_url: str, username: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get quick repository info for auto-fill."""
        repo_info = await self.api.get_repo_info(git_url)
        commit_stats = await self.get_commit_stats(git_url, username)
        contributors_count = await self.api.get_contributors_count(git_url)

        contribution_percent = 0
        user_commits_count = 0
        if username and commit_stats["total_commits"] > 0:
            user_commits = await self.api.get_commits(
                git_url, username, per_page=100, max_pages=10
            )
            user_commits_count = len(user_commits)
            contribution_percent = round(
                user_commits_count / commit_stats["total_commits"] * 100
            )

        return {
            "name": repo_info.get("name", ""),
            "description": repo_info.get("description", ""),
            "html_url": repo_info.get("html_url", ""),
            "start_date": commit_stats["first_commit_date"].strftime("%Y-%m-%d")
            if commit_stats["first_commit_date"]
            else None,
            "end_date": commit_stats["last_commit_date"].strftime("%Y-%m-%d")
            if commit_stats["last_commit_date"]
            else None,
            "team_size": contributors_count,
            "contribution_percent": contribution_percent,
            "total_commits": commit_stats["total_commits"],
            "user_commits": user_commits_count,
        }

    # ==========================================================================
    # Code Quality Analysis
    # ==========================================================================

    async def analyze_code_quality(self, git_url: str) -> Dict[str, Any]:
        """Analyze code quality metrics for a repository."""
        owner, repo = self.api._parse_repo_url(git_url)

        try:
            repo_info = await self.api.get_repo_info(git_url)
            default_branch = repo_info.get("default_branch", "main")

            tree = await self.api._request(
                "GET", f"/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
            )

            items = tree.get("tree", [])
            files = [item for item in items if item.get("type") == "blob"]

            if not files:
                return self._empty_quality_metrics()

            total_files = len(files)
            file_sizes = [f.get("size", 0) for f in files]

            test_files = 0
            doc_files = 0
            code_files = 0
            config_files = 0
            language_bytes: Counter = Counter()

            code_extensions = {
                ".py",
                ".js",
                ".ts",
                ".tsx",
                ".jsx",
                ".go",
                ".rs",
                ".java",
                ".kt",
                ".swift",
                ".rb",
                ".php",
                ".cs",
                ".cpp",
                ".c",
                ".dart",
                ".scala",
                ".vue",
                ".svelte",
            }
            test_patterns = ["test", "spec", "__tests__", "tests/", "test/"]
            doc_extensions = {".md", ".rst", ".txt", ".adoc"}
            config_extensions = {".json", ".yaml", ".yml", ".toml", ".ini", ".env"}

            for f in files:
                path = f.get("path", "").lower()
                size = f.get("size", 0)

                ext = ""
                if "." in path.split("/")[-1]:
                    ext = "." + path.split(".")[-1]

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

                if is_code and ext:
                    language_bytes[ext] += size

            test_ratio = test_files / total_files if total_files > 0 else 0
            doc_ratio = doc_files / total_files if total_files > 0 else 0
            code_ratio = code_files / total_files if total_files > 0 else 0

            total_code_bytes = sum(language_bytes.values())
            language_distribution = {}
            if total_code_bytes > 0:
                for ext, bytes_count in language_bytes.most_common(10):
                    language_distribution[ext] = round(
                        bytes_count / total_code_bytes * 100, 2
                    )

            return {
                "total_files": total_files,
                "total_lines": sum(file_sizes) // 50,
                "avg_file_size": round(sum(file_sizes) / len(file_sizes), 2)
                if file_sizes
                else 0,
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
