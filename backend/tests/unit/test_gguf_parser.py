import struct
from pathlib import Path

from app.inference.gguf_parser import GGUFMetadataReader


def test_gguf_parser_synthetic(tmp_path: Path):
    gguf_path = tmp_path / "tiny_test_model.gguf"

    # Construct synthetic valid GGUF file
    with open(gguf_path, "wb") as f:
        # Magic "GGUF"
        f.write(b"GGUF")
        # Version 3
        f.write(struct.pack("<I", 3))
        # Tensor count: 12
        f.write(struct.pack("<Q", 12))
        # KV count: 4
        f.write(struct.pack("<Q", 4))

        # 1. general.architecture = "llama"
        key = b"general.architecture"
        f.write(struct.pack("<Q", len(key)) + key)
        f.write(struct.pack("<I", 8))  # type STRING
        val = b"llama"
        f.write(struct.pack("<Q", len(val)) + val)

        # 2. llama.context_length = 8192
        key = b"llama.context_length"
        f.write(struct.pack("<Q", len(key)) + key)
        f.write(struct.pack("<I", 4))  # type UINT32
        f.write(struct.pack("<I", 8192))

        # 3. llama.block_count = 28
        key = b"llama.block_count"
        f.write(struct.pack("<Q", len(key)) + key)
        f.write(struct.pack("<I", 4))  # type UINT32
        f.write(struct.pack("<I", 28))

        # 4. general.parameter_count = 3000000000 (3B)
        key = b"general.parameter_count"
        f.write(struct.pack("<Q", len(key)) + key)
        f.write(struct.pack("<I", 10))  # type UINT64
        f.write(struct.pack("<Q", 3000000000))

    reader = GGUFMetadataReader(gguf_path)
    summary = reader.parse()

    assert summary["architecture"] == "llama"
    assert summary["context_length"] == 8192
    assert summary["layer_count"] == 28
    assert summary["parameters_count"] == "3.0B"
    assert summary["tensor_count"] == 12
