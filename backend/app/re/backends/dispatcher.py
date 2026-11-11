from __future__ import annotations

from app.re.backends.base import BinaryAnalysis
from app.re.backends.elf_analyzer import ELFAnalyzer
from app.re.backends.pe_analyzer import PEAnalyzer


class BinaryDispatcher:
    """Detects binary format from magic headers and runs appropriate static analyzer."""

    @classmethod
    def analyze_bytes(cls, raw_bytes: bytes) -> BinaryAnalysis:
        if raw_bytes.startswith(b"\x7fELF"):
            return ELFAnalyzer.analyze(raw_bytes)
        elif raw_bytes.startswith(b"MZ"):
            return PEAnalyzer.analyze(raw_bytes)
        else:
            raise ValueError(
                "Unsupported binary format. Giggle Studio supports ELF and PE binaries."
            )
