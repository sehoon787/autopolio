"""
Contribution Analyzer - User contribution analysis for GitHub repositories.

Extracted from github_service.py for better modularity.
Contains methods for analyzing user contributions with code diffs.
"""
import asyncio
import logging
from typing import Dict, List, Any, Optional
from collections import Counter

from api.services.github.github_constants import (
    MAX_CONCURRENT_COMMIT_DETAILS,
    MAX_DETAILED_COMMITS,
    parse_iso_datetime,
)
from .contributor_analyzer import (
    parse_conventional_commit,
    detect_work_areas,
    extract_file_extensions,
    detect_technologies_from_files,
)

logger = logging.getLogger(__name__)


class ContributionAnalyzer:
    """Analyzes user contributions to a GitHub repository."""

    def __init__(self, api_client):
        """
        Args:
            api_client: GitHubApiClient instance
        """
        self.api = api_client

    def calculate_contribution_percent(
        self,
        user_commits: int,
        total_commits: int,
        user_lines_added: int,
        total_lines_added: int,
        work_areas: Optional[List[str]] = None
    ) -> int:
        """
        Calculate weighted contribution percentage.

        Weights:
        - Commit count: 40%
        - Lines of code: 40%
        - Work area diversity: 20%

        Args:
            user_commits: Number of commits by the user
            total_commits: Total commits in the repository
            user_lines_added: Lines added by the user
            total_lines_added: Total lines added in the repository
            work_areas: List of work areas the user contributed to

        Returns:
            Contribution percentage (0-100)
        """
        # Commit score (40%)
        commit_score = 0
        if total_commits > 0:
            commit_score = (user_commits / total_commits) * 100

        # Line score (40%)
        line_score = 0
        if total_lines_added > 0:
            line_score = (user_lines_added / total_lines_added) * 100

        # Work area diversity score (20%)
        area_score = 0
        if work_areas:
            area_count = len(work_areas)
            area_score = min(area_count * 15, 100)

        # Weighted average
        weighted = (commit_score * 0.4) + (line_score * 0.4) + (area_score * 0.2)

        return min(max(round(weighted), 0), 100)

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
        commits = await self.api.get_commits(
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

        commits_to_analyze = commits[:min(MAX_DETAILED_COMMITS, len(commits))]
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)
        tasks = [
            self.api._get_commit_details_safe(semaphore, git_url, c["sha"])
            for c in commits_to_analyze
        ]
        detailed_results = await asyncio.gather(*tasks, return_exceptions=True)

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

            for f in result.get("files", []):
                all_files.append(f.get("filename", ""))

            parsed = parse_conventional_commit(commit["commit"]["message"])
            commit_types[parsed["type"]] += 1

            full_message = commit["commit"]["message"]
            short_message = full_message.split('\n')[0][:100]
            detailed_commits.append({
                "sha": commit["sha"],
                "short_sha": commit["sha"][:7],
                "message": short_message,
                "full_message": full_message if len(full_message) > 100 else None,
                "author": commit["commit"]["author"]["name"],
                "author_email": commit["commit"]["author"].get("email"),
                "date": commit["commit"]["author"]["date"],
                "commit_type": parsed["type"],
                "type_label": parsed["type_label"],
                "scope": parsed["scope"],
                "description": parsed.get("description") or short_message,
                "is_breaking": parsed.get("is_breaking", False),
                "files_changed": result.get("files_changed", 0),
                "lines_added": result.get("additions", 0),
                "lines_deleted": result.get("deletions", 0),
                "work_areas": detect_work_areas([f.get("filename", "") for f in result.get("files", [])]),
            })

        work_areas = detect_work_areas(all_files)
        file_extensions = extract_file_extensions(all_files)
        technologies = detect_technologies_from_files(all_files)

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
            "detailed_commits": detailed_commits[:MAX_DETAILED_COMMITS],
            "commit_types": dict(commit_types),
        }

    async def get_user_code_contributions(
        self,
        git_url: str,
        username: str,
        max_commits: int = 30,
        max_total_patch_size: int = 50000
    ) -> Dict[str, Any]:
        """Get user's significant code contributions with actual code diffs for LLM analysis.

        Args:
            git_url: GitHub repository URL
            username: GitHub username to analyze
            max_commits: Maximum number of commits to analyze
            max_total_patch_size: Maximum total patch size in characters

        Returns:
            Dict with contributions, summary, technologies
        """
        logger.info(f"Collecting code contributions for {username} from {git_url}")

        commits = await self.api.get_commits(
            git_url,
            author=username,
            per_page=100,
            max_pages=1
        )

        if not commits:
            return {
                "username": username,
                "contributions": [],
                "summary": {
                    "total_commits": 0,
                    "analyzed_commits": 0,
                    "lines_added": 0,
                    "lines_deleted": 0,
                    "files_changed": 0,
                },
                "technologies": [],
                "work_areas": [],
            }

        commits_to_analyze = commits[:max_commits]

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)
        tasks = [
            self.api._get_commit_details_with_patch(semaphore, git_url, c["sha"])
            for c in commits_to_analyze
        ]
        detailed_results = await asyncio.gather(*tasks, return_exceptions=True)

        contributions: List[Dict[str, Any]] = []
        total_additions = 0
        total_deletions = 0
        all_files: List[str] = []
        current_patch_size = 0

        for i, result in enumerate(detailed_results):
            if isinstance(result, Exception):
                continue

            commit = commits_to_analyze[i]
            message = commit["commit"]["message"]

            parsed = parse_conventional_commit(message)

            commit_patches = []
            commit_patch_size = 0
            for f in result.get("files", []):
                patch = f.get("patch", "")
                filename = f.get("filename", "")
                all_files.append(filename)

                if current_patch_size + len(patch) <= max_total_patch_size:
                    if patch:
                        commit_patches.append({
                            "filename": filename,
                            "additions": f.get("additions", 0),
                            "deletions": f.get("deletions", 0),
                            "status": f.get("status", "modified"),
                            "patch": patch
                        })
                        commit_patch_size += len(patch)

            current_patch_size += commit_patch_size

            contribution = {
                "sha": commit["sha"][:7],
                "message": message.split('\n')[0][:200],
                "full_message": message[:500] if len(message) <= 500 else message[:500] + "...",
                "author": commit["commit"]["author"]["name"],
                "date": commit["commit"]["author"]["date"],
                "commit_type": parsed["type"],
                "type_label": parsed["type_label"],
                "scope": parsed["scope"],
                "stats": {
                    "additions": result.get("additions", 0),
                    "deletions": result.get("deletions", 0),
                    "files_changed": result.get("files_changed", 0),
                },
                "files": commit_patches,
            }

            contributions.append(contribution)
            total_additions += result.get("additions", 0)
            total_deletions += result.get("deletions", 0)

            if current_patch_size >= max_total_patch_size:
                logger.info(f"Reached patch size limit at commit {i+1}/{len(commits_to_analyze)}")
                break

        work_areas = detect_work_areas(all_files)
        technologies = detect_technologies_from_files(all_files)

        return {
            "username": username,
            "contributions": contributions,
            "summary": {
                "total_commits": len(commits),
                "analyzed_commits": len(contributions),
                "lines_added": total_additions,
                "lines_deleted": total_deletions,
                "files_changed": len(set(all_files)),
            },
            "technologies": technologies,
            "work_areas": work_areas,
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
        commits = await self.api.get_commits(
            git_url,
            author=author,
            per_page=min(100, limit),
            max_pages=max(1, limit // 100)
        )

        commits_to_analyze = commits[:limit]

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)
        tasks = [
            self.api._get_commit_details_safe(semaphore, git_url, c["sha"])
            for c in commits_to_analyze
        ]
        details = await asyncio.gather(*tasks, return_exceptions=True)

        result = []
        for i, commit in enumerate(commits_to_analyze):
            detail = details[i] if not isinstance(details[i], Exception) else {}

            parsed = parse_conventional_commit(commit["commit"]["message"])

            files = detail.get("files", []) if isinstance(detail, dict) else []
            file_paths = [f.get("filename", "") for f in files]
            work_areas = detect_work_areas(file_paths)

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
