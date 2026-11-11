import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


def generate_uuid() -> str:
    return str(uuid.uuid4())


class SettingModel(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ModelEntity(Base, TimestampMixin):
    __tablename__ = "models"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    format: Mapped[str] = mapped_column(String(32), default="gguf")  # gguf | safetensors | hf
    architecture: Mapped[str] = mapped_column(String(64), default="unknown")
    quantization: Mapped[str] = mapped_column(String(32), default="none")
    context_length: Mapped[int] = mapped_column(Integer, default=4096)
    parameters_count: Mapped[str] = mapped_column(String(32), default="unknown")
    chat_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    license: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    profiles: Mapped[list["ModelProfileModel"]] = relationship(back_populates="model", cascade="all, delete-orphan")


class ModelProfileModel(Base, TimestampMixin):
    __tablename__ = "model_profiles"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    n_gpu_layers: Mapped[int] = mapped_column(Integer, default=0)
    n_ctx: Mapped[int] = mapped_column(Integer, default=4096)
    kv_cache_type_k: Mapped[str] = mapped_column(String(16), default="f16")
    kv_cache_type_v: Mapped[str] = mapped_column(String(16), default="f16")
    flash_attention: Mapped[bool] = mapped_column(Boolean, default=True)
    tensor_overrides_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    moe_cpu_layers: Mapped[int] = mapped_column(Integer, default=0)
    bench_prompt_tps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bench_gen_tps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bench_peak_vram_mb: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    model: Mapped["ModelEntity"] = relationship(back_populates="profiles")


class ChatModel(Base, TimestampMixin):
    __tablename__ = "chats"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), default="Yeni Sohbet")
    model_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sampling_params_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    messages: Mapped[list["MessageModel"]] = relationship(back_populates="chat", cascade="all, delete-orphan")


class MessageModel(Base, TimestampMixin):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id"), nullable=False)
    parent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # system | user | assistant | tool
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    ttft_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tool_calls_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    chat: Mapped["ChatModel"] = relationship(back_populates="messages")


class PromptModel(Base, TimestampMixin):
    __tablename__ = "prompts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags_json: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)


class DatasetModel(Base, TimestampMixin):
    __tablename__ = "datasets"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    format: Mapped[str] = mapped_column(String(32), default="jsonl")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    columns_json: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    license: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)


class TrainingRunModel(Base, TimestampMixin):
    __tablename__ = "training_runs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    base_model_id: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending | running | paused | completed | failed
    config_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    output_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_msg: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    metrics: Mapped[list["RunMetricModel"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class RunMetricModel(Base, TimestampMixin):
    __tablename__ = "run_metrics"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("training_runs.id"), nullable=False)
    step: Mapped[int] = mapped_column(Integer, nullable=False)
    epoch: Mapped[float] = mapped_column(Float, default=0.0)
    loss: Mapped[float] = mapped_column(Float, nullable=False)
    eval_loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lr: Mapped[float] = mapped_column(Float, default=0.0)
    grad_norm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tokens_per_sec: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vram_usage_mb: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    run: Mapped["TrainingRunModel"] = relationship(back_populates="metrics")


class AgentSessionModel(Base, TimestampMixin):
    __tablename__ = "agent_sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), default="Agent Görevi")
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active")
    max_steps: Mapped[int] = mapped_column(Integer, default=25)
    approval_policy: Mapped[str] = mapped_column(String(32), default="ask_high_risk")

    steps: Mapped[list["AgentStepModel"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class AgentStepModel(Base, TimestampMixin):
    __tablename__ = "agent_steps"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("agent_sessions.id"), nullable=False)
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    thought: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    tool_args_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    tool_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(32), default="safe")
    approved_by_user: Mapped[bool] = mapped_column(Boolean, default=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)

    session: Mapped["AgentSessionModel"] = relationship(back_populates="steps")


class GmailMessageCacheModel(Base, TimestampMixin):
    __tablename__ = "gmail_message_cache"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    message_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    thread_id: Mapped[str] = mapped_column(String(128), nullable=False)
    subject: Mapped[str] = mapped_column(String(512), default="")
    from_address: Mapped[str] = mapped_column(String(256), default="")
    to_address: Mapped[str] = mapped_column(String(256), default="")
    date: Mapped[str] = mapped_column(String(64), default="")
    snippet: Mapped[str] = mapped_column(Text, default="")
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)


class GmailAuditModel(Base, TimestampMixin):
    __tablename__ = "gmail_audit"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    action: Mapped[str] = mapped_column(String(64), nullable=False)  # send | draft | read | search
    target_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    details_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)


class PluginModel(Base, TimestampMixin):
    __tablename__ = "plugins"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    manifest_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    permissions_json: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)


class MCPServerModel(Base, TimestampMixin):
    __tablename__ = "mcp_servers"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    transport: Mapped[str] = mapped_column(String(32), default="stdio")  # stdio | sse
    command_or_url: Mapped[str] = mapped_column(String(512), nullable=False)
    env_json: Mapped[Optional[Dict[str, str]]] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(32), default="connected")


class REProjectModel(Base, TimestampMixin):
    __tablename__ = "re_projects"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    samples: Mapped[list["RESampleModel"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class RESampleModel(Base, TimestampMixin):
    __tablename__ = "re_samples"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("re_projects.id"), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    md5: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    sha1: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    file_type: Mapped[str] = mapped_column(String(64), default="unknown")
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    quarantine_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    is_quarantined_ro: Mapped[bool] = mapped_column(Boolean, default=True)

    project: Mapped["REProjectModel"] = relationship(back_populates="samples")
    functions: Mapped[list["REFunctionModel"]] = relationship(back_populates="sample", cascade="all, delete-orphan")


class REFunctionModel(Base, TimestampMixin):
    __tablename__ = "re_functions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    sample_id: Mapped[str] = mapped_column(ForeignKey("re_samples.id"), nullable=False)
    address: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    size: Mapped[int] = mapped_column(Integer, default=0)
    decompiled_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assembly_json: Mapped[Optional[list[Dict[str, Any]]]] = mapped_column(JSON, nullable=True)
    callgraph_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    xrefs_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)

    sample: Mapped["RESampleModel"] = relationship(back_populates="functions")


class REAnnotationModel(Base, TimestampMixin):
    __tablename__ = "re_annotations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    function_id: Mapped[str] = mapped_column(ForeignKey("re_functions.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    author: Mapped[str] = mapped_column(String(64), default="human")  # human | ai
    annotation_type: Mapped[str] = mapped_column(String(32), default="comment")  # comment | rename | type
    content: Mapped[Text] = mapped_column(Text, nullable=False)
    applied: Mapped[bool] = mapped_column(Boolean, default=True)


class RESummaryModel(Base, TimestampMixin):
    __tablename__ = "re_summaries"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    function_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_citations_json: Mapped[Optional[list[Dict[str, Any]]]] = mapped_column(JSON, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)


class REEmbeddingModel(Base, TimestampMixin):
    __tablename__ = "re_embeddings"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    sample_id: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)  # function | string | note
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding_json: Mapped[list[float]] = mapped_column(JSON, nullable=False)


class REReportModel(Base, TimestampMixin):
    __tablename__ = "re_reports"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sample_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    format: Mapped[str] = mapped_column(String(32), default="markdown")  # markdown | json | html
    content: Mapped[str] = mapped_column(Text, nullable=False)
