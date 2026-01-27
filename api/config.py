from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path
import yaml
from typing import Optional


class Settings(BaseSettings):
    # App settings
    app_name: str = "Autopolio"
    debug: bool = True
    secret_key: str = "your-secret-key-change-in-production"

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/autopolio.db"

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/github/callback"

    # LLM Settings
    llm_provider: str = "openai"  # "openai", "anthropic", or "gemini"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    openai_model: str = "gpt-4-turbo-preview"
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    gemini_model: str = "gemini-2.0-flash"

    # File paths
    base_dir: Path = Path(__file__).parent.parent
    data_dir: Path = base_dir / "data"
    templates_dir: Path = data_dir / "templates"
    result_dir: Path = base_dir / "result"

    # Frontend URL (for OAuth redirect)
    frontend_url: str = "http://localhost:5173"

    # CORS (includes app:// for Electron desktop app)
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5199",  # Additional fallback port
        "http://localhost:3000",
        "app://-",      # Electron app origin (electron-serve)
        "app://.",      # Alternative Electron origin
        "file://",      # File protocol
    ]

    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def load_yaml_config(config_name: str) -> dict:
    """Load YAML configuration file."""
    config_path = Path(__file__).parent.parent / "config" / f"{config_name}.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


# Platform configurations for templates
PLATFORM_CONFIGS = {
    "saramin_1": {
        "name": "사람인 (기본형)",
        "max_projects": 5,
        "fields": ["company", "position", "period", "description"]
    },
    "saramin_2": {
        "name": "사람인 (상세형)",
        "max_projects": 10,
        "fields": ["company", "position", "period", "description", "achievements", "tech_stack"]
    },
    "saramin_3": {
        "name": "사람인 (포트폴리오형)",
        "max_projects": 15,
        "fields": ["company", "position", "period", "description", "achievements", "tech_stack", "links"]
    },
    "wanted": {
        "name": "원티드",
        "max_projects": 10,
        "fields": ["company", "position", "period", "description", "achievements"]
    },
    "remember": {
        "name": "리멤버",
        "max_projects": 8,
        "fields": ["company", "position", "period", "summary"]
    },
    "notion": {
        "name": "노션",
        "max_projects": None,
        "fields": ["company", "position", "period", "description", "achievements", "tech_stack", "links", "images"]
    }
}
