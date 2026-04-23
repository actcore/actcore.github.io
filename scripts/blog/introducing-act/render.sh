#!/usr/bin/env bash
# Record + render the terminal demo for the intro post.
#
# Usage:
#     ./render.sh               # record & render (writes ../../public/blog/)
#     ./render.sh --render-only # skip recording, re-render existing demo.cast
#
# Requirements (install via your OS package manager or cargo):
#     asciinema    — https://asciinema.org/
#     svg-term-cli — npm i -g svg-term-cli (or use npx below)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CAST="${HERE}/demo.cast"
OUT="${HERE}/../../../public/blog/introducing-act-demo.svg"
mkdir -p "$(dirname "$OUT")"

if [[ "${1:-}" != "--render-only" ]]; then
    echo "→ recording demo.sh → ${CAST}"
    rm -f "$CAST"
    asciinema rec --cols 96 --rows 28 --command "bash ${HERE}/demo.sh" "$CAST"
fi

if [[ ! -s "$CAST" ]]; then
    echo "error: no cast file at ${CAST}" >&2
    exit 1
fi

echo "→ rendering ${CAST} → ${OUT}"
npx -y svg-term-cli --in "$CAST" --out "$OUT" \
    --window --no-cursor --profile=~/.config/asciinema/default.terminal \
    --width 96 --height 28 \
    2>/dev/null || npx -y svg-term-cli --in "$CAST" --out "$OUT" \
        --window --no-cursor --width 96 --height 28

# Report size and preview absolute path
echo "→ wrote $(wc -c < "$OUT" | awk '{printf "%.1f KB", $1/1024}') to ${OUT}"
