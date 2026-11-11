import json
import logging
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

# Patterns for sensitive data redaction
REDACTION_PATTERNS = [
    # Tokens / API keys / Secrets
    (
        re.compile(
            r"(?i)(token|bearer|key|secret|password|passwd|auth)[\"':\s=]+([a-zA-Z0-9_\-\.]{8,})"
        ),
        r"\1=[REDACTED]",
    ),
    # Hugging Face tokens
    (re.compile(r"hf_[a-zA-Z0-9]{34,}"), "hf_[REDACTED]"),
    # Google OAuth / client secrets
    (re.compile(r"GOCSPX-[a-zA-Z0-9_\-]{20,}"), "GOCSPX-[REDACTED]"),
    # Home directory paths
    (re.compile(r"/(?:home|Users)/[a-zA-Z0-9._-]+"), "/home/[USER]"),
    # IPv4 addresses (except localhost 127.0.0.1 and 0.0.0.0)
    (
        re.compile(
            r"(?<!127\.0\.0\.)(?<!0\.0\.0\.)\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b"
        ),
        "[IP_REDACTED]",
    ),
]


def redact_sensitive_string(text: str) -> str:
    """Redacts usernames, home paths, tokens, keys and private IPs from a string."""
    if not isinstance(text, str):
        return text
    result = text
    for pattern, replacement in REDACTION_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def redact_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Recursively redacts sensitive values from a dictionary."""
    clean: dict[str, Any] = {}
    for k, v in data.items():
        # Redact keys that indicate secrets
        if any(
            secret_term in k.lower()
            for secret_term in ["token", "secret", "password", "key", "auth"]
        ):
            clean[k] = "[REDACTED]"
        elif isinstance(v, str):
            clean[k] = redact_sensitive_string(v)
        elif isinstance(v, dict):
            clean[k] = redact_dict(v)
        elif isinstance(v, list):
            clean[k] = [
                redact_dict(item)
                if isinstance(item, dict)
                else redact_sensitive_string(item)
                if isinstance(item, str)
                else item
                for item in v
            ]
        else:
            clean[k] = v
    return clean


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects with auto-redaction."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_sensitive_string(record.getMessage()),
            "module": record.module,
            "line": record.lineno,
        }
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        if record.exc_info:
            log_entry["exception"] = redact_sensitive_string(self.formatException(record.exc_info))
        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging(logs_dir: Path, debug: bool = False) -> logging.Logger:
    """Configures structured JSON logging with rotation and console stream."""
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / "giggle.log"

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if debug else logging.INFO)
    root_logger.handlers.clear()

    # Rotating file handler (10 MB per file, max 5 backups)
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(JSONFormatter())
    file_handler.setLevel(logging.DEBUG if debug else logging.INFO)
    root_logger.addHandler(file_handler)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(JSONFormatter())
    console_handler.setLevel(logging.DEBUG if debug else logging.INFO)
    root_logger.addHandler(console_handler)

    return logging.getLogger("giggle")


logger = logging.getLogger("giggle")
