"""Logits comparison and parity verification tool.

Compares logits between reference model, llama.cpp baseline, and future giggle-engine.
Computes:
  - Max absolute difference
  - Mean absolute difference
  - Cosine similarity
  - Top-1, Top-5, Top-10 agreement
  - Perplexity on target tokens
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass
class LogitsComparisonResult:
    """Quantitative comparison metrics between two sets of logits."""

    num_tokens: int
    vocab_size: int
    max_abs_diff: float
    mean_abs_diff: float
    median_abs_diff: float
    cosine_similarity: float
    top1_agreement: float
    top5_agreement: float
    top10_agreement: float
    perplexity_a: float | None = None
    perplexity_b: float | None = None
    passed: bool = True
    details: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def print_summary(self) -> None:
        print("=" * 60)
        print("LOGITS COMPARISON & PARITY REPORT")
        print("=" * 60)
        print(f"Tokens Evaluated : {self.num_tokens}")
        print(f"Vocab Size       : {self.vocab_size}")
        print(f"Max Abs Diff     : {self.max_abs_diff:.6f}")
        print(f"Mean Abs Diff    : {self.mean_abs_diff:.6f}")
        print(f"Median Abs Diff  : {self.median_abs_diff:.6f}")
        print(f"Cosine Similarity: {self.cosine_similarity:.6f}")
        print(f"Top-1 Agreement  : {self.top1_agreement * 100:.2f}%")
        print(f"Top-5 Agreement  : {self.top5_agreement * 100:.2f}%")
        print(f"Top-10 Agreement : {self.top10_agreement * 100:.2f}%")
        if self.perplexity_a is not None and self.perplexity_b is not None:
            print(f"Perplexity (A)   : {self.perplexity_a:.4f}")
            print(f"Perplexity (B)   : {self.perplexity_b:.4f}")
            diff_ppl = abs(self.perplexity_a - self.perplexity_b)
            print(f"Perplexity Diff  : {diff_ppl:.4f}")
        status = "PASSED" if self.passed else "FAILED"
        print(f"Status           : {status}")
        print("=" * 60)


def compute_perplexity(logits: np.ndarray, tokens: list[int]) -> float:
    """Compute perplexity given logits [seq_len, vocab_size] and token IDs."""
    if len(tokens) <= 1:
        return 1.0

    # For each position i in 0..len-2, logits[i] predicts token tokens[i+1]
    n_preds = min(len(logits) - 1, len(tokens) - 1)
    if n_preds <= 0:
        return 1.0

    total_nll = 0.0
    for i in range(n_preds):
        target_token = tokens[i + 1]
        row = logits[i].astype(np.float64)
        # Numerically stable log-softmax
        max_val = np.max(row)
        log_sum_exp = max_val + np.log(np.sum(np.exp(row - max_val)))
        target_log_prob = row[target_token] - log_sum_exp
        total_nll -= target_log_prob

    avg_nll = total_nll / n_preds
    return float(math.exp(min(avg_nll, 100.0)))


TOLERANCE_SPECS: dict[str, dict[str, float]] = {
    "F16": {"max_abs": 0.02, "top1": 0.99, "cosine": 0.9999},
    "Q8_0": {"max_abs": 0.40, "top1": 0.98, "cosine": 0.9995},
    "Q4_K_M": {"max_abs": 1.50, "top1": 0.95, "cosine": 0.9980},
    "default": {"max_abs": 1.50, "top1": 0.90, "cosine": 0.9950},
}


def compare_logits(
    logits_a: np.ndarray,
    logits_b: np.ndarray,
    tokens: list[int] | None = None,
    quant_type: str = "Q4_K_M",
    tolerance_max_abs: float | None = None,
    tolerance_top1: float | None = None,
    tolerance_cosine: float | None = None,
) -> LogitsComparisonResult:
    """Compare two sets of logits of shape [seq_len, vocab_size]."""
    if logits_a.shape != logits_b.shape:
        raise ValueError(
            f"Shape mismatch: logits_a {logits_a.shape} vs logits_b {logits_b.shape}"
        )

    spec = TOLERANCE_SPECS.get(quant_type.upper(), TOLERANCE_SPECS["default"])
    tol_max_abs = tolerance_max_abs if tolerance_max_abs is not None else spec["max_abs"]
    tol_top1 = tolerance_top1 if tolerance_top1 is not None else spec["top1"]
    tol_cosine = tolerance_cosine if tolerance_cosine is not None else spec["cosine"]

    seq_len, vocab_size = logits_a.shape
    diff = np.abs(logits_a.astype(np.float64) - logits_b.astype(np.float64))

    max_abs = float(np.max(diff))
    mean_abs = float(np.mean(diff))
    median_abs = float(np.median(diff))

    # Cosine similarity across vocab vectors
    norm_a = np.linalg.norm(logits_a, axis=-1, keepdims=True) + 1e-12
    norm_b = np.linalg.norm(logits_b, axis=-1, keepdims=True) + 1e-12
    cos_sims = np.sum((logits_a / norm_a) * (logits_b / norm_b), axis=-1)
    mean_cos = float(np.mean(cos_sims))

    # Top-K agreements
    top1_matches = 0
    top5_matches = 0
    top10_matches = 0

    for i in range(seq_len):
        row_a = logits_a[i]
        row_b = logits_b[i]

        idx_a10 = np.argpartition(row_a, -10)[-10:]
        idx_b10 = np.argpartition(row_b, -10)[-10:]

        # Sort descending
        idx_a10 = idx_a10[np.argsort(row_a[idx_a10])[::-1]]
        idx_b10 = idx_b10[np.argsort(row_b[idx_b10])[::-1]]

        if idx_a10[0] == idx_b10[0]:
            top1_matches += 1

        top5_matches += len(set(idx_a10[:5]).intersection(set(idx_b10[:5]))) / 5.0
        top10_matches += len(set(idx_a10).intersection(set(idx_b10))) / 10.0

    top1_rate = top1_matches / seq_len
    top5_rate = top5_matches / seq_len
    top10_rate = top10_matches / seq_len

    ppl_a = compute_perplexity(logits_a, tokens) if tokens else None
    ppl_b = compute_perplexity(logits_b, tokens) if tokens else None

    # Check parity criteria
    passed = (max_abs <= tol_max_abs) and (top1_rate >= tol_top1) and (mean_cos >= tol_cosine)

    return LogitsComparisonResult(
        num_tokens=seq_len,
        vocab_size=vocab_size,
        max_abs_diff=max_abs,
        mean_abs_diff=mean_abs,
        median_abs_diff=median_abs,
        cosine_similarity=mean_cos,
        top1_agreement=top1_rate,
        top5_agreement=top5_rate,
        top10_agreement=top10_rate,
        perplexity_a=ppl_a,
        perplexity_b=ppl_b,
        passed=passed,
    )


def extract_llama_cpp_logits(
    model_path: str,
    tokens: list[int],
    n_gpu_layers: int = 99,
) -> np.ndarray:
    """Evaluate tokens with llama_cpp and extract exact output logits."""
    from llama_cpp import Llama

    llm = Llama(
        model_path=model_path,
        n_gpu_layers=n_gpu_layers,
        n_ctx=max(2048, len(tokens) + 64),
        logits_all=True,
        verbose=False,
    )
    llm.eval(tokens)
    scores = np.array(llm.scores[: len(tokens)], dtype=np.float32)
    return scores


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare LLM logits parity.")
    parser.add_argument("--model", type=str, required=True, help="Path to GGUF model")
    parser.add_argument(
        "--prompt",
        type=str,
        default="The quick brown fox jumps over the lazy dog.",
        help="Input prompt for parity check",
    )
    parser.add_argument(
        "--limit-layers",
        type=int,
        default=None,
        help="Limit layers for fast debugging",
    )
    parser.add_argument("--output-json", type=str, default=None, help="Save result as JSON")
    args = parser.parse_args()

    from llama_cpp import Llama

    from engine.reference.loader import load_reference_model

    print(f"[INFO] Initializing llama_cpp for tokenization and baseline on {args.model}...")
    llm = Llama(
        model_path=args.model,
        n_gpu_layers=99,
        logits_all=True,
        verbose=False,
    )
    token_bytes = args.prompt.encode("utf-8")
    tokens = llm.tokenize(token_bytes)
    print(f"[INFO] Prompt tokenized to {len(tokens)} tokens: {tokens}")

    print("[INFO] Computing llama.cpp baseline logits...")
    llm.eval(tokens)
    logits_llama = np.array(llm.scores[: len(tokens)], dtype=np.float32)
    del llm

    print("[INFO] Loading PyTorch reference model from GGUF...")
    ref_model, config = load_reference_model(
        args.model,
        device="cpu",
        limit_layers=args.limit_layers,
    )

    print("[INFO] Computing PyTorch reference logits...")
    import torch

    with torch.no_grad():
        inp = torch.tensor([tokens], dtype=torch.long)
        logits_ref = ref_model(inp)[0].numpy()

    print("[INFO] Running comparison analysis...")
    result = compare_logits(logits_ref, logits_llama, tokens=tokens, quant_type="Q4_K_M")
    result.print_summary()

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result.to_dict(), f, indent=2)
        print(f"[INFO] Wrote report to {out_path}")


if __name__ == "__main__":
    main()
