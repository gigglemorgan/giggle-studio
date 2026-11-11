from __future__ import annotations

from pathlib import Path

from app.re.backends.base import calculate_shannon_entropy
from app.re.backends.dispatcher import BinaryDispatcher


def test_shannon_entropy():
    # Constant data has 0 entropy
    assert calculate_shannon_entropy(b"AAAA" * 100) == 0.0
    # Fully random / diverse byte sequence has higher entropy
    diverse = bytes(range(256))
    assert calculate_shannon_entropy(diverse) == 8.0


def test_elf_static_analysis_on_fixture():
    fixture_path = Path("backend/tests/fixtures/binaries/hello")
    if not fixture_path.exists():
        return

    raw_bytes = fixture_path.read_bytes()
    analysis = BinaryDispatcher.analyze_bytes(raw_bytes)

    assert analysis.file_format == "ELF"
    assert analysis.bits == 64
    assert len(analysis.sections) > 0

    # Verify .text section
    sec_names = [s.name for s in analysis.sections]
    assert ".text" in sec_names

    # Verify functions detected and disassembled with Capstone
    assert len(analysis.functions) > 0
    fn_names = [f.name for f in analysis.functions]
    assert "main" in fn_names

    # Check main function assembly instructions
    main_fn = next(f for f in analysis.functions if f.name == "main")
    assert len(main_fn.instructions) > 0
    mnemonics = [i.mnemonic for i in main_fn.instructions]
    assert any(m in mnemonics for m in ("push", "sub", "call", "mov", "lea", "ret"))
