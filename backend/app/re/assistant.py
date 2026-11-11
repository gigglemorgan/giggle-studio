from __future__ import annotations

import logging
import re
from typing import Any

from app.db.models.entities import RESummaryModel
from app.db.session import AsyncSessionLocal
from app.inference.supervisor import supervisor
from app.re.backends.base import FunctionAnalysis
from app.re.context import REContextBuilder
from sqlalchemy import select

logger = logging.getLogger("giggle.re.assistant")


class REAssistant:
    """Provides evidence-grounded AI analysis, YARA rule generation, and rename proposals."""

    @classmethod
    async def analyze_function(
        cls,
        func: FunctionAnalysis,
        callee_summaries: dict[str, str] | None = None,
        referenced_strings: list[str] | None = None,
    ) -> dict[str, Any]:
        """Analyzes function disassembly, checking cache by function opcode hash first."""
        # 1. Check cache by function hash
        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(RESummaryModel).where(RESummaryModel.function_hash == func.hash)
            )
            cached = res.scalars().first()
            if cached:
                return {
                    "function_name": func.name,
                    "address": hex(func.address),
                    "summary": cached.summary_text,
                    "citations": cached.evidence_citations_json or [],
                    "confidence": cached.confidence,
                    "cached": True,
                }

        context = REContextBuilder.build_function_context(
            func=func,
            callee_summaries=callee_summaries,
            referenced_strings=referenced_strings,
        )

        prompt = f"""You are the Giggle Studio Binary Analysis AI.
Analyze the following disassembled function. You MUST follow these strict rules:
1. Ground every finding with an exact instruction address citation (e.g. [0x40112a]).
2. Explain: Purpose, Parameters, Return value, and Potential Security/Cryptographic/Defensive Relevance.
3. Be concise and precise. No fluff.

{context}

ANALYSIS AND CITATIONS:"""

        summary_text = ""
        citations: list[str] = []

        if supervisor.current_model_path and supervisor.is_alive():
            sampling = {"temperature": 0.1, "max_tokens": 512}
            chunks: list[str] = []
            try:
                async for chunk in supervisor.generate_stream(prompt=prompt, sampling=sampling):
                    token = chunk.get("token", "")
                    if token:
                        chunks.append(str(token))
                summary_text = "".join(chunks).strip()
                # Extract address citations
                citations = list(set(re.findall(r"0x[0-9a-fA-F]+", summary_text)))
            except Exception as e:
                logger.error("Inference failed during RE analysis: %s", e)

        if not summary_text:
            # Fallback static heuristic summary
            call_count = len(func.callees)
            insn_count = len(func.instructions)
            summary_text = (
                f"Statik Sezgisel Analiz: Fonksiyon {insn_count} makine komutundan oluşmaktadır. "
                f"{call_count} adet alt fonksiyon çağrısı ('call') tespit edilmiştir ({', '.join(func.callees[:4]) or 'çağrı yok'}). "
                f"Gövde karmaşıklığı: {'orta' if insn_count > 30 else 'düşük'}."
            )
            citations = [hex(func.address)]

        # Cache summary in database
        async with AsyncSessionLocal() as db:
            new_cache = RESummaryModel(
                function_hash=func.hash,
                summary_text=summary_text,
                evidence_citations_json=citations,
                confidence=0.9 if citations else 0.7,
            )
            db.add(new_cache)
            await db.commit()

        return {
            "function_name": func.name,
            "address": hex(func.address),
            "summary": summary_text,
            "citations": citations,
            "confidence": 0.9 if citations else 0.7,
            "cached": False,
        }

    @classmethod
    def generate_yara_rule(cls, sample_meta: dict[str, Any], strings: list[dict[str, Any]]) -> str:
        """Generates a defensive YARA rule with hashes and unique string indicators."""
        sha256 = sample_meta.get("sha256", "0" * 64)
        rule_name = f"rule_giggle_{sha256[:12]}"
        filesize = sample_meta.get("file_size", 0)

        # Select up to 5 unique strings
        string_lines = []
        string_conds = []
        idx = 0
        for s in strings:
            text = s.get("text", "")
            # Filter common short or ascii strings
            if len(text) >= 6 and all(c.isprintable() for c in text):
                clean_text = text.replace("\\", "\\\\").replace('"', '\\"')
                string_lines.append(f'        $s{idx} = "{clean_text}" ascii')
                string_conds.append(f"$s{idx}")
                idx += 1
                if idx >= 5:
                    break

        if not string_lines:
            string_lines.append('        $dummy = "GiggleStudio"')
            string_conds.append("$dummy")

        cond_str = " or ".join(string_conds)

        rule = f"""/*
    Defensive YARA Rule generated by Giggle Studio
    Author: Sedat-gigglemorgan
    Target SHA256: {sha256}
*/

rule {rule_name}
{{
    meta:
        description = "Defensive IOC rule for sample {sha256[:16]}"
        author = "Sedat-gigglemorgan"
        date = "2026-11-12"
        sha256 = "{sha256}"
        file_size = "{filesize} bytes"

    strings:
{chr(10).join(string_lines)}

    condition:
        uint16(0) == 0x457f or uint16(0) == 0x5a4d and
        filesize < {filesize + 1048576} and
        ({cond_str})
}}
"""
        return rule
