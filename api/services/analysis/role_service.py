"""
Role Service - Detects developer roles from project data.

Analyzes technologies, commit messages, and file patterns to determine
the developer's primary role in a project.
"""

from typing import Dict, List, Any, Tuple
import re


class RoleService:
    """Service for detecting developer roles from project analysis data."""

    # Technology-to-role mappings
    TECH_ROLE_MAPPING = {
        "backend": [
            # Languages
            "python",
            "java",
            "kotlin",
            "go",
            "golang",
            "rust",
            "c#",
            "csharp",
            "php",
            "ruby",
            "scala",
            "elixir",
            "erlang",
            # Frameworks
            "fastapi",
            "django",
            "flask",
            "spring",
            "spring boot",
            "express",
            "nestjs",
            "laravel",
            "rails",
            "ruby on rails",
            "gin",
            "echo",
            "actix",
            "axum",
            "asp.net",
            ".net core",
            "grpc",
            # Databases
            "postgresql",
            "postgres",
            "mysql",
            "mariadb",
            "mongodb",
            "redis",
            "elasticsearch",
            "cassandra",
            "dynamodb",
            "sqlite",
            "oracle",
            "sql server",
            "neo4j",
            "graphql",
            "prisma",
            # Tools
            "celery",
            "rabbitmq",
            "kafka",
            "nginx",
            "apache",
        ],
        "frontend": [
            # Languages/Core
            "javascript",
            "typescript",
            "html",
            "css",
            "sass",
            "scss",
            "less",
            # Frameworks/Libraries
            "react",
            "react.js",
            "reactjs",
            "vue",
            "vue.js",
            "vuejs",
            "angular",
            "angularjs",
            "svelte",
            "solid",
            "preact",
            "next.js",
            "nextjs",
            "nuxt",
            "nuxt.js",
            "gatsby",
            "remix",
            "astro",
            # UI Libraries
            "tailwind",
            "tailwindcss",
            "bootstrap",
            "material-ui",
            "mui",
            "chakra",
            "antd",
            "ant design",
            "styled-components",
            "emotion",
            "shadcn",
            "radix",
            # State Management
            "redux",
            "mobx",
            "zustand",
            "recoil",
            "jotai",
            "pinia",
            "vuex",
            # Tools
            "webpack",
            "vite",
            "esbuild",
            "rollup",
            "parcel",
            "babel",
            "storybook",
            "jest",
            "vitest",
            "cypress",
            "playwright",
        ],
        "fullstack": [
            "full-stack",
            "fullstack",
            "full stack",
            "mern",
            "mean",
            "lamp",
            "t3 stack",
        ],
        "mobile": [
            # Cross-platform
            "flutter",
            "dart",
            "react native",
            "react-native",
            "expo",
            "ionic",
            "capacitor",
            "xamarin",
            "cordova",
            "phonegap",
            # Native Android
            "android",
            "kotlin",
            "java android",
            "android studio",
            "jetpack compose",
            "room",
            "retrofit",
            # Native iOS
            "ios",
            "swift",
            "swiftui",
            "objective-c",
            "xcode",
            "uikit",
            "core data",
        ],
        "devops": [
            # Containers
            "docker",
            "kubernetes",
            "k8s",
            "helm",
            "podman",
            # CI/CD
            "jenkins",
            "github actions",
            "gitlab ci",
            "circle ci",
            "travis ci",
            "argo cd",
            "tekton",
            "drone",
            # Cloud
            "aws",
            "azure",
            "gcp",
            "google cloud",
            "heroku",
            "vercel",
            "netlify",
            "digitalocean",
            "linode",
            # IaC
            "terraform",
            "ansible",
            "puppet",
            "chef",
            "cloudformation",
            "pulumi",
            "vagrant",
            # Monitoring
            "prometheus",
            "grafana",
            "datadog",
            "new relic",
            "splunk",
            "elk stack",
            "logstash",
            "kibana",
        ],
        "data": [
            # Languages/Tools
            "python",
            "r",
            "julia",
            "matlab",
            "sas",
            # ML/DL Frameworks
            "tensorflow",
            "pytorch",
            "keras",
            "scikit-learn",
            "sklearn",
            "xgboost",
            "lightgbm",
            "catboost",
            "huggingface",
            "transformers",
            # Data Processing
            "pandas",
            "numpy",
            "scipy",
            "dask",
            "spark",
            "pyspark",
            "hadoop",
            "hive",
            "presto",
            "airflow",
            "luigi",
            # Visualization
            "matplotlib",
            "seaborn",
            "plotly",
            "bokeh",
            "d3.js",
            "tableau",
            # ML Ops
            "mlflow",
            "kubeflow",
            "sagemaker",
            "vertex ai",
            # Databases
            "bigquery",
            "snowflake",
            "redshift",
            "databricks",
        ],
        "security": [
            "security",
            "penetration testing",
            "pentest",
            "ethical hacking",
            "owasp",
            "burp suite",
            "metasploit",
            "nmap",
            "wireshark",
            "cryptography",
            "oauth",
            "jwt",
            "keycloak",
            "auth0",
            "vault",
            "hashicorp vault",
            "ssl",
            "tls",
            "encryption",
        ],
        "qa": [
            "testing",
            "qa",
            "quality assurance",
            "test automation",
            "selenium",
            "cypress",
            "playwright",
            "puppeteer",
            "jest",
            "mocha",
            "jasmine",
            "pytest",
            "junit",
            "testng",
            "cucumber",
            "behave",
            "robot framework",
            "jmeter",
            "locust",
            "gatling",
            "k6",
        ],
    }

    # Commit message patterns for role detection
    COMMIT_ROLE_PATTERNS = {
        "backend": [
            r"\b(api|endpoint|server|database|db|schema|migration|model|query|sql)\b",
            r"\b(auth|authentication|authorization|session|token)\b",
            r"\b(celery|task|queue|worker|cron)\b",
        ],
        "frontend": [
            r"\b(ui|ux|component|page|view|layout|style|css|design)\b",
            r"\b(button|form|modal|table|list|card|nav|menu)\b",
            r"\b(responsive|mobile\s*first|animation|transition)\b",
        ],
        "mobile": [
            r"\b(android|ios|mobile|app|screen|navigation)\b",
            r"\b(flutter|react\s*native|swift|kotlin)\b",
        ],
        "devops": [
            r"\b(deploy|ci|cd|pipeline|docker|k8s|kubernetes)\b",
            r"\b(terraform|ansible|infrastructure|infra)\b",
            r"\b(monitoring|logging|metrics|alert)\b",
        ],
        "data": [
            r"\b(data|ml|model|training|prediction|analytics)\b",
            r"\b(pandas|numpy|tensorflow|pytorch|sklearn)\b",
            r"\b(etl|pipeline|spark|hadoop)\b",
        ],
    }

    # Role display names (Korean)
    ROLE_NAMES = {
        "backend": "백엔드 개발",
        "frontend": "프론트엔드 개발",
        "fullstack": "풀스택 개발",
        "mobile": "모바일 개발",
        "devops": "DevOps/인프라",
        "data": "데이터/ML 엔지니어",
        "security": "보안 엔지니어",
        "qa": "QA/테스트",
    }

    def __init__(self):
        pass

    def detect_role(
        self,
        technologies: List[str] = None,
        commit_messages: List[str] = None,
        file_patterns: List[str] = None,
        existing_role: str = None,
    ) -> Tuple[str, Dict[str, float]]:
        """
        Detect the developer's role based on project data.

        Args:
            technologies: List of technologies used in the project
            commit_messages: List of commit messages
            file_patterns: List of file paths/patterns
            existing_role: Existing role (for validation)

        Returns:
            Tuple of (detected_role, role_scores)
        """
        role_scores: Dict[str, float] = {role: 0.0 for role in self.ROLE_NAMES}

        # 1. Score based on technologies (weight: 2.0)
        if technologies:
            tech_scores = self._score_from_technologies(technologies)
            for role, score in tech_scores.items():
                role_scores[role] += score * 2.0

        # 2. Score based on commit messages (weight: 1.5)
        if commit_messages:
            commit_scores = self._score_from_commits(commit_messages)
            for role, score in commit_scores.items():
                role_scores[role] += score * 1.5

        # 3. Score based on file patterns (weight: 1.0)
        if file_patterns:
            file_scores = self._score_from_files(file_patterns)
            for role, score in file_scores.items():
                role_scores[role] += score * 1.0

        # Determine primary role
        if all(score == 0 for score in role_scores.values()):
            # No clear role detected, default to fullstack
            detected_role = "fullstack"
        else:
            # Check for fullstack (both backend and frontend significant)
            backend_score = role_scores.get("backend", 0)
            frontend_score = role_scores.get("frontend", 0)
            total_score = sum(role_scores.values())

            if total_score > 0:
                backend_ratio = backend_score / total_score
                frontend_ratio = frontend_score / total_score

                # If both backend and frontend are significant (>25% each), consider fullstack
                if backend_ratio > 0.25 and frontend_ratio > 0.25:
                    role_scores["fullstack"] += (backend_score + frontend_score) * 0.5

            detected_role = max(role_scores, key=role_scores.get)

        return self.ROLE_NAMES.get(detected_role, detected_role), role_scores

    def _score_from_technologies(self, technologies: List[str]) -> Dict[str, float]:
        """Calculate role scores based on technology stack."""
        scores: Dict[str, float] = {role: 0.0 for role in self.ROLE_NAMES}

        tech_lower = [t.lower().strip() for t in technologies]

        for role, tech_list in self.TECH_ROLE_MAPPING.items():
            for tech in tech_list:
                tech_pattern = tech.lower()
                # Check exact match or partial match
                for project_tech in tech_lower:
                    if tech_pattern in project_tech or project_tech in tech_pattern:
                        scores[role] += 1.0
                        break

        # Normalize scores
        max_score = max(scores.values()) if scores else 1
        if max_score > 0:
            scores = {role: score / max_score for role, score in scores.items()}

        return scores

    def _score_from_commits(self, commit_messages: List[str]) -> Dict[str, float]:
        """Calculate role scores based on commit messages."""
        scores: Dict[str, float] = {role: 0.0 for role in self.ROLE_NAMES}

        combined = " ".join(commit_messages).lower()

        for role, patterns in self.COMMIT_ROLE_PATTERNS.items():
            for pattern in patterns:
                matches = re.findall(pattern, combined, re.IGNORECASE)
                scores[role] += len(matches) * 0.1

        # Normalize scores
        max_score = max(scores.values()) if scores else 1
        if max_score > 0:
            scores = {role: score / max_score for role, score in scores.items()}

        return scores

    def _score_from_files(self, file_patterns: List[str]) -> Dict[str, float]:
        """Calculate role scores based on file patterns."""
        scores: Dict[str, float] = {role: 0.0 for role in self.ROLE_NAMES}

        # File pattern indicators
        file_role_mapping = {
            "backend": [
                r"(api|server|backend|app)\.(py|java|go|rb|php|ts|js)$",
                r"(models?|schemas?|migrations?|routes?|controllers?)/",
                r"requirements\.txt$",
                r"pom\.xml$",
                r"build\.gradle$",
                r"manage\.py$",
                r"settings\.py$",
                r"wsgi\.py$",
            ],
            "frontend": [
                r"\.(jsx?|tsx?|vue|svelte)$",
                r"(components?|pages?|views?|layouts?)/",
                r"(styles?|css|scss|sass)/",
                r"package\.json$",
                r"vite\.config",
                r"next\.config",
            ],
            "mobile": [
                r"\.(kt|swift|dart)$",
                r"(android|ios)/",
                r"pubspec\.yaml$",
                r"build\.gradle$",
                r"AppDelegate",
            ],
            "devops": [
                r"(Dockerfile|docker-compose|\.gitlab-ci|Jenkinsfile)",
                r"(terraform|ansible|helm)/",
                r"\.(tf|yml|yaml)$",
                r"(k8s|kubernetes|deploy)/",
            ],
            "data": [
                r"\.(ipynb|py)$",
                r"(notebooks?|data|models?|ml|training)/",
                r"requirements\.txt$",
            ],
        }

        files_str = " ".join(file_patterns).lower()

        for role, patterns in file_role_mapping.items():
            for pattern in patterns:
                matches = re.findall(pattern, files_str, re.IGNORECASE)
                scores[role] += len(matches) * 0.2

        # Normalize scores
        max_score = max(scores.values()) if scores else 1
        if max_score > 0:
            scores = {role: score / max_score for role, score in scores.items()}

        return scores

    def get_role_suggestions(
        self, technologies: List[str] = None, commit_messages: List[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get role suggestions with confidence scores.

        Returns top 3 role suggestions with scores.
        """
        detected_role, scores = self.detect_role(technologies, commit_messages)

        # Sort by score and get top 3
        sorted_roles = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:3]

        suggestions = []
        total_score = sum(score for _, score in sorted_roles)

        for role_key, score in sorted_roles:
            if score > 0:
                confidence = (score / total_score * 100) if total_score > 0 else 0
                suggestions.append(
                    {
                        "role": self.ROLE_NAMES.get(role_key, role_key),
                        "role_key": role_key,
                        "confidence": round(confidence, 1),
                        "score": round(score, 3),
                    }
                )

        return suggestions
