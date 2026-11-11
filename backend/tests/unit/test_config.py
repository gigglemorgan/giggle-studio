from pathlib import Path

from app.core.config import Settings


def test_settings_default_values():
    settings = Settings()
    assert settings.app.name == "Giggle Studio"
    assert settings.app.language == "tr"
    assert settings.server.host == "127.0.0.1"
    assert settings.server.port == 8420
    assert settings.hardware.vram_safety_margin_mb == 600
    assert settings.hardware.ram_ceiling_percent == 85
    assert "amd" in settings.hardware.exclude_vendors


def test_settings_load_from_yaml(tmp_path: Path):
    yaml_file = tmp_path / "test_giggle.yaml"
    yaml_file.write_text(
        """
app:
  name: "Custom Studio"
server:
  port: 9000
hardware:
  vram_safety_margin_mb: 800
""",
        encoding="utf-8",
    )
    custom_settings = Settings.load_from_yaml(yaml_file)
    assert custom_settings.app.name == "Custom Studio"
    assert custom_settings.server.port == 9000
    assert custom_settings.hardware.vram_safety_margin_mb == 800
