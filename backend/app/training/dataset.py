from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any

logger = logging.getLogger("giggle.training.dataset")


class DatasetFormat:
    ALPACA = "alpaca"  # instruction, input, output
    SHAREGPT = "sharegpt"  # conversations: [{from, value}]
    OPENAI_MESSAGES = "openai_messages"  # messages: [{role, content}]
    TEXT_COMPLETION = "text_completion"  # prompt, response / text


class DatasetProcessor:
    """Imports, validates, detects format, and analyzes token statistics for SFT datasets."""

    @classmethod
    def detect_format(cls, sample_row: dict[str, Any]) -> str:
        if "messages" in sample_row and isinstance(sample_row["messages"], list):
            return DatasetFormat.OPENAI_MESSAGES
        if "conversations" in sample_row and isinstance(sample_row["conversations"], list):
            return DatasetFormat.SHAREGPT
        if "instruction" in sample_row and "output" in sample_row:
            return DatasetFormat.ALPACA
        if "prompt" in sample_row and "response" in sample_row:
            return DatasetFormat.TEXT_COMPLETION
        if "text" in sample_row:
            return DatasetFormat.TEXT_COMPLETION
        return "custom"

    @classmethod
    def estimate_tokens(cls, text: str) -> int:
        """Heuristic estimation of token count (~4 chars per token for English/code)."""
        if not text:
            return 0
        return max(1, len(text) // 4)

    @classmethod
    def row_to_text(cls, row: dict[str, Any], fmt: str) -> str:
        """Converts a structured dataset row into linear text for token counting."""
        if fmt == DatasetFormat.ALPACA:
            inst = row.get("instruction", "")
            inp = row.get("input", "")
            out = row.get("output", "")
            return f"{inst}\n{inp}\n{out}"
        elif fmt == DatasetFormat.OPENAI_MESSAGES:
            msgs = row.get("messages", [])
            return "\n".join(m.get("content", "") for m in msgs if isinstance(m, dict))
        elif fmt == DatasetFormat.SHAREGPT:
            convs = row.get("conversations", [])
            return "\n".join(c.get("value", "") for c in convs if isinstance(c, dict))
        elif fmt == DatasetFormat.TEXT_COMPLETION:
            return f"{row.get('prompt', '')} {row.get('response', '')} {row.get('text', '')}"
        return json.dumps(row)

    @classmethod
    def parse_dataset_bytes(
        cls, file_bytes: bytes, filename: str, target_max_seq_len: int = 2048
    ) -> dict[str, Any]:
        """Parses JSONL, JSON, or CSV bytes, computing statistics and truncation warnings."""
        raw_text = file_bytes.decode("utf-8", errors="replace")
        rows: list[dict[str, Any]] = []

        if filename.endswith(".jsonl"):
            for line in raw_text.splitlines():
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        elif filename.endswith(".json"):
            try:
                parsed = json.loads(raw_text)
                if isinstance(parsed, list):
                    rows = parsed
                elif isinstance(parsed, dict):
                    rows = [parsed]
            except json.JSONDecodeError:
                pass
        elif filename.endswith(".csv"):
            reader = csv.DictReader(io.StringIO(raw_text))
            for r in reader:
                rows.append(dict(r))

        if not rows:
            raise ValueError(f"Could not parse valid data rows from '{filename}'.")

        fmt = cls.detect_format(rows[0])

        # Analyze token distribution
        token_counts: list[int] = []
        truncated_count = 0
        valid_rows = 0

        for r in rows:
            text = cls.row_to_text(r, fmt)
            if not text.strip():
                continue
            t_count = cls.estimate_tokens(text)
            token_counts.append(t_count)
            valid_rows += 1
            if t_count > target_max_seq_len:
                truncated_count += 1

        token_counts.sort()
        total_tokens = sum(token_counts)
        p50 = token_counts[len(token_counts) // 2] if token_counts else 0
        p95 = token_counts[int(len(token_counts) * 0.95)] if token_counts else 0
        p99 = token_counts[int(len(token_counts) * 0.99)] if token_counts else 0
        max_tokens = token_counts[-1] if token_counts else 0

        truncation_percentage = (
            round((truncated_count / valid_rows * 100), 1) if valid_rows > 0 else 0.0
        )

        return {
            "format": fmt,
            "row_count": valid_rows,
            "total_tokens": total_tokens,
            "columns": list(rows[0].keys()),
            "token_stats": {
                "min": token_counts[0] if token_counts else 0,
                "median_p50": p50,
                "p95": p95,
                "p99": p99,
                "max": max_tokens,
                "truncated_rows": truncated_count,
                "truncation_percentage": truncation_percentage,
                "target_max_seq_len": target_max_seq_len,
            },
            "sample_preview": rows[:3],
        }
