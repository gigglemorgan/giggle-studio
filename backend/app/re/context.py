from __future__ import annotations

from app.re.backends.base import FunctionAnalysis


class REContextBuilder:
    """Constructs token-budgeted prompt contexts with leaf summaries and evidence citations."""

    @classmethod
    def build_function_context(
        cls,
        func: FunctionAnalysis,
        callee_summaries: dict[str, str] | None = None,
        referenced_strings: list[str] | None = None,
        max_instructions: int = 150,
    ) -> str:
        insn_lines: list[str] = []
        for insn in func.instructions[:max_instructions]:
            insn_lines.append(f"{hex(insn.address)}: {insn.mnemonic:<8} {insn.op_str}")

        if len(func.instructions) > max_instructions:
            insn_lines.append(
                f"... ({len(func.instructions) - max_instructions} more instructions truncated)"
            )

        disasm_str = "\n".join(insn_lines)

        strings_str = ""
        if referenced_strings:
            strings_str = (
                "REFERENCED STRINGS:\n"
                + "\n".join(f"- {s}" for s in referenced_strings[:15])
                + "\n\n"
            )

        callees_str = ""
        if callee_summaries:
            callees_str = "CALLEE BEHAVIOR SUMMARIES (Bottom-up Context):\n"
            for c_name, c_summary in callee_summaries.items():
                callees_str += f"- `{c_name}`: {c_summary}\n"
            callees_str += "\n"

        return f"""FUNCTION: {func.name} (Address: {hex(func.address)}, Size: {func.size} bytes)

{strings_str}{callees_str}DISASSEMBLY:
```x86asm
{disasm_str}
```
"""
