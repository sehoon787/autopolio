"""GitHub repository endpoints.

Handles repository listing, info, file tree, and technology detection.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from api.database import get_db
from api.models.user import User
from api.schemas.github import GitHubRepoListResponse
from api.services.github import GitHubService
from api.services.github.github_exceptions import (
    GitHubServiceError,
    GitHubRateLimitError,
    GitHubNotFoundError,
    GitHubTimeoutError,
    GitHubAuthError,
)
from api.services.core import EncryptionService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["github"])
encryption = EncryptionService()


@router.get("/repos", response_model=GitHubRepoListResponse)
async def get_user_repos(
    user_id: int = Query(..., description="User ID"),
    page: int = Query(1, description="Page number (ignored if fetch_all=true)"),
    per_page: int = Query(100, description="Items per page (ignored if fetch_all=true)"),
    fetch_all: bool = Query(True, description="Fetch all repositories"),
    db: AsyncSession = Depends(get_db)
):
    """Get user's GitHub repositories."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    if fetch_all:
        repos = await github_service.get_all_user_repos()
    else:
        repos = await github_service.get_user_repos(page=page, per_page=per_page)

    return {
        "repos": repos,
        "total": len(repos),
        "page": page if not fetch_all else 1,
        "per_page": per_page if not fetch_all else len(repos),
        "has_more": False if fetch_all else len(repos) == per_page
    }


@router.get("/repo-info")
async def get_repo_quick_info(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    db: AsyncSession = Depends(get_db)
):
    """Get quick repository info for auto-fill (without full analysis)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        info = await github_service.get_quick_repo_info(git_url, user.github_username)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch repo info: {str(e)}")


@router.get("/file-tree")
async def get_file_tree(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    path: str = Query("", description="Path within repository"),
    ref: Optional[str] = Query(None, description="Branch, tag, or commit SHA"),
    recursive: bool = Query(False, description="Get full tree recursively"),
    db: AsyncSession = Depends(get_db)
):
    """Get file tree for a GitHub repository."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        files = await github_service.get_file_tree(git_url, path, ref, recursive)
        return {"files": files, "path": path, "git_url": git_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get file tree: {str(e)}")


@router.get("/file-content")
async def get_file_content(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    file_path: str = Query(..., description="Path to file within repository"),
    ref: Optional[str] = Query(None, description="Branch, tag, or commit SHA"),
    db: AsyncSession = Depends(get_db)
):
    """Get content of a specific file from a GitHub repository."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    token = encryption.decrypt(user.github_token_encrypted)
    github_service = GitHubService(token)

    try:
        content = await github_service.get_file_content(git_url, file_path, ref)
        return content
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get file content: {str(e)}")


@router.get("/detect-technologies")
async def detect_technologies(
    user_id: int = Query(..., description="User ID"),
    git_url: str = Query(..., description="GitHub repository URL"),
    db: AsyncSession = Depends(get_db)
):
    """Detect technologies used in a repository (no LLM, fast)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.github_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub is not connected")

    try:
        token = encryption.decrypt(user.github_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="GitHub token is corrupted. Please reconnect.")

    github_service = GitHubService(token)

    try:
        technologies = await github_service.detect_technologies(git_url)
        return {"technologies": technologies}
    except GitHubTimeoutError as e:
        raise HTTPException(status_code=504, detail=e.message)
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=e.message)
    except GitHubNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Repository not found: {git_url}")
    except GitHubAuthError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except GitHubServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid GitHub URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Technology detection failed: {str(e)}")
