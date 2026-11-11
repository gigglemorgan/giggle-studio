#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

FIXTURES_DIR="${PROJECT_ROOT}/backend/tests/fixtures/binaries"
mkdir -p "${FIXTURES_DIR}"

echo "=========================================================="
echo "   Compiling Benign Binary Fixtures for Reverse Engineering"
echo "=========================================================="

CC="${CC:-gcc}"

if ! command -v "${CC}" &>/dev/null; then
    echo "⚠️ Warning: ${CC} compiler not found. Skipping binary compilation."
    exit 0
fi

# 1. Hello World
cat << 'EOF' > /tmp/fixture_hello.c
#include <stdio.h>
int main() {
    printf("Giggle Studio RE Fixture - Hello World\n");
    return 0;
}
EOF
${CC} -O2 /tmp/fixture_hello.c -o "${FIXTURES_DIR}/hello"
rm /tmp/fixture_hello.c

# 2. Math Operations
cat << 'EOF' > /tmp/fixture_math.c
#include <stdio.h>
int add(int a, int b) { return a + b; }
int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
int main() {
    printf("Result: %d\n", add(10, factorial(5)));
    return 0;
}
EOF
${CC} -O2 /tmp/fixture_math.c -o "${FIXTURES_DIR}/math_ops"
rm /tmp/fixture_math.c

# 3. Simple Benign String Encoding (XOR stub)
cat << 'EOF' > /tmp/fixture_xor.c
#include <stdio.h>
#include <string.h>

void decode_and_print(char *str, char key) {
    size_t len = strlen(str);
    for (size_t i = 0; i < len; i++) {
        putchar(str[i] ^ key);
    }
    putchar('\n');
}

int main() {
    char encoded[] = { 'F' ^ 0x42, 'i' ^ 0x42, 'x' ^ 0x42, 't' ^ 0x42, 'u' ^ 0x42, 'r' ^ 0x42, 'e' ^ 0x42, '\0' };
    decode_and_print(encoded, 0x42);
    return 0;
}
EOF
${CC} -O1 /tmp/fixture_xor.c -o "${FIXTURES_DIR}/xor_decoder"
rm /tmp/fixture_xor.c

echo "✅ Benign fixtures compiled in ${FIXTURES_DIR}:"
ls -la "${FIXTURES_DIR}"
