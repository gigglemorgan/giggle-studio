import struct
from pathlib import Path
from typing import Any

# GGUF Value Types
GGUF_TYPE_UINT8 = 0
GGUF_TYPE_INT8 = 1
GGUF_TYPE_UINT16 = 2
GGUF_TYPE_INT16 = 3
GGUF_TYPE_UINT32 = 4
GGUF_TYPE_INT32 = 5
GGUF_TYPE_FLOAT32 = 6
GGUF_TYPE_BOOL = 7
GGUF_TYPE_STRING = 8
GGUF_TYPE_ARRAY = 9
GGUF_TYPE_UINT64 = 10
GGUF_TYPE_INT64 = 11
GGUF_TYPE_FLOAT64 = 12


class GGUFMetadataReader:
    """Zero-dependency streaming binary parser for GGUF format files.
    Extracts architecture, quantization, context length, parameters, and chat template
    without reading tensor weights into memory.
    """

    MAGIC = b"GGUF"

    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)
        self.metadata: dict[str, Any] = {}
        self.version: int = 0
        self.tensor_count: int = 0
        self.kv_count: int = 0

    def parse(self) -> dict[str, Any]:
        if not self.file_path.exists():
            raise FileNotFoundError(f"File not found: {self.file_path}")

        file_size = self.file_path.stat().st_size
        with open(self.file_path, "rb") as f:
            magic = f.read(4)
            if magic != self.MAGIC:
                raise ValueError(f"Invalid GGUF magic: expected {self.MAGIC!r}, got {magic!r}")

            self.version = struct.unpack("<I", f.read(4))[0]
            if self.version not in (2, 3):
                raise ValueError(f"Unsupported GGUF version: {self.version}")

            self.tensor_count = struct.unpack("<Q", f.read(8))[0]
            self.kv_count = struct.unpack("<Q", f.read(8))[0]

            for _ in range(self.kv_count):
                key = self._read_string(f)
                val_type = struct.unpack("<I", f.read(4))[0]
                val = self._read_value(f, val_type)
                self.metadata[key] = val

        return self._extract_summary(file_size)

    def _read_string(self, f: Any) -> str:
        length = struct.unpack("<Q", f.read(8))[0]
        # Safety guard: limit string read length to 10 MB
        if length > 10 * 1024 * 1024:
            raise ValueError(f"Metadata string too large: {length} bytes")
        raw = f.read(length)
        return str(raw.decode("utf-8", errors="replace"))

    def _read_value(self, f: Any, val_type: int) -> Any:
        if val_type == GGUF_TYPE_UINT8:
            return struct.unpack("<B", f.read(1))[0]
        elif val_type == GGUF_TYPE_INT8:
            return struct.unpack("<b", f.read(1))[0]
        elif val_type == GGUF_TYPE_UINT16:
            return struct.unpack("<H", f.read(2))[0]
        elif val_type == GGUF_TYPE_INT16:
            return struct.unpack("<h", f.read(2))[0]
        elif val_type == GGUF_TYPE_UINT32:
            return struct.unpack("<I", f.read(4))[0]
        elif val_type == GGUF_TYPE_INT32:
            return struct.unpack("<i", f.read(4))[0]
        elif val_type == GGUF_TYPE_FLOAT32:
            return struct.unpack("<f", f.read(4))[0]
        elif val_type == GGUF_TYPE_FLOAT64:
            return struct.unpack("<d", f.read(8))[0]
        elif val_type == GGUF_TYPE_BOOL:
            return struct.unpack("<?", f.read(1))[0]
        elif val_type == GGUF_TYPE_STRING:
            return self._read_string(f)
        elif val_type == GGUF_TYPE_UINT64:
            return struct.unpack("<Q", f.read(8))[0]
        elif val_type == GGUF_TYPE_INT64:
            return struct.unpack("<q", f.read(8))[0]
        elif val_type == GGUF_TYPE_ARRAY:
            item_type = struct.unpack("<I", f.read(4))[0]
            arr_len = struct.unpack("<Q", f.read(8))[0]
            fixed_sizes = {
                GGUF_TYPE_UINT8: 1,
                GGUF_TYPE_INT8: 1,
                GGUF_TYPE_BOOL: 1,
                GGUF_TYPE_UINT16: 2,
                GGUF_TYPE_INT16: 2,
                GGUF_TYPE_UINT32: 4,
                GGUF_TYPE_INT32: 4,
                GGUF_TYPE_FLOAT32: 4,
                GGUF_TYPE_UINT64: 8,
                GGUF_TYPE_INT64: 8,
                GGUF_TYPE_FLOAT64: 8,
            }
            # For large arrays (e.g. tokenizer vocab with 150k+ tokens), seek past them without storing
            if arr_len > 100:
                if item_type in fixed_sizes:
                    f.seek(arr_len * fixed_sizes[item_type], 1)
                elif item_type == GGUF_TYPE_STRING:
                    for _ in range(arr_len):
                        slen = struct.unpack("<Q", f.read(8))[0]
                        f.seek(slen, 1)
                else:
                    for _ in range(arr_len):
                        self._read_value(f, item_type)
                return f"[Array length {arr_len} truncated]"

            items = []
            for _ in range(arr_len):
                items.append(self._read_value(f, item_type))
            return items
        else:
            raise ValueError(f"Unknown GGUF value type: {val_type}")

    def _extract_summary(self, file_size: int) -> dict[str, Any]:
        arch = self.metadata.get("general.architecture", "unknown")
        name = self.metadata.get("general.name", self.file_path.stem)
        ctx = (
            self.metadata.get(f"{arch}.context_length")
            or self.metadata.get("general.context_length")
            or 4096
        )
        block_count = (
            self.metadata.get(f"{arch}.block_count")
            or self.metadata.get(f"{arch}.layer_count")
            or 32
        )
        chat_template = self.metadata.get("tokenizer.chat_template")
        param_count = self.metadata.get("general.parameter_count")

        # Estimate parameter count if not directly in metadata
        if not param_count:
            # Typical rule of thumb from file size if 4-bit quant
            param_count = int((file_size / (0.6 * 1024 * 1024 * 1024)) * 1e9)

        # Detect quantization from filename or metadata
        quant = "unknown"
        filename_upper = self.file_path.name.upper()
        for q in [
            "Q4_K_M",
            "Q4_K_S",
            "Q5_K_M",
            "Q5_K_S",
            "Q8_0",
            "Q4_0",
            "Q4_1",
            "Q5_0",
            "Q5_1",
            "Q6_K",
            "F16",
            "BF16",
        ]:
            if q in filename_upper:
                quant = q
                break

        return {
            "name": str(name),
            "path": str(self.file_path.resolve()),
            "format": "gguf",
            "architecture": str(arch),
            "quantization": quant,
            "context_length": int(ctx),
            "layer_count": int(block_count),
            "parameters_count": f"{param_count / 1e9:.1f}B" if param_count else "unknown",
            "chat_template": chat_template,
            "file_size_bytes": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 1),
            "tensor_count": self.tensor_count,
            "metadata_raw": {
                k: v for k, v in self.metadata.items() if not isinstance(v, list) or len(v) < 10
            },
        }


def parse_gguf_metadata(file_path: Path) -> dict[str, Any]:
    """Convenience helper to parse a GGUF file."""
    reader = GGUFMetadataReader(file_path)
    return reader.parse()
