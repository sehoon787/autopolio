# AI PR Review Guide

This document provides guidance for using AI tools (Claude Code, GitHub Copilot) to review PRs in the Autopolio project.

## Quick Review Prompt

```
Review this PR diff for:
1. Security issues (hardcoded secrets, injection, XSS)
2. Breaking changes to API endpoints or database schema
3. Missing error handling
4. Performance concerns (N+1 queries, unnecessary re-renders)
5. Version sync (pyproject.toml, api/__init__.py, frontend/package.json)
```

## Checklist for Reviewers

### Backend (Python/FastAPI)
- [ ] SQLAlchemy queries use `selectinload` for relationships
- [ ] Async sessions use `expire_on_commit=False` where needed
- [ ] No `lazy load` in async context (causes greenlet_spawn)
- [ ] Input validation with Pydantic schemas
- [ ] Proper error handling with HTTPException

### Frontend (React/TypeScript)
- [ ] No direct state mutation (use immutable patterns)
- [ ] TanStack Query for server state
- [ ] Zustand for client state
- [ ] i18n keys used (not hardcoded strings)
- [ ] Tailwind CSS classes (no inline styles)

### Electron
- [ ] Features gated by `window.electronAPI` check
- [ ] No Node.js APIs in renderer process
- [ ] IPC calls properly handled

### CI/CD
- [ ] Composite actions used where applicable
- [ ] Secrets referenced conditionally (`if: secrets.X != ''`)
- [ ] Artifacts uploaded with retention-days

## Running a Review with Claude Code

```bash
# Review the current branch diff against main
claude -p "Review the diff from 'git diff main...HEAD' for the Autopolio project. Focus on security, breaking changes, and code quality."
```
