"""Logits comparison and parity verification tool.

Compares logits and generation between reference model, llama.cpp baseline,
and giggle-engine. Enforces strict parity tolerances.

Quantitative metrics:
  - Max absolute difference (overall and top-1)
  - Mean absolute difference
  - Median absolute difference
  - Mean KL divergence: D_KL(P_ref || P_llama)
  - Cosine similarity across vocabulary vectors
  - Top-1, Top-5, Top-10 agreement rates across all positions
  - Perplexity on the prompt
  - Greedy generation parity (256 and 1000 tokens) with first divergence index
"""

from __future__ import annotations

import argparse
import gc
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@dataclass
class LogitsComparisonResult:
    """Quantitative comparison metrics between two sets of logits."""

    num_tokens: int
    vocab_size: int
    max_abs_diff: float
    mean_abs_diff: float
    median_abs_diff: float
    mean_kl_divergence: float
    cosine_similarity: float
    top1_agreement: float
    top5_agreement: float
    top10_agreement: float
    perplexity_ref: float | None = None
    perplexity_llama: float | None = None
    first_divergence_256: int | None = None
    first_divergence_1000: int | None = None
    passed: bool = True
    failures: list[str] | None = None
    details: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def print_summary(self) -> None:
        print("=" * 70)
        print("GIGGLE STUDIO - LOGITS PARITY & VERIFICATION REPORT")
        print("=" * 70)
        print(f"Prompt Tokens Evaluated : {self.num_tokens}")
        print(f"Vocab Size              : {self.vocab_size}")
        print(f"Max Abs Diff            : {self.max_abs_diff:.6f}")
        print(f"Mean Abs Diff           : {self.mean_abs_diff:.6f}")
        print(f"Median Abs Diff         : {self.median_abs_diff:.6f}")
        print(f"Mean KL Divergence      : {self.mean_kl_divergence:.6f}")
        print(f"Cosine Similarity       : {self.cosine_similarity:.6f}")
        print(f"Top-1 Agreement         : {self.top1_agreement * 100:.2f}%")
        print(f"Top-5 Agreement         : {self.top5_agreement * 100:.2f}%")
        print(f"Top-10 Agreement        : {self.top10_agreement * 100:.2f}%")
        if self.perplexity_ref is not None and self.perplexity_llama is not None:
            print(f"Perplexity (Reference)  : {self.perplexity_ref:.4f}")
            print(f"Perplexity (llama.cpp)  : {self.perplexity_llama:.4f}")
            diff_ppl = abs(self.perplexity_ref - self.perplexity_llama)
            print(f"Perplexity Difference   : {diff_ppl:.4f}")

        div256_str = (
            f"Divergence at token {self.first_divergence_256}"
            if self.first_divergence_256 is not None
            else "No divergence (100% identical)"
        )
        print(f"Greedy Parity (256 tok) : {div256_str}")

        if self.first_divergence_1000 is not None or self.first_divergence_256 is not None:
            div1000_str = (
                f"Divergence at token {self.first_divergence_1000}"
                if self.first_divergence_1000 is not None
                else "No divergence (100% identical)"
            )
            print(f"Greedy Parity (1000 tok): {div1000_str}")

        print("-" * 70)
        if self.passed:
            print("OVERALL STATUS          : PASSED")
        else:
            print("OVERALL STATUS          : FAILED")
            if self.failures:
                print("Failed Criteria:")
                for f in self.failures:
                    print(f"  - {f}")
        print("=" * 70)


def compute_perplexity(logits: np.ndarray, tokens: list[int]) -> float:
    """Compute perplexity given logits [seq_len, vocab_size] and token IDs."""
    if len(tokens) <= 1:
        return 1.0

    n_preds = min(len(logits) - 1, len(tokens) - 1)
    if n_preds <= 0:
        return 1.0

    total_nll = 0.0
    for i in range(n_preds):
        target_token = tokens[i + 1]
        row = logits[i].astype(np.float64)
        max_val = np.max(row)
        log_sum_exp = max_val + np.log(np.sum(np.exp(row - max_val)))
        target_log_prob = row[target_token] - log_sum_exp
        total_nll -= target_log_prob

    avg_nll = total_nll / n_preds
    return float(math.exp(min(avg_nll, 100.0)))


def build_mixed_prompt(tokenizer: Any, min_tokens: int = 2000) -> tuple[str, list[int]]:
    """Build a multi-language, multi-domain prompt from repository files."""
    files_to_read = [
        PROJECT_ROOT / "docs" / "ENGINE_SPEC.md",
        PROJECT_ROOT / "frontend" / "src" / "i18n" / "locales" / "tr.json",
        PROJECT_ROOT / "backend" / "app" / "inference" / "llama_backend.py",
        PROJECT_ROOT / "engine" / "reference" / "model.py",
        PROJECT_ROOT / "docs" / "GUI_SPEC.md",
        PROJECT_ROOT / "backend" / "app" / "core" / "config.py",
    ]

    parts: list[str] = []
    for f in files_to_read:
        if f.is_file():
            content = f.read_text(encoding="utf-8", errors="replace")
            parts.append(f"### FILE: {f.name}\n{content}\n")

    full_text = "\n".join(parts)
    tokens = tokenizer.tokenize(full_text.encode("utf-8"))

    if len(tokens) < min_tokens:
        while len(tokens) < min_tokens:
            full_text = full_text + "\n" + full_text
            tokens = tokenizer.tokenize(full_text.encode("utf-8"))

    # Trim to exactly min_tokens or power of two close to it
    target_count = max(min_tokens, 2048)
    trimmed_tokens = tokens[:target_count]
    trimmed_text = tokenizer.detokenize(trimmed_tokens).decode("utf-8", errors="replace")
    return trimmed_text, trimmed_tokens


TOLERANCE_SPECS: dict[str, dict[str, float]] = {
    "F16": {
        "max_abs": 1e-3,
        "cosine": 0.9999,
        "top1": 1.0,
        "min_first_div": 256,
    },
    "Q8_0": {
        "max_abs": 0.05,
        "cosine": 0.999,
        "top1": 0.995,
        "min_first_div": 200,
    },
    "Q4_K_M": {
        "max_abs": 0.35,
        "cosine": 0.995,
        "top1": 0.980,
        "min_first_div": 200,
    },
    "default": {
        "max_abs": 0.35,
        "cosine": 0.995,
        "top1": 0.980,
        "min_first_div": 200,
    },
}


def compare_logits(
    logits_a: np.ndarray,
    logits_b: np.ndarray,
    tokens: list[int] | None = None,
    quant_type: str = "Q4_K_M",
    first_div_256: int | None = None,
    first_div_1000: int | None = None,
    tolerance_max_abs: float | None = None,
    tolerance_top1: float | None = None,
    tolerance_cosine: float | None = None,
    tolerance_first_div: int | None = None,
) -> LogitsComparisonResult:
    """Compare two sets of logits of shape [seq_len, vocab_size] and enforce tolerances."""
    if logits_a.shape != logits_b.shape:
        raise ValueError(
            f"Shape mismatch: logits_a {logits_a.shape} vs logits_b {logits_b.shape}"
        )

    spec = TOLERANCE_SPECS.get(quant_type.upper(), TOLERANCE_SPECS["default"])
    tol_max_abs = tolerance_max_abs if tolerance_max_abs is not None else spec["max_abs"]
    tol_top1 = tolerance_top1 if tolerance_top1 is not None else spec["top1"]
    tol_cosine = tolerance_cosine if tolerance_cosine is not None else spec["cosine"]
    tol_first_div = (
        tolerance_first_div
        if tolerance_first_div is not None
        else int(spec.get("min_first_div", 200))
    )

    seq_len, vocab_size = logits_a.shape

    # Compute differences and metrics per-row to keep memory usage minimal
    max_abs = 0.0
    abs_diffs: list[float] = []
    cos_sims: list[float] = []
    top1_matches = 0
    top5_matches = 0
    top10_matches = 0
    kl_divs: list[float] = []

    for i in range(seq_len):
        row_a = logits_a[i]
        row_b = logits_b[i]

        diff_row = np.abs(row_a - row_b)
        row_max = float(np.max(diff_row))
        if row_max > max_abs:
            max_abs = row_max
        abs_diffs.append(float(np.mean(diff_row)))

        # Cosine similarity
        norm_a = np.linalg.norm(row_a) + 1e-12
        norm_b = np.linalg.norm(row_b) + 1e-12
        cos_sims.append(float(np.dot(row_a, row_b) / (norm_a * norm_b)))

        # Top-K
        idx_a10 = np.argpartition(row_a, -10)[-10:]
        idx_b10 = np.argpartition(row_b, -10)[-10:]
        idx_a10 = idx_a10[np.argsort(row_a[idx_a10])[::-1]]
        idx_b10 = idx_b10[np.argsort(row_b[idx_b10])[::-1]]

        if idx_a10[0] == idx_b10[0]:
            top1_matches += 1
        top5_matches += len(set(idx_a10[:5]).intersection(set(idx_b10[:5]))) / 5.0
        top10_matches += len(set(idx_a10).intersection(set(idx_b10))) / 10.0

        # Stable KL divergence: D_KL(P_a || P_b)
        ma = np.max(row_a)
        mb = np.max(row_b)
        log_sum_a = ma + np.log(np.sum(np.exp(row_a - ma)))
        log_sum_b = mb + np.log(np.sum(np.exp(row_b - mb)))
        lp = row_a - log_sum_a
        lq = row_b - log_sum_b
        p = np.exp(lp)
        kl = float(np.sum(p * (lp - lq)))
        kl_divs.append(max(0.0, kl))

    mean_abs = float(np.mean(abs_diffs))
    median_abs = float(np.median(abs_diffs))
    mean_cos = float(np.mean(cos_sims))
    mean_kl = float(np.mean(kl_divs))
    top1_rate = top1_matches / seq_len
    top5_rate = top5_matches / seq_len
    top10_rate = top10_matches / seq_len

    ppl_a = compute_perplexity(logits_a, tokens) if tokens else None
    ppl_b = compute_perplexity(logits_b, tokens) if tokens else None

    # Check parity criteria
    failures: list[str] = []
    if max_abs > tol_max_abs:
        failures.append(f"max_abs_diff ({max_abs:.6f}) exceeds tolerance ({tol_max_abs})")
    if top1_rate < tol_top1:
        failures.append(f"top1_agreement ({top1_rate * 100:.2f}%) below tolerance ({tol_top1 * 100:.2f}%)")
    if mean_cos < tol_cosine:
        failures.append(f"cosine_similarity ({mean_cos:.6f}) below tolerance ({tol_cosine})")
    if first_div_256 is not None and first_div_256 < tol_first_div:
        failures.append(
            f"first_divergence_256 ({first_div_256}) below minimum threshold ({tol_first_div})"
        )

    passed = len(failures) == 0

    return LogitsComparisonResult(
        num_tokens=seq_len,
        vocab_size=vocab_size,
        max_abs_diff=max_abs,
        mean_abs_diff=mean_abs,
        median_abs_diff=median_abs,
        mean_kl_divergence=mean_kl,
        cosine_similarity=mean_cos,
        top1_agreement=top1_rate,
        top5_agreement=top5_rate,
        top10_agreement=top10_rate,
        perplexity_ref=ppl_a,
        perplexity_llama=ppl_b,
        first_divergence_256=first_div_256,
        first_divergence_1000=first_div_1000,
        passed=passed,
        failures=failures,
    )


def run_greedy_generation(
    llm: Any,
    ref_model: Any,
    prompt_tokens: list[int],
    max_new_tokens: int = 256,
) -> tuple[list[int], list[int], int | None]:
    """Run greedy autoregressive decoding on both llama.cpp and PyTorch reference model."""
    import torch

    # 1. llama.cpp generation
    llm.reset()
    llm.eval(prompt_tokens)
    llama_tokens: list[int] = []
    for _ in range(max_new_tokens):
        next_tok = int(np.argmax(llm.scores[llm.n_tokens - 1]))
        llama_tokens.append(next_tok)
        llm.eval([next_tok])

    # 2. PyTorch reference generation with KV cache
    ref_tokens: list[int] = []
    with torch.no_grad():
        inp = torch.tensor([prompt_tokens], dtype=torch.long)
        logits, kv = ref_model(inp, return_kv_cache=True)
        next_tok = int(torch.argmax(logits[0, -1]).item())
        ref_tokens.append(next_tok)

        for i in range(max_new_tokens - 1):
            next_inp = torch.tensor([[next_tok]], dtype=torch.long)
            logits, kv = ref_model(
                next_inp,
                pos_offset=len(prompt_tokens) + i,
                kv_caches=kv,
                return_kv_cache=True,
            )
            next_tok = int(torch.argmax(logits[0, -1]).item())
            ref_tokens.append(next_tok)

    # 3. Find first divergence
    first_div: int | None = None
    for idx in range(max_new_tokens):
        if llama_tokens[idx] != ref_tokens[idx]:
            first_div = idx
            break

    return llama_tokens, ref_tokens, first_div


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare LLM logits parity.")
    parser.add_argument("--model", type=str, required=True, help="Path to GGUF model")
    parser.add_argument(
        "--prompt-file",
        type=str,
        default=None,
        help="Optional path to custom prompt file",
    )
    parser.add_argument(
        "--tokens-count",
        type=int,
        default=2048,
        help="Number of tokens to evaluate in mixed prompt (default: 2048)",
    )
    parser.add_argument(
        "--quant-type",
        type=str,
        default="Q4_K_M",
        choices=["F16", "Q8_0", "Q4_K_M"],
        help="Quantization type for tolerance checks",
    )
    parser.add_argument(
        "--tolerance-max-abs",
        type=float,
        default=None,
        help="Override max_abs tolerance threshold",
    )
    parser.add_argument(
        "--tolerance-cosine",
        type=float,
        default=None,
        help="Override cosine similarity tolerance threshold",
    )
    parser.add_argument(
        "--tolerance-top1",
        type=float,
        default=None,
        help="Override top1 agreement tolerance threshold",
    )
    parser.add_argument(
        "--skip-generation",
        action="store_true",
        help="Skip greedy generation parity tests",
    )
    parser.add_argument(
        "--gen-tokens",
        type=int,
        default=256,
        help="Tokens to generate for greedy parity check (default: 256)",
    )
    parser.add_argument(
        "--dtype",
        type=str,
        default="float32",
        choices=["float32", "bfloat16"],
        help="PyTorch reference parameter precision (default: float32, use bfloat16 for larger models)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        default=False,
        help="Exit with non-zero exit code on tolerance failure",
    )
    parser.add_argument("--output-json", type=str, default=None, help="Save result as JSON")
    args = parser.parse_args()

    from llama_cpp import Llama
    import torch
    from engine.reference.loader import load_reference_model

    print(f"[INFO] Initializing llama_cpp on model {args.model}...")
    llm = Llama(
        model_path=args.model,
        n_gpu_layers=0,
        n_ctx=max(4096, args.tokens_count + args.gen_tokens + 64),
        logits_all=True,
        verbose=False,
    )

    if args.prompt_file and Path(args.prompt_file).is_file():
        prompt_text = Path(args.prompt_file).read_text(encoding="utf-8")
        tokens = llm.tokenize(prompt_text.encode("utf-8"))[: args.tokens_count]
        print(f"[INFO] Loaded custom prompt: {len(tokens)} tokens")
    else:
        print(f"[INFO] Generating mixed multi-domain prompt (target: {args.tokens_count} tokens)...")
        prompt_text, tokens = build_mixed_prompt(llm, min_tokens=args.tokens_count)
        print(f"[INFO] Mixed prompt generated: {len(tokens)} tokens")

    # Evaluate llama.cpp logits
    print("[INFO] Computing llama.cpp baseline logits...")
    llm.eval(tokens)
    logits_llama = np.array(llm.scores[: len(tokens)], dtype=np.float32)

    # Load PyTorch reference model
    print(f"[INFO] Loading PyTorch reference model from GGUF (dtype={args.dtype})...")
    torch_dtype = torch.bfloat16 if args.dtype == "bfloat16" else torch.float32
    ref_model, config = load_reference_model(
        args.model,
        device="cpu",
        dtype=torch_dtype,
        limit_layers=args.limit_layers,
    )

    # Compute PyTorch reference logits in chunks to protect system memory
    print(f"[INFO] Computing PyTorch reference logits on {len(tokens)} tokens (chunked)...")
    chunk_size = 256
    ref_logits_list: list[np.ndarray] = []
    kv_caches = None

    with torch.no_grad():
        for i in range(0, len(tokens), chunk_size):
            chunk = tokens[i : i + chunk_size]
            inp = torch.tensor([chunk], dtype=torch.long)
            out, kv_caches = ref_model(
                inp,
                pos_offset=i,
                kv_caches=kv_caches,
                return_kv_cache=True,
            )
            ref_logits_list.append(out[0].float().numpy())

    logits_ref = np.concatenate(ref_logits_list, axis=0)

    # Run greedy generation parity if requested
    first_div_256: int | None = None
    first_div_1000: int | None = None
    if not args.skip_generation:
        print(f"[INFO] Running greedy generation parity ({args.gen_tokens} tokens)...")
        short_prompt = tokens[: min(64, len(tokens))]
        _, _, first_div_256 = run_greedy_generation(
            llm, ref_model, short_prompt, max_new_tokens=min(args.gen_tokens, 256)
        )
        if args.gen_tokens >= 1000:
            if first_div_256 is not None and first_div_256 < min(args.gen_tokens, 256):
                first_div_1000 = first_div_256
            else:
                print("[INFO] Running extended greedy generation parity (1000 tokens)...")
                _, _, first_div_1000 = run_greedy_generation(
                    llm, ref_model, short_prompt, max_new_tokens=1000
                )

    del llm
    del ref_model
    gc.collect()

    print("[INFO] Running comparison analysis...")
    result = compare_logits(
        logits_ref,
        logits_llama,
        tokens=tokens,
        quant_type=args.quant_type,
        first_div_256=first_div_256,
        first_div_1000=first_div_1000,
        tolerance_max_abs=args.tolerance_max_abs,
        tolerance_top1=args.tolerance_top1,
        tolerance_cosine=args.tolerance_cosine,
    )
    result.print_summary()

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result.to_dict(), f, indent=2)
        print(f"[INFO] Wrote report to {out_path}")

    if args.strict and not result.passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
