from pathlib import Path
from typing import Any

import yaml
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    name: str = "Giggle Studio"
    version: str = "0.1.0"
    author: str = "Sedat-gigglemorgan"
    language: str = "tr"


class ServerSettings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8420
    workers: int = 1
    cors_origins: list[str] = [
        "http://127.0.0.1:8420",
        "http://localhost:8420",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]


class StorageSettings(BaseSettings):
    data_dir: Path = Path("./data")
    sqlite_path: Path = Path("./data/giggle.db")
    models_dir: Path = Path("./data/models")
    datasets_dir: Path = Path("./data/datasets")
    workspaces_dir: Path = Path("./data/workspaces")
    quarantine_dir: Path = Path("./data/quarantine")
    logs_dir: Path = Path("./data/logs")

    @field_validator(
        "data_dir",
        "sqlite_path",
        "models_dir",
        "datasets_dir",
        "workspaces_dir",
        "quarantine_dir",
        "logs_dir",
        mode="before",
    )
    @classmethod
    def parse_path(cls, v: Any) -> Path:
        return Path(v).resolve() if v else Path("./data").resolve()


class HardwareSettings(BaseSettings):
    preferred_vendor: str = "nvidia"
    exclude_vendors: list[str] = ["amd"]
    vram_safety_margin_mb: int = 600
    ram_ceiling_percent: int = 85
    default_cpu_threads: int = 6


class InferenceSettings(BaseSettings):
    default_backend: str = "llama_cpp"
    default_context_length: int = 4096
    default_batch_size: int = 512
    default_ubatch_size: int = 128
    flash_attention: bool = True
    kv_cache_k: str = "f16"
    kv_cache_v: str = "f16"


class OpenAICompatSettings(BaseSettings):
    enabled: bool = False
    api_key: str | None = None


class SandboxSettings(BaseSettings):
    enabled: bool = True
    backend: str = "bwrap"  # bwrap | unshare | rlimit
    timeout_seconds: int = 30
    max_output_bytes: int = 1048576  # 1 MB
    allow_network: bool = False


class GmailSettings(BaseSettings):
    enabled: bool = False
    send_rate_limit_per_hour: int = 10
    store_bodies: bool = False
    client_id: str | None = None
    client_secret: str | None = None


class PluginsSettings(BaseSettings):
    enabled: bool = True
    directory: Path = Path("./data/plugins")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GIGGLE_",
        env_nested_delimiter="__",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    debug: bool = False
    secret_key: str = "giggle-default-secret-key-change-in-production-32b"
    app: AppSettings = Field(default_factory=AppSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)
    storage: StorageSettings = Field(default_factory=StorageSettings)
    hardware: HardwareSettings = Field(default_factory=HardwareSettings)
    inference: InferenceSettings = Field(default_factory=InferenceSettings)
    openai_compat: OpenAICompatSettings = Field(default_factory=OpenAICompatSettings)
    sandbox: SandboxSettings = Field(default_factory=SandboxSettings)
    gmail: GmailSettings = Field(default_factory=GmailSettings)
    plugins: PluginsSettings = Field(default_factory=PluginsSettings)

    @classmethod
    def load_from_yaml(cls, yaml_path: Path = Path("giggle.yaml")) -> "Settings":
        data: dict[str, Any] = {}
        if yaml_path.exists():
            with open(yaml_path, encoding="utf-8") as f:
                loaded = yaml.safe_load(f)
                if isinstance(loaded, dict):
                    data = loaded

        # Let environment variables override YAML
        settings = cls(**data)
        # Ensure directories exist
        for d in [
            settings.storage.data_dir,
            settings.storage.models_dir,
            settings.storage.datasets_dir,
            settings.storage.workspaces_dir,
            settings.storage.quarantine_dir,
            settings.storage.logs_dir,
            settings.plugins.directory,
        ]:
            d.mkdir(parents=True, exist_ok=True)
        return settings


settings = Settings.load_from_yaml()
