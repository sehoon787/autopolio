"""
GitHub Service - Handles GitHub API interactions and repository analysis.
"""
from typing import Dict, List, Any, Optional
import httpx
import re
from datetime import datetime, timezone
from collections import Counter


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
        """Get repository languages with percentages."""
        owner, repo = self._parse_repo_url(git_url)
        languages = await self._request("GET", f"/repos/{owner}/{repo}/languages")

        total = sum(languages.values())
        if total == 0:
            return {}

        return {
            lang: round(bytes_count / total * 100, 2)
            for lang, bytes_count in languages.items()
        }

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

    async def get_repo_stats(
        self,
        git_url: str,
        username: Optional[str] = None,
        max_commits_for_stats: int = 100
    ) -> Dict[str, Any]:
        """Get comprehensive repository statistics including code changes."""
        owner, repo = self._parse_repo_url(git_url)

        # Get commits
        commits = await self.get_commits(git_url, username, per_page=100, max_pages=3)

        total_additions = 0
        total_deletions = 0
        total_files_changed = 0
        files_touched = set()

        # Get detailed stats for recent commits (limited to avoid rate limits)
        commits_to_analyze = commits[:max_commits_for_stats]

        for commit in commits_to_analyze:
            try:
                details = await self.get_commit_details(git_url, commit["sha"])
                total_additions += details.get("additions", 0)
                total_deletions += details.get("deletions", 0)
                for file in details.get("files", []):
                    files_touched.add(file["filename"])
            except Exception:
                continue

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

    async def detect_technologies(self, git_url: str) -> List[str]:
        """Detect technologies used in the repository."""
        owner, repo = self._parse_repo_url(git_url)
        technologies = set()

        # Check for common config files
        files_to_check = [
            # JavaScript / TypeScript
            ("package.json", self._parse_package_json),
            ("tsconfig.json", lambda x: ["TypeScript"]),
            ("tailwind.config.js", lambda x: ["Tailwind CSS"]),
            ("tailwind.config.ts", lambda x: ["Tailwind CSS", "TypeScript"]),
            ("vite.config.js", lambda x: ["Vite"]),
            ("vite.config.ts", lambda x: ["Vite", "TypeScript"]),
            ("next.config.js", lambda x: ["Next.js"]),
            ("next.config.mjs", lambda x: ["Next.js"]),
            ("next.config.ts", lambda x: ["Next.js", "TypeScript"]),
            ("nuxt.config.js", lambda x: ["Nuxt.js"]),
            ("nuxt.config.ts", lambda x: ["Nuxt.js", "TypeScript"]),
            ("svelte.config.js", lambda x: ["Svelte"]),
            ("astro.config.mjs", lambda x: ["Astro"]),
            (".eslintrc", lambda x: ["ESLint"]),
            (".eslintrc.js", lambda x: ["ESLint"]),
            (".eslintrc.json", lambda x: ["ESLint"]),
            ("eslint.config.js", lambda x: ["ESLint"]),
            (".prettierrc", lambda x: ["Prettier"]),
            (".prettierrc.js", lambda x: ["Prettier"]),
            ("prettier.config.js", lambda x: ["Prettier"]),
            ("jest.config.js", lambda x: ["Jest"]),
            ("jest.config.ts", lambda x: ["Jest", "TypeScript"]),
            ("vitest.config.ts", lambda x: ["Vitest", "TypeScript"]),
            ("playwright.config.ts", lambda x: ["Playwright", "TypeScript"]),
            ("cypress.config.js", lambda x: ["Cypress"]),
            ("cypress.config.ts", lambda x: ["Cypress", "TypeScript"]),
            # Python
            ("requirements.txt", self._parse_requirements),
            ("Pipfile", lambda x: ["Python", "Pipenv"]),
            ("pyproject.toml", self._parse_pyproject_toml),
            ("setup.py", lambda x: ["Python", "setuptools"]),
            # Java / Kotlin
            ("pom.xml", self._parse_pom_xml),
            ("build.gradle", self._parse_build_gradle),
            ("build.gradle.kts", self._parse_build_gradle),
            # Flutter / Dart
            ("pubspec.yaml", self._parse_pubspec_yaml),
            # Other Languages
            ("Cargo.toml", lambda x: ["Rust", "Cargo"]),
            ("go.mod", lambda x: ["Go"]),
            ("Gemfile", lambda x: ["Ruby", "Bundler"]),
            ("composer.json", self._parse_composer_json),
            ("Package.swift", lambda x: ["Swift", "SwiftPM"]),
            # DevOps / Infrastructure
            ("Dockerfile", lambda x: ["Docker"]),
            ("docker-compose.yml", lambda x: ["Docker", "Docker Compose"]),
            ("docker-compose.yaml", lambda x: ["Docker", "Docker Compose"]),
            (".github/workflows", lambda x: ["GitHub Actions"]),
            ("Jenkinsfile", lambda x: ["Jenkins"]),
            (".gitlab-ci.yml", lambda x: ["GitLab CI"]),
            ("terraform", lambda x: ["Terraform"]),
            ("kubernetes", lambda x: ["Kubernetes"]),
            ("k8s", lambda x: ["Kubernetes"]),
            ("nginx.conf", lambda x: ["Nginx"]),
        ]

        for filename, parser in files_to_check:
            try:
                content = await self._request(
                    "GET",
                    f"/repos/{owner}/{repo}/contents/{filename}"
                )
                if isinstance(content, dict) and "content" in content:
                    import base64
                    decoded = base64.b64decode(content["content"]).decode("utf-8")
                    detected = parser(decoded)
                    technologies.update(detected)
            except httpx.HTTPStatusError:
                continue
            except Exception:
                continue

        # Add languages
        try:
            languages = await self.get_repo_languages(git_url)
            for lang in languages.keys():
                technologies.add(lang)
        except Exception:
            pass

        return list(technologies)

    def _parse_package_json(self, content: str) -> List[str]:
        """Parse package.json for technologies."""
        import json
        techs = ["Node.js", "npm"]

        try:
            data = json.loads(content)
            deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}

            tech_mapping = {
                # Frameworks
                "react": "React",
                "vue": "Vue.js",
                "@angular/core": "Angular",
                "next": "Next.js",
                "nuxt": "Nuxt.js",
                "svelte": "Svelte",
                "solid-js": "Solid.js",
                "express": "Express.js",
                "fastify": "Fastify",
                "koa": "Koa",
                "nest": "NestJS",
                "hono": "Hono",
                # Language & Build
                "typescript": "TypeScript",
                "vite": "Vite",
                "webpack": "Webpack",
                "esbuild": "esbuild",
                "rollup": "Rollup",
                "parcel": "Parcel",
                "turbopack": "Turbopack",
                # State Management
                "redux": "Redux",
                "@reduxjs/toolkit": "Redux Toolkit",
                "zustand": "Zustand",
                "mobx": "MobX",
                "recoil": "Recoil",
                "jotai": "Jotai",
                "@tanstack/react-query": "TanStack Query",
                "react-query": "React Query",
                "swr": "SWR",
                # Routing
                "react-router": "React Router",
                "react-router-dom": "React Router",
                # Forms & Validation
                "react-hook-form": "React Hook Form",
                "formik": "Formik",
                "zod": "Zod",
                "yup": "Yup",
                "joi": "Joi",
                # HTTP & API
                "axios": "Axios",
                "graphql": "GraphQL",
                "@apollo/client": "Apollo Client",
                "urql": "URQL",
                "trpc": "tRPC",
                # UI Libraries
                "@mui/material": "Material UI",
                "@material-ui": "Material UI",
                "antd": "Ant Design",
                "@chakra-ui": "Chakra UI",
                "@radix-ui": "Radix UI",
                "@headlessui": "Headless UI",
                "tailwindcss": "Tailwind CSS",
                "styled-components": "Styled Components",
                "@emotion": "Emotion",
                "sass": "Sass",
                # Canvas & Graphics
                "fabric": "Fabric.js",
                "three": "Three.js",
                "d3": "D3.js",
                "chart.js": "Chart.js",
                "recharts": "Recharts",
                "echarts": "ECharts",
                "konva": "Konva",
                "pixi": "PixiJS",
                # Testing
                "jest": "Jest",
                "vitest": "Vitest",
                "playwright": "Playwright",
                "cypress": "Cypress",
                "@testing-library": "Testing Library",
                "mocha": "Mocha",
                # Database & ORM
                "prisma": "Prisma",
                "typeorm": "TypeORM",
                "sequelize": "Sequelize",
                "mongoose": "Mongoose",
                "drizzle-orm": "Drizzle ORM",
                # Utilities
                "lodash": "Lodash",
                "dayjs": "Day.js",
                "moment": "Moment.js",
                "date-fns": "date-fns",
                "uuid": "UUID",
                # Real-time & Backend Services
                "socket.io": "Socket.io",
                "firebase": "Firebase",
                "@supabase/supabase-js": "Supabase",
                "pusher": "Pusher",
                # Code Quality
                "eslint": "ESLint",
                "prettier": "Prettier",
                "husky": "Husky",
                # Documentation
                "storybook": "Storybook",
                "docusaurus": "Docusaurus",
            }

            for dep, tech in tech_mapping.items():
                if any(dep in d.lower() for d in deps.keys()):
                    techs.append(tech)

        except json.JSONDecodeError:
            pass

        return techs

    def _parse_requirements(self, content: str) -> List[str]:
        """Parse requirements.txt for technologies."""
        techs = ["Python"]

        tech_mapping = {
            # Web Frameworks
            "django": "Django",
            "djangorestframework": "Django REST Framework",
            "flask": "Flask",
            "fastapi": "FastAPI",
            "starlette": "Starlette",
            "tornado": "Tornado",
            "bottle": "Bottle",
            "sanic": "Sanic",
            # ASGI/WSGI Servers
            "uvicorn": "Uvicorn",
            "gunicorn": "Gunicorn",
            "hypercorn": "Hypercorn",
            # Database & ORM
            "sqlalchemy": "SQLAlchemy",
            "alembic": "Alembic",
            "tortoise-orm": "Tortoise ORM",
            "peewee": "Peewee",
            "psycopg2": "PostgreSQL",
            "psycopg": "PostgreSQL",
            "asyncpg": "PostgreSQL",
            "pymysql": "MySQL",
            "mysql-connector": "MySQL",
            "motor": "MongoDB",
            "pymongo": "MongoDB",
            "aiosqlite": "SQLite",
            "redis": "Redis",
            "aioredis": "Redis",
            # Data Science & ML
            "pandas": "Pandas",
            "numpy": "NumPy",
            "scipy": "SciPy",
            "scikit-learn": "scikit-learn",
            "sklearn": "scikit-learn",
            "matplotlib": "Matplotlib",
            "seaborn": "Seaborn",
            "plotly": "Plotly",
            "tensorflow": "TensorFlow",
            "keras": "Keras",
            "torch": "PyTorch",
            "pytorch": "PyTorch",
            "transformers": "Hugging Face Transformers",
            "langchain": "LangChain",
            "openai": "OpenAI",
            "anthropic": "Anthropic",
            # Document Processing
            "openpyxl": "openpyxl",
            "xlrd": "xlrd",
            "xlsxwriter": "XlsxWriter",
            "python-docx": "python-docx",
            "reportlab": "ReportLab",
            "pypdf2": "PyPDF2",
            "pypdf": "pypdf",
            "python-pptx": "python-pptx",
            "pdfplumber": "pdfplumber",
            # Async & HTTP
            "aiohttp": "aiohttp",
            "httpx": "httpx",
            "requests": "Requests",
            "urllib3": "urllib3",
            # Authentication & Security
            "pyjwt": "PyJWT",
            "python-jose": "python-jose",
            "passlib": "Passlib",
            "bcrypt": "bcrypt",
            "cryptography": "Cryptography",
            # Testing
            "pytest": "pytest",
            "pytest-asyncio": "pytest-asyncio",
            "coverage": "Coverage",
            "tox": "Tox",
            "unittest": "unittest",
            "hypothesis": "Hypothesis",
            # Task Queue
            "celery": "Celery",
            "rq": "RQ",
            "dramatiq": "Dramatiq",
            # Configuration
            "python-dotenv": "python-dotenv",
            "pydantic": "Pydantic",
            "pydantic-settings": "Pydantic Settings",
            "pyyaml": "PyYAML",
            "toml": "TOML",
            # CLI
            "click": "Click",
            "typer": "Typer",
            "argparse": "argparse",
            # Web Scraping
            "beautifulsoup4": "BeautifulSoup",
            "bs4": "BeautifulSoup",
            "scrapy": "Scrapy",
            "selenium": "Selenium",
            "playwright": "Playwright",
            # Image Processing
            "pillow": "Pillow",
            "opencv-python": "OpenCV",
            "cv2": "OpenCV",
            # AWS & Cloud
            "boto3": "AWS SDK",
            "google-cloud": "Google Cloud",
            "azure": "Azure SDK",
        }

        for line in content.lower().split("\n"):
            for dep, tech in tech_mapping.items():
                if dep in line:
                    techs.append(tech)

        return techs

    def _parse_pyproject_toml(self, content: str) -> List[str]:
        """Parse pyproject.toml for Python technologies."""
        techs = ["Python"]

        # Check for build system
        if "poetry" in content.lower():
            techs.append("Poetry")
        if "setuptools" in content.lower():
            techs.append("setuptools")
        if "flit" in content.lower():
            techs.append("Flit")
        if "hatch" in content.lower():
            techs.append("Hatch")

        tech_mapping = {
            # Web Frameworks
            "django": "Django",
            "flask": "Flask",
            "fastapi": "FastAPI",
            "starlette": "Starlette",
            # Database
            "sqlalchemy": "SQLAlchemy",
            "alembic": "Alembic",
            "psycopg": "PostgreSQL",
            "asyncpg": "PostgreSQL",
            # Data Science
            "pandas": "Pandas",
            "numpy": "NumPy",
            "scipy": "SciPy",
            "scikit-learn": "scikit-learn",
            "tensorflow": "TensorFlow",
            "torch": "PyTorch",
            # Testing
            "pytest": "pytest",
            "coverage": "Coverage",
            # Others
            "pydantic": "Pydantic",
            "httpx": "httpx",
            "aiohttp": "aiohttp",
            "celery": "Celery",
            "redis": "Redis",
        }

        content_lower = content.lower()
        for dep, tech in tech_mapping.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

    def _parse_composer_json(self, content: str) -> List[str]:
        """Parse composer.json for PHP technologies."""
        import json
        techs = ["PHP", "Composer"]

        try:
            data = json.loads(content)
            deps = {**data.get("require", {}), **data.get("require-dev", {})}

            tech_mapping = {
                "laravel/framework": "Laravel",
                "symfony/": "Symfony",
                "slim/slim": "Slim",
                "codeigniter": "CodeIgniter",
                "yiisoft": "Yii",
                "cakephp": "CakePHP",
                "doctrine/orm": "Doctrine ORM",
                "eloquent": "Eloquent",
                "phpunit": "PHPUnit",
                "pestphp": "Pest",
                "guzzlehttp": "Guzzle",
                "monolog": "Monolog",
                "twig": "Twig",
                "blade": "Blade",
                "livewire": "Livewire",
                "inertiajs": "Inertia.js",
                "filament": "Filament",
            }

            for dep, tech in tech_mapping.items():
                if any(dep in d.lower() for d in deps.keys()):
                    techs.append(tech)

        except json.JSONDecodeError:
            pass

        return techs

    def _parse_pom_xml(self, content: str) -> List[str]:
        """Parse pom.xml for Java/Spring technologies."""
        techs = ["Java", "Maven"]

        tech_mapping = {
            # Spring Framework
            "spring-boot": "Spring Boot",
            "spring-boot-starter-web": "Spring Web",
            "spring-boot-starter-data-jpa": "Spring Data JPA",
            "spring-boot-starter-security": "Spring Security",
            "spring-boot-starter-test": "Spring Test",
            "spring-boot-starter-actuator": "Spring Actuator",
            "spring-boot-starter-validation": "Spring Validation",
            "spring-cloud": "Spring Cloud",
            "spring-kafka": "Spring Kafka",
            "spring-boot-starter-webflux": "Spring WebFlux",
            # ORM & Database
            "hibernate": "Hibernate",
            "mybatis": "MyBatis",
            "postgresql": "PostgreSQL",
            "mysql-connector": "MySQL",
            "h2": "H2 Database",
            "flyway": "Flyway",
            "liquibase": "Liquibase",
            # Utilities
            "lombok": "Lombok",
            "mapstruct": "MapStruct",
            "jackson": "Jackson",
            "gson": "Gson",
            # Testing
            "junit": "JUnit",
            "mockito": "Mockito",
            "testcontainers": "Testcontainers",
            # API Documentation
            "springdoc": "SpringDoc OpenAPI",
            "swagger": "Swagger",
            # Messaging
            "kafka": "Kafka",
            "rabbitmq": "RabbitMQ",
            # Security
            "oauth2": "OAuth2",
            "jwt": "JWT",
        }

        content_lower = content.lower()
        for dep, tech in tech_mapping.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

    def _parse_build_gradle(self, content: str) -> List[str]:
        """Parse build.gradle for Java/Kotlin technologies."""
        techs = ["Gradle"]

        # Check for Kotlin
        if "kotlin" in content.lower():
            techs.append("Kotlin")
        else:
            techs.append("Java")

        tech_mapping = {
            # Spring Framework
            "spring-boot": "Spring Boot",
            "spring-boot-starter-web": "Spring Web",
            "spring-data-jpa": "Spring Data JPA",
            "spring-security": "Spring Security",
            # ORM & Database
            "hibernate": "Hibernate",
            "mybatis": "MyBatis",
            "postgresql": "PostgreSQL",
            "mysql": "MySQL",
            "h2": "H2 Database",
            "flyway": "Flyway",
            "liquibase": "Liquibase",
            "exposed": "Exposed (Kotlin)",
            # Utilities
            "lombok": "Lombok",
            "mapstruct": "MapStruct",
            "jackson": "Jackson",
            # Testing
            "junit": "JUnit",
            "mockito": "Mockito",
            "kotest": "Kotest",
            "mockk": "MockK",
            # Kotlin specific
            "ktor": "Ktor",
            "kotlinx-coroutines": "Kotlin Coroutines",
            "kotlinx-serialization": "Kotlin Serialization",
        }

        content_lower = content.lower()
        for dep, tech in tech_mapping.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

    def _parse_pubspec_yaml(self, content: str) -> List[str]:
        """Parse pubspec.yaml for Flutter/Dart technologies."""
        techs = ["Dart", "Flutter"]

        tech_mapping = {
            # State Management
            "provider": "Provider",
            "riverpod": "Riverpod",
            "flutter_bloc": "Bloc",
            "bloc": "Bloc",
            "getx": "GetX",
            "get:": "GetX",
            "mobx": "MobX",
            # Firebase
            "firebase_core": "Firebase",
            "firebase_auth": "Firebase Auth",
            "cloud_firestore": "Cloud Firestore",
            "firebase_storage": "Firebase Storage",
            "firebase_messaging": "Firebase Messaging",
            # Networking
            "dio": "Dio",
            "http:": "HTTP",
            "retrofit": "Retrofit",
            "chopper": "Chopper",
            # Local Storage
            "shared_preferences": "Shared Preferences",
            "hive": "Hive",
            "sqflite": "SQFlite",
            "isar": "Isar",
            "drift": "Drift",
            # UI
            "flutter_hooks": "Flutter Hooks",
            "cached_network_image": "Cached Network Image",
            "flutter_svg": "Flutter SVG",
            # Navigation
            "go_router": "Go Router",
            "auto_route": "Auto Route",
            # Testing
            "flutter_test": "Flutter Test",
            "mockito": "Mockito",
            "bloc_test": "Bloc Test",
            # Code Generation
            "freezed": "Freezed",
            "json_serializable": "JSON Serializable",
            "build_runner": "Build Runner",
        }

        content_lower = content.lower()
        for dep, tech in tech_mapping.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

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

    async def generate_detailed_content(
        self,
        project_data: Dict[str, Any],
        analysis_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate detailed content using LLM."""
        from api.services.llm_service import LLMService
        from api.config import get_settings
        import json

        settings = get_settings()

        # Check if LLM is configured
        if not settings.llm_provider:
            return {}

        try:
            llm = LLMService(settings.llm_provider)
        except ValueError:
            # LLM not configured
            return {}

        result = {}

        # 1. Generate implementation details
        try:
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

            impl_response = await llm.provider.generate(
                implementation_prompt,
                system_prompt="당신은 소프트웨어 프로젝트를 분석하는 기술 전문가입니다. 커밋 메시지와 기술 스택을 바탕으로 실제 구현된 기능을 구조화합니다.",
                max_tokens=2000,
                temperature=0.3
            )

            # Parse JSON response
            json_str = impl_response
            if "```json" in impl_response:
                json_str = impl_response.split("```json")[1].split("```")[0]
            elif "```" in impl_response:
                json_str = impl_response.split("```")[1].split("```")[0]

            result["implementation_details"] = json.loads(json_str.strip())
        except Exception as e:
            print(f"Failed to generate implementation_details: {e}")
            result["implementation_details"] = []

        # 2. Generate development timeline
        try:
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

            timeline_response = await llm.provider.generate(
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

            result["development_timeline"] = json.loads(json_str.strip())
        except Exception as e:
            print(f"Failed to generate development_timeline: {e}")
            result["development_timeline"] = []

        # 3. Generate detailed achievements
        try:
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

            achievements_response = await llm.provider.generate(
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

            result["detailed_achievements"] = json.loads(json_str.strip())
        except Exception as e:
            print(f"Failed to generate detailed_achievements: {e}")
            result["detailed_achievements"] = {}

        return result
