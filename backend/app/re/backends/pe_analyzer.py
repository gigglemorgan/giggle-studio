from __future__ import annotations

import hashlib
import re
from typing import Any

import capstone as cs
import pefile
from app.re.backends.base import (
    BinaryAnalysis,
    DisasmInstruction,
    ExportInfo,
    FunctionAnalysis,
    ImportInfo,
    SectionInfo,
    calculate_shannon_entropy,
)


class PEAnalyzer:
    """Analyzes Windows Portable Executable (PE) binaries using pefile and Capstone."""

    @classmethod
    def analyze(cls, raw_bytes: bytes) -> BinaryAnalysis:
        pe = pefile.PE(data=raw_bytes)

        bits = 64 if pe.FILE_HEADER.Machine == 0x8664 else 32
        entry_point = pe.OPTIONAL_HEADER.AddressOfEntryPoint + pe.OPTIONAL_HEADER.ImageBase

        cs_mode = cs.CS_MODE_64 if bits == 64 else cs.CS_MODE_32
        md = cs.Cs(cs.CS_ARCH_X86, cs_mode)
        md.detail = True

        # 1. Sections
        sections: list[SectionInfo] = []
        text_data: bytes = b""
        text_va = 0

        for sec in pe.sections:
            name = sec.Name.decode("latin-1", errors="replace").strip("\x00")
            sec_data = sec.get_data()
            entropy = calculate_shannon_entropy(sec_data)
            is_exec = bool(sec.Characteristics & 0x20000000)  # IMAGE_SCN_MEM_EXECUTE
            is_write = bool(sec.Characteristics & 0x80000000)  # IMAGE_SCN_MEM_WRITE

            sections.append(
                SectionInfo(
                    name=name,
                    virtual_address=sec.VirtualAddress + pe.OPTIONAL_HEADER.ImageBase,
                    size=sec.SizeOfRawData,
                    entropy=entropy,
                    is_executable=is_exec,
                    is_writable=is_write,
                )
            )

            if is_exec and not text_data:
                text_data = sec_data
                text_va = sec.VirtualAddress + pe.OPTIONAL_HEADER.ImageBase

        # 2. Extract Strings
        extracted_strings: list[dict[str, Any]] = []
        for match in re.finditer(b"[\x20-\x7e]{4,}", raw_bytes):
            extracted_strings.append(
                {
                    "offset": hex(match.start()),
                    "text": match.group(0).decode("ascii", errors="replace"),
                    "encoding": "ascii",
                }
            )
            if len(extracted_strings) >= 500:
                break

        # 3. Imports
        imports: list[ImportInfo] = []
        if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
            for entry in pe.DIRECTORY_ENTRY_IMPORT:
                dll_name = entry.dll.decode("latin-1", errors="replace")
                for imp in entry.imports:
                    sym = (
                        imp.name.decode("latin-1", errors="replace")
                        if imp.name
                        else f"Ordinal_{imp.ordinal}"
                    )
                    imports.append(
                        ImportInfo(library=dll_name, symbol=sym, address=imp.address or 0)
                    )

        # 4. Exports
        exports: list[ExportInfo] = []
        if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
            for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols:
                sym = (
                    exp.name.decode("latin-1", errors="replace")
                    if exp.name
                    else f"Ordinal_{exp.ordinal}"
                )
                exports.append(
                    ExportInfo(symbol=sym, address=exp.address + pe.OPTIONAL_HEADER.ImageBase)
                )

        # 5. Functions disassembly from entry point
        functions: list[FunctionAnalysis] = []
        if text_data:
            insns: list[DisasmInstruction] = []
            callees: list[str] = []
            opcodes: list[str] = []

            for insn in md.disasm(text_data[:1024], text_va):
                insns.append(
                    DisasmInstruction(
                        address=insn.address,
                        mnemonic=insn.mnemonic,
                        op_str=insn.op_str,
                        size=insn.size,
                        bytes_hex=insn.bytes.hex(),
                    )
                )
                opcodes.append(insn.mnemonic)
                if insn.mnemonic == "call":
                    callees.append(insn.op_str)

            fn_hash = hashlib.sha256(" ".join(opcodes).encode("utf-8")).hexdigest()
            functions.append(
                FunctionAnalysis(
                    name=f"entry_{hex(entry_point)}",
                    address=entry_point,
                    size=len(insns),
                    hash=fn_hash,
                    instructions=insns,
                    callees=callees,
                )
            )

        return BinaryAnalysis(
            file_format="PE",
            architecture="x86_64" if bits == 64 else "x86",
            bits=bits,
            endianness="little",
            entry_point=entry_point,
            sections=sections,
            imports=imports,
            exports=exports,
            strings=extracted_strings,
            functions=functions,
        )
