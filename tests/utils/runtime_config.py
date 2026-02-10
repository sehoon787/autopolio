from __future__ import annotations

from pathlib import Path
import os
import yaml


def _load_runtime_config() -> dict:
    repo_root = Path(__file__).resolve().parents[2]
    config_path = repo_root / "config" / "runtime.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def get_external_ports() -> tuple[int, int]:
    config = _load_runtime_config()
    ports = config.get("ports", {}) if isinstance(config, dict) else {}
    external = ports.get("external", {}) if isinstance(ports, dict) else {}
    frontend = int(external.get("frontend", 3035))
    backend = int(external.get("backend", 8085))
    return frontend, backend


def get_api_base_url(default_suffix: str = "") -> str:
    _, backend = get_external_ports()
    base = os.environ.get("API_BASE_URL")
    if base:
        return base
    return f"http://localhost:{backend}{default_suffix}"


def get_frontend_url() -> str:
    frontend = os.environ.get("FRONTEND_URL")
    if frontend:
        return frontend
    front_port, _ = get_external_ports()
    return f"http://localhost:{front_port}"
