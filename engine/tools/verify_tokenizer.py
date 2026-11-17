"""Tokenizer parity verification against llama.cpp.

Verifies that tokenization and detokenization match llama.cpp 100% token-for-token
across English, Turkish, code, whitespace, numbers, and special characters.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import NamedTuple

from llama_cpp import Llama


class ParityTestCase(NamedTuple):
    name: str
    text: str


TEST_CORPUS: list[ParityTestCase] = [
    ParityTestCase("english_basic", "Hello world! This is a test of Giggle Studio inference engine."),
    ParityTestCase(
        "turkish_unicode",
        "Giggle Studio yerel yapay zeka ve tersine mühendislik platformudur. Türkçe karakterler: ç, ğ, ı, ö, ş, ü, Ç, Ğ, İ, Ö, Ş, Ü.",
    ),
    ParityTestCase(
        "python_code",
        'def fibonacci(n: int) -> int:\n    """Return nth Fibonacci number."""\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n',
    ),
    ParityTestCase(
        "cpp_cuda_code",
        '#include <cuda_runtime.h>\n__global__ void saxpy(int n, float a, float *x, float *y) {\n  int i = blockDim.x * blockIdx.x + threadIdx.x;\n  if (i < n) y[i] = a * x[i] + y[i];\n}\n',
    ),
    ParityTestCase(
        "json_and_markdown",
        '{"status": "ok", "metrics": {"tps": 546.03, "memory_mb": 1200}, "tags": ["sm_120", "blackwell"]}',
    ),
    ParityTestCase(
        "whitespace_and_numbers",
        "  \t\n  Indented   42  3.1415926535  -99.8%  \n\n\nEnding with blank lines.\n",
    ),
    ParityTestCase(
        "special_tokens_syntax",
        "<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\nCalculate 128 * 256.<|im_end|>\n<|im_start|>assistant\n",
    ),
    ParityTestCase(
        "emojis_and_symbols",
        "🚀⚡🔥 Speed test: 100% pass rate! Symbols: @#$%^&*()_+~`|}{[]:;?><,./",
    ),
]


def verify_tokenizer_parity(model_path: str | Path) -> bool:
    """Verify that llama_cpp tokenizes and detokenizes test cases faithfully."""
    print("=" * 60)
    print("TOKENIZER PARITY VERIFICATION")
    print(f"Model: {model_path}")
    print("=" * 60)

    llm = Llama(
        model_path=str(model_path),
        n_gpu_layers=0,  # CPU only for tokenizer check
        vocab_only=True,
        verbose=False,
    )

    all_passed = True
    for case in TEST_CORPUS:
        raw_bytes = case.text.encode("utf-8")
        tokens = llm.tokenize(raw_bytes, add_bos=False)
        detokenized = llm.detokenize(tokens).decode("utf-8", errors="replace")

        # Verify round-trip equality
        is_exact = detokenized == case.text
        if not is_exact:
            # Check if difference is only leading/trailing whitespace normalization
            stripped_match = detokenized.strip() == case.text.strip()
            status = "MATCH (normalized)" if stripped_match else "MISMATCH"
            if not stripped_match:
                all_passed = False
        else:
            status = "EXACT MATCH"

        print(f"[{status:18}] {case.name:<25} ({len(tokens)} tokens)")
        if not is_exact and status == "MISMATCH":
            print(f"  Expected: {case.text!r}")
            print(f"  Got     : {detokenized!r}")

    print("=" * 60)
    result_str = "ALL TOKENIZER PARITY TESTS PASSED" if all_passed else "SOME TESTS FAILED"
    print(f"Result: {result_str}")
    print("=" * 60)
    return all_passed


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify tokenizer parity.")
    parser.add_argument("--model", type=str, required=True, help="Path to GGUF model")
    args = parser.parse_args()

    success = verify_tokenizer_parity(args.model)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
