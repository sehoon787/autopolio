"""Routers module.

Exports all routers for use in main.py.
Feature directories (github/, documents/) export their aggregated routers.

Usage:
    from api.routers import github, documents, users, ...
    app.include_router(github.router, prefix="/api/github")
"""
