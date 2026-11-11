from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


def calculate_shannon_entropy(data: bytes) -> float:
    """Calculates Shannon entropy (0.0 to 8.0 bits per byte)."""
    if not data:
        return 0.0
    entropy = 0.0
    length = len(data)
    counts: dict[int, int] = {}
    for b in data:
        counts[b] = counts.get(b, 0) + 1

    for count in counts.values():
        p = count / length
        entropy -= p * math.log2(p)
    return round(entropy, 4)


@dataclass
class SectionInfo:
    name: str
    virtual_address: int
    size: int
    entropy: float
    is_executable: bool
    is_writable: bool


@dataclass
class ImportInfo:
    library: str
    symbol: str
    address: int = 0


@dataclass
class ExportInfo:
    symbol: str
    address: int


@dataclass
class DisasmInstruction:
    address: int
    mnemonic: str
    op_str: str
    size: int
    bytes_hex: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "address": hex(self.address),
            "address_int": self.address,
            "mnemonic": self.mnemonic,
            "op_str": self.op_str,
            "size": self.size,
            "bytes_hex": self.bytes_hex,
        }


@dataclass
class FunctionAnalysis:
    name: str
    address: int
    size: int
    hash: str
    instructions: list[DisasmInstruction] = field(default_factory=list)
    callees: list[str] = field(default_factory=list)
    xrefs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "address": hex(self.address),
            "address_int": self.address,
            "size": self.size,
            "hash": self.hash,
            "instructions_count": len(self.instructions),
            "callees": self.callees,
            "xrefs": self.xrefs,
            "assembly": [i.to_dict() for i in self.instructions],
        }


@dataclass
class BinaryAnalysis:
    file_format: str
    architecture: str
    bits: int
    endianness: str
    entry_point: int
    sections: list[SectionInfo] = field(default_factory=list)
    imports: list[ImportInfo] = field(default_factory=list)
    exports: list[ExportInfo] = field(default_factory=list)
    strings: list[dict[str, Any]] = field(default_factory=list)
    functions: list[FunctionAnalysis] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "format": self.file_format,
            "architecture": self.architecture,
            "bits": self.bits,
            "endianness": self.endianness,
            "entry_point": hex(self.entry_point),
            "sections": [
                {
                    "name": s.name,
                    "virtual_address": hex(s.virtual_address),
                    "size": s.size,
                    "entropy": s.entropy,
                    "is_executable": s.is_executable,
                    "is_writable": s.is_writable,
                }
                for s in self.sections
            ],
            "imports": [
                {"library": imp.library, "symbol": imp.symbol, "address": hex(imp.address)}
                for imp in self.imports
            ],
            "exports": [
                {"symbol": exp.symbol, "address": hex(exp.address)} for exp in self.exports
            ],
            "strings": self.strings[:200],  # Return up to 200 extracted strings
            "functions": [f.to_dict() for f in self.functions],
        }
