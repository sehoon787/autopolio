"""
Technology Detection Service - Detect technologies from package/config files.

Extracted from github_service.py for better modularity and reusability.
"""
import json
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)


# Technology mapping for JavaScript/TypeScript (package.json)
PACKAGE_JSON_TECH_MAPPING: Dict[str, str] = {
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

# Technology mapping for Python (requirements.txt)
REQUIREMENTS_TECH_MAPPING: Dict[str, str] = {
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

# Technology mapping for pyproject.toml
PYPROJECT_TECH_MAPPING: Dict[str, str] = {
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

# Technology mapping for PHP (composer.json)
COMPOSER_TECH_MAPPING: Dict[str, str] = {
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

# Technology mapping for Java/Maven (pom.xml)
POM_XML_TECH_MAPPING: Dict[str, str] = {
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

# Technology mapping for Gradle (build.gradle)
BUILD_GRADLE_TECH_MAPPING: Dict[str, str] = {
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

# Technology mapping for Flutter/Dart (pubspec.yaml)
PUBSPEC_TECH_MAPPING: Dict[str, str] = {
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


class TechnologyDetectionService:
    """Service for detecting technologies from package/config files."""

    @staticmethod
    def parse_package_json(content: str) -> List[str]:
        """Parse package.json for technologies."""
        techs = ["Node.js", "npm"]

        try:
            data = json.loads(content)
            deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}

            for dep, tech in PACKAGE_JSON_TECH_MAPPING.items():
                if any(dep in d.lower() for d in deps.keys()):
                    techs.append(tech)

        except json.JSONDecodeError:
            logger.debug("Failed to parse package.json")

        return techs

    @staticmethod
    def parse_requirements(content: str) -> List[str]:
        """Parse requirements.txt for technologies."""
        techs = ["Python"]

        for line in content.lower().split("\n"):
            for dep, tech in REQUIREMENTS_TECH_MAPPING.items():
                if dep in line:
                    techs.append(tech)

        return techs

    @staticmethod
    def parse_pyproject_toml(content: str) -> List[str]:
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

        content_lower = content.lower()
        for dep, tech in PYPROJECT_TECH_MAPPING.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

    @staticmethod
    def parse_composer_json(content: str) -> List[str]:
        """Parse composer.json for PHP technologies."""
        techs = ["PHP", "Composer"]

        try:
            data = json.loads(content)
            deps = {**data.get("require", {}), **data.get("require-dev", {})}

            for dep, tech in COMPOSER_TECH_MAPPING.items():
                if any(dep in d.lower() for d in deps.keys()):
                    techs.append(tech)

        except json.JSONDecodeError:
            logger.debug("Failed to parse composer.json")

        return techs

    @staticmethod
    def parse_pom_xml(content: str) -> List[str]:
        """Parse pom.xml for Java/Spring technologies."""
        techs = ["Java", "Maven"]

        content_lower = content.lower()
        for dep, tech in POM_XML_TECH_MAPPING.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

    @staticmethod
    def parse_build_gradle(content: str) -> List[str]:
        """Parse build.gradle for Java/Kotlin technologies."""
        techs = ["Gradle"]

        # Check for Kotlin
        if "kotlin" in content.lower():
            techs.append("Kotlin")
        else:
            techs.append("Java")

        content_lower = content.lower()
        for dep, tech in BUILD_GRADLE_TECH_MAPPING.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

    @staticmethod
    def parse_pubspec_yaml(content: str) -> List[str]:
        """Parse pubspec.yaml for Flutter/Dart technologies."""
        techs = ["Dart", "Flutter"]

        content_lower = content.lower()
        for dep, tech in PUBSPEC_TECH_MAPPING.items():
            if dep in content_lower:
                techs.append(tech)

        return techs

    @classmethod
    def get_parser_for_file(cls, filename: str):
        """Get the appropriate parser function for a given filename.

        Returns:
            A callable that takes content string and returns List[str] of technologies,
            or None if no parser exists for the file.
        """
        parsers = {
            "package.json": cls.parse_package_json,
            "requirements.txt": cls.parse_requirements,
            "pyproject.toml": cls.parse_pyproject_toml,
            "composer.json": cls.parse_composer_json,
            "pom.xml": cls.parse_pom_xml,
            "build.gradle": cls.parse_build_gradle,
            "build.gradle.kts": cls.parse_build_gradle,
            "pubspec.yaml": cls.parse_pubspec_yaml,
        }
        return parsers.get(filename)
