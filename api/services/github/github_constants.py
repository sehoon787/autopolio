"""
GitHub Service Constants and Utilities.

Extracted from github_service.py for better modularity.
Contains:
- Concurrency limits
- Work area patterns for file categorization
- Conventional commit type mappings
- Utility functions
"""

from datetime import datetime
from typing import Dict, List, Optional, Tuple


# =============================================================================
# Concurrency Limits
# =============================================================================

# GitHub API parallel file checks
MAX_CONCURRENT_FILE_CHECKS = 15

# Commit details fetching
MAX_CONCURRENT_COMMIT_DETAILS = 10

# LLM API calls
MAX_CONCURRENT_LLM_CALLS = 3

# Extended analysis limits
MAX_DETAILED_COMMITS = 50  # Maximum commits to store in detailed analysis


# =============================================================================
# Work Area Patterns
# =============================================================================

# Patterns for detecting what areas of codebase a contributor worked on
WORK_AREA_PATTERNS: Dict[str, List[str]] = {
    "frontend": [
        "src/components",
        "src/pages",
        "src/views",
        "frontend/",
        "client/",
        "web/",
        "app/",
        "*.tsx",
        "*.jsx",
        "*.vue",
        "*.svelte",
        "components/",
        "pages/",
        "views/",
        "layouts/",
        "hooks/",
        "stores/",
    ],
    "backend": [
        "api/",
        "server/",
        "backend/",
        "src/services",
        "services/",
        "controllers/",
        "routes/",
        "routers/",
        "handlers/",
        "*.py",
        "*.go",
        "*.java",
        "*.rs",
        "*.rb",
    ],
    "tests": [
        "tests/",
        "test/",
        "__tests__/",
        "spec/",
        "specs/",
        "*.test.*",
        "*.spec.*",
        "*_test.*",
        "*_spec.*",
        "testing/",
        "e2e/",
        "integration/",
    ],
    "devops": [
        "Dockerfile",
        "docker-compose",
        ".github/",
        "ci/",
        "cd/",
        ".gitlab-ci",
        "Jenkinsfile",
        "terraform/",
        "ansible/",
        "kubernetes/",
        "k8s/",
        "helm/",
        "scripts/",
        "deploy/",
    ],
    "docs": [
        "docs/",
        "documentation/",
        "*.md",
        "README",
        "CHANGELOG",
        "*.rst",
        "*.txt",
        "wiki/",
        "guides/",
    ],
    "database": [
        "migrations/",
        "models/",
        "*.sql",
        "schema/",
        "seeds/",
        "fixtures/",
        "db/",
        "database/",
        "prisma/",
        "drizzle/",
    ],
    "config": [
        "config/",
        ".env",
        "*.config.*",
        "*.conf",
        "settings/",
        "*.yaml",
        "*.yml",
        "*.json",
        "*.toml",
    ],
}


# =============================================================================
# Conventional Commit Types
# =============================================================================

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


# =============================================================================
# Extension to Technology Mappings
# =============================================================================

# File extension to technology mapping
EXT_TECH_MAP: Dict[str, str] = {
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
PATH_TECH_MAP: Dict[str, str] = {
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


# =============================================================================
# Utility Functions
# =============================================================================


def parse_iso_datetime(date_str: Optional[str]) -> Optional[datetime]:
    """Parse ISO 8601 datetime string to datetime object.

    Args:
        date_str: ISO 8601 formatted datetime string (e.g., "2024-01-15T10:30:00Z")

    Returns:
        datetime object or None if parsing fails
    """
    if not date_str:
        return None
    try:
        # Handle 'Z' suffix by replacing with '+00:00'
        if date_str.endswith("Z"):
            date_str = date_str[:-1] + "+00:00"
        dt = datetime.fromisoformat(date_str)
        # Strip timezone info for TIMESTAMP WITHOUT TIME ZONE columns (PostgreSQL)
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        return None


async def call_llm_generate(
    llm_service,
    prompt: str,
    system_prompt: str = "",
    max_tokens: int = 1000,
    temperature: float = 0.3,
) -> Tuple[str, int]:
    """
    Call LLM generate method, handling both LLMService (has provider) and CLILLMService.

    Args:
        llm_service: Either LLMService or CLILLMService instance
        prompt: The prompt to send to the LLM
        system_prompt: System prompt for context
        max_tokens: Maximum tokens in response
        temperature: Temperature for generation

    Returns:
        Tuple of (response text, token count)
    """
    if hasattr(llm_service, "provider"):
        # API-based LLM service (OpenAI, Anthropic, Gemini)
        return await llm_service.provider.generate(
            prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    else:
        # CLI-based LLM service (Claude Code CLI, Gemini CLI)
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        return await llm_service.generate_with_cli(full_prompt)
