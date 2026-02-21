"""GitHub router facade.

This module aggregates all GitHub-related sub-routers into a single router.
Each sub-router handles a specific domain of GitHub functionality.

Sub-routers:
- github_oauth: OAuth flow, connection status, token management
- github_repos: Repository listing, info, file tree, technology detection
- github_analysis: Repository analysis, AI description generation
- github_batch: Bulk import and batch analysis
- github_jobs: Background analysis jobs, status tracking
- github_edits: Inline editing of analysis content
- github_contributor: Contributor analysis, code quality, detailed commits
"""
from fastapi import APIRouter

from .github_oauth import router as oauth_router
from .github_repos import router as repos_router
from .github_analysis import router as analysis_router
from .github_batch import router as batch_router
from .github_jobs import router as jobs_router
from .github_edits import router as edits_router
from .github_contributor import router as contributor_router

# Create main router
router = APIRouter()

# Include all sub-routers
# OAuth endpoints: /connect, /callback, /status, /disconnect, /save-token
router.include_router(oauth_router)

# Repository endpoints: /repos, /repo-info, /file-tree, /file-content, /detect-technologies
router.include_router(repos_router)

# Analysis endpoints: /analyze, /analysis/{project_id}, /generate-description, /test-llm, /test-cli
router.include_router(analysis_router)

# Batch endpoints: /import-repos, /analyze-batch
router.include_router(batch_router)

# Job endpoints: /analyze-background, /active-analyses, /analysis-status/{project_id}, /analysis/{project_id}/cancel, /job/{task_id}
router.include_router(jobs_router)

# Edit endpoints: /analysis/{project_id}/effective, /analysis/{project_id}/content, /analysis/{project_id}/reset/{field}
router.include_router(edits_router)

# Contributor endpoints: /contributors/{project_id}, /contributor-analysis/{project_id}, /code-quality/{project_id}, /detailed-commits/{project_id}
router.include_router(contributor_router)
