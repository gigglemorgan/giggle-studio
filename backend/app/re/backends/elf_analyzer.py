from __future__ import annotations

import hashlib
import io
import re
from typing import Any

import capstone as cs
from app.re.backends.base import (
    BinaryAnalysis,
    DisasmInstruction,
    ExportInfo,
    FunctionAnalysis,
    ImportInfo,
    SectionInfo,
    calculate_shannon_entropy,
)
from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection


class ELFAnalyzer:
    """Analyzes Linux ELF binaries using pyelftools and Capstone disassembly."""

    @classmethod
    def analyze(cls, raw_bytes: bytes) -> BinaryAnalysis:
        stream = io.BytesIO(raw_bytes)
        elf = ELFFile(stream)

        header = elf.header
        arch_machine = header.get("e_machine", "EM_NONE")
        bits = 64 if elf.elfclass == 64 else 32
        endian = "little" if elf.little_endian else "big"
        entry_point = header.get("e_entry", 0)

        # Select Capstone architecture
        cs_arch = cs.CS_ARCH_X86
        cs_mode = cs.CS_MODE_64 if bits == 64 else cs.CS_MODE_32
        if "AARCH64" in str(arch_machine) or "ARM64" in str(arch_machine):
            cs_arch = cs.CS_ARCH_ARM64
            cs_mode = cs.CS_MODE_ARM
        elif "ARM" in str(arch_machine):
            cs_arch = cs.CS_ARCH_ARM
            cs_mode = cs.CS_MODE_ARM

        md = cs.Cs(cs_arch, cs_mode)
        md.detail = True

        # 1. Parse Sections
        sections: list[SectionInfo] = []
        text_section_bytes: bytes = b""
        text_section_addr = 0

        for section in elf.iter_sections():
            sec_name = section.name
            sec_size = section.header.get("sh_size", 0)
            sec_addr = section.header.get("sh_addr", 0)
            sec_flags = section.header.get("sh_flags", 0)

            sec_data = section.data()
            entropy = calculate_shannon_entropy(sec_data)
            is_exec = bool(sec_flags & 0x4)  # SHF_EXECINSTR
            is_write = bool(sec_flags & 0x1)  # SHF_WRITE

            sections.append(
                SectionInfo(
                    name=sec_name,
                    virtual_address=sec_addr,
                    size=sec_size,
                    entropy=entropy,
                    is_executable=is_exec,
                    is_writable=is_write,
                )
            )

            if sec_name == ".text":
                text_section_bytes = sec_data
                text_section_addr = sec_addr

        # 2. Extract Strings
        extracted_strings: list[dict[str, Any]] = []
        # ASCII strings >= 4 chars
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

        # 3. Parse Symbols (Functions, Imports, Exports)
        imports: list[ImportInfo] = []
        exports: list[ExportInfo] = []
        functions_meta: dict[str, dict[str, Any]] = {}

        for section in elf.iter_sections():
            if isinstance(section, SymbolTableSection):
                for sym in section.iter_symbols():
                    sym_name = sym.name
                    sym_type = sym.entry.get("st_info", {}).get("type")
                    sym_val = sym.entry.get("st_value", 0)
                    sym_size = sym.entry.get("st_size", 0)
                    shndx = sym.entry.get("st_shndx")

                    if not sym_name:
                        continue

                    # Imports (undefined section)
                    if shndx == "SHN_UNDEF":
                        imports.append(ImportInfo(library="libc", symbol=sym_name))
                    elif sym_type == "STT_FUNC":
                        functions_meta[sym_name] = {
                            "name": sym_name,
                            "address": sym_val,
                            "size": sym_size,
                        }
                        exports.append(ExportInfo(symbol=sym_name, address=sym_val))

        # 4. Disassemble Functions
        functions: list[FunctionAnalysis] = []

        if functions_meta and text_section_bytes:
            for f_name, f_info in functions_meta.items():
                f_addr = f_info["address"]
                f_size = f_info["size"]
                if f_size <= 0:
                    f_size = 128  # default heuristic size

                # Calculate offset into .text section
                rel_offset = f_addr - text_section_addr
                if 0 <= rel_offset < len(text_section_bytes):
                    fn_code = text_section_bytes[rel_offset : rel_offset + f_size]
                    insns: list[DisasmInstruction] = []
                    callees: list[str] = []
                    opcodes: list[str] = []

                    for insn in md.disasm(fn_code, f_addr):
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
                            name=f_name,
                            address=f_addr,
                            size=f_size,
                            hash=fn_hash,
                            instructions=insns,
                            callees=callees,
                        )
                    )

        # Fallback if no symbol table: disassemble entry point or .text start
        if not functions and text_section_bytes:
            insns = []
            callees = []
            opcodes = []
            for insn in md.disasm(text_section_bytes[:512], text_section_addr):
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
                    address=entry_point or text_section_addr,
                    size=len(insns),
                    hash=fn_hash,
                    instructions=insns,
                    callees=callees,
                )
            )

        return BinaryAnalysis(
            file_format="ELF",
            architecture=str(arch_machine),
            bits=bits,
            endianness=endian,
            entry_point=entry_point,
            sections=sections,
            imports=imports,
            exports=exports,
            strings=extracted_strings,
            functions=functions,
        )
