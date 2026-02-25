from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path
import yaml
import os


def load_yaml_config(config_name: str) -> dict:
    """Load YAML configuration file."""
    config_path = Path(__file__).parent.parent / "config" / f"{config_name}.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_base_dir() -> Path:
    return Path(os.environ.get("AUTOPOLIO_BASE_DIR", Path(__file__).parent.parent))


def _get_data_dir() -> Path:
    if "AUTOPOLIO_DATA_DIR" in os.environ:
        return Path(os.environ["AUTOPOLIO_DATA_DIR"])
    return _get_base_dir() / "data"


def _get_config_dir() -> Path:
    if "AUTOPOLIO_CONFIG_DIR" in os.environ:
        return Path(os.environ["AUTOPOLIO_CONFIG_DIR"])
    return _get_base_dir() / "config"


def _get_platform_templates_dir() -> Path:
    if "AUTOPOLIO_PLATFORM_TEMPLATES_DIR" in os.environ:
        return Path(os.environ["AUTOPOLIO_PLATFORM_TEMPLATES_DIR"])
    return _get_data_dir() / "platform_templates"


def _get_templates_dir() -> Path:
    if "AUTOPOLIO_TEMPLATES_DIR" in os.environ:
        return Path(os.environ["AUTOPOLIO_TEMPLATES_DIR"])
    return _get_data_dir() / "templates"


def _get_runtime_profile() -> str:
    return os.environ.get("AUTOPOLIO_RUNTIME", "external")


def _get_runtime_ports() -> dict:
    runtime = load_yaml_config("runtime")
    ports = runtime.get("ports", {}) if isinstance(runtime, dict) else {}
    profile = _get_runtime_profile()
    return (
        ports.get(profile, ports.get("external", {})) if isinstance(ports, dict) else {}
    )


def _get_external_ports() -> dict:
    runtime = load_yaml_config("runtime")
    ports = runtime.get("ports", {}) if isinstance(runtime, dict) else {}
    return ports.get("external", {}) if isinstance(ports, dict) else {}


def _get_frontend_port() -> int:
    return int(_get_external_ports().get("frontend", 3035))


def _get_backend_port() -> int:
    return int(_get_external_ports().get("backend", 8085))


def _get_backend_listen_port() -> int:
    return int(_get_runtime_ports().get("backend", 8085))


def _get_frontend_url() -> str:
    return f"http://localhost:{_get_frontend_port()}"


def _get_api_url() -> str:
    return f"http://localhost:{_get_backend_port()}"


def _get_github_redirect_uri() -> str:
    return f"{_get_api_url()}/api/github/callback"


def _get_cors_origins() -> list[str]:
    runtime = load_yaml_config("runtime")
    ports = runtime.get("ports", {}) if isinstance(runtime, dict) else {}
    origins: list[str] = []
    for profile in ("external", "docker"):
        profile_ports = ports.get(profile, {}) if isinstance(ports, dict) else {}
        frontend_port = profile_ports.get("frontend")
        if frontend_port:
            origins.append(f"http://localhost:{frontend_port}")
    origins.extend(
        [
            "app://-",  # Electron app origin (electron-serve)
            "app://.",  # Alternative Electron origin
            "file://",  # File protocol
        ]
    )
    return origins


class Settings(BaseSettings):
    # App settings
    app_name: str = "Autopolio"
    debug: bool = True
    secret_key: str = "your-secret-key-change-in-production"

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/autopolio.db"
    enable_migrations: bool = False  # Use Alembic migrations (ENABLE_MIGRATIONS env var)

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = _get_github_redirect_uri()

    # LLM Settings
    llm_provider: str = "openai"  # "openai", "anthropic", or "gemini"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    openai_model: str = "gpt-4-turbo-preview"
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    gemini_model: str = "gemini-2.0-flash"

    base_dir: Path = _get_base_dir()
    data_dir: Path = _get_data_dir()
    config_dir: Path = _get_config_dir()
    templates_dir: Path = _get_templates_dir()
    platform_templates_dir: Path = _get_platform_templates_dir()
    result_dir: Path = base_dir / "result"

    # Frontend URL (for OAuth redirect)
    frontend_url: str = _get_frontend_url()

    # API URL (for OAuth callbacks)
    api_url: str = _get_api_url()

    # Runtime ports (external vs docker)
    frontend_port: int = _get_frontend_port()
    api_port: int = _get_backend_listen_port()

    # CORS (includes app:// for Electron desktop app)
    cors_origins: list[str] = _get_cors_origins()

    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# Platform configurations for templates
PLATFORM_CONFIGS = {
    "saramin_1": {
        "name": "사람인 (기본형)",
        "max_projects": 5,
        "fields": ["company", "position", "period", "description"],
    },
    "saramin_2": {
        "name": "사람인 (상세형)",
        "max_projects": 10,
        "fields": [
            "company",
            "position",
            "period",
            "description",
            "achievements",
            "tech_stack",
        ],
    },
    "saramin_3": {
        "name": "사람인 (포트폴리오형)",
        "max_projects": 15,
        "fields": [
            "company",
            "position",
            "period",
            "description",
            "achievements",
            "tech_stack",
            "links",
        ],
    },
    "wanted": {
        "name": "원티드",
        "max_projects": 10,
        "fields": ["company", "position", "period", "description", "achievements"],
    },
    "remember": {
        "name": "리멤버",
        "max_projects": 8,
        "fields": ["company", "position", "period", "summary"],
    },
    "notion": {
        "name": "노션",
        "max_projects": None,
        "fields": [
            "company",
            "position",
            "period",
            "description",
            "achievements",
            "tech_stack",
            "links",
            "images",
        ],
    },
}
