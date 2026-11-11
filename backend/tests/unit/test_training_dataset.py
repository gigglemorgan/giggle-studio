from __future__ import annotations

import json

from app.training.dataset import DatasetFormat, DatasetProcessor


def test_dataset_format_detection():
    # Alpaca
    alpaca_row = {"instruction": "Calculate sum", "input": "2+2", "output": "4"}
    assert DatasetProcessor.detect_format(alpaca_row) == DatasetFormat.ALPACA

    # OpenAI Messages
    openai_row = {
        "messages": [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]
    }
    assert DatasetProcessor.detect_format(openai_row) == DatasetFormat.OPENAI_MESSAGES

    # ShareGPT
    sharegpt_row = {
        "conversations": [
            {"from": "human", "value": "Question?"},
            {"from": "gpt", "value": "Answer."},
        ]
    }
    assert DatasetProcessor.detect_format(sharegpt_row) == DatasetFormat.SHAREGPT


def test_dataset_parsing_and_token_stats():
    lines = [
        json.dumps({"instruction": f"Task {i}", "input": "", "output": f"Result {i} " * 20})
        for i in range(20)
    ]
    raw_jsonl = "\n".join(lines).encode("utf-8")

    stats = DatasetProcessor.parse_dataset_bytes(raw_jsonl, "train.jsonl", target_max_seq_len=50)

    assert stats["format"] == DatasetFormat.ALPACA
    assert stats["row_count"] == 20
    assert stats["total_tokens"] > 0
    assert "token_stats" in stats
    assert stats["token_stats"]["median_p50"] > 0
