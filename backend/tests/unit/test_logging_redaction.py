from app.core.logger import redact_dict, redact_sensitive_string


def test_redact_sensitive_string():
    raw_str = (
        "Error at /home/john_doe/giggle-studio/secret.txt with token=secret123456 "
        "and standalone hf_1234567890123456789012345678901234"
    )
    redacted = redact_sensitive_string(raw_str)
    assert "/home/john_doe" not in redacted
    assert "/home/[USER]" in redacted
    assert "secret123456" not in redacted
    assert "token=[REDACTED]" in redacted
    assert "hf_1234567890123456789012345678901234" not in redacted
    assert "hf_[REDACTED]" in redacted


def test_redact_dict_keys_and_values():
    data = {
        "user_token": "super_secret_value",
        "nested": {
            "api_key": "secret_key_12345",
            "log_path": "/Users/alice/projects/data",
            "normal_field": "hello world",
        },
    }
    redacted = redact_dict(data)
    assert redacted["user_token"] == "[REDACTED]"
    assert redacted["nested"]["api_key"] == "[REDACTED]"
    assert "/Users/alice" not in redacted["nested"]["log_path"]
    assert redacted["nested"]["normal_field"] == "hello world"
