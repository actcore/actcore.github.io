#!/usr/bin/env bash
# Record the terminal demo for the "MCP servers, sandboxed" intro post,
# then (optionally) upload it to asciinema.org so the blog post embed
# can point at it.
#
# Usage:
#     ./render.sh                  # record only (use the existing demo.cast otherwise)
#     ./render.sh --upload         # record + asciinema upload
#     ./render.sh --upload-only    # skip recording; upload existing demo.cast
#
# Output:
#     demo.cast   — kept under version control here in scripts/blog/…/
#                   so subsequent re-uploads / re-records start from a
#                   known source.
#
# Requirements:
#     asciinema — brew/pipx install asciinema
#     asciinema auth  (on first use, for uploading)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CAST="${HERE}/demo.cast"

record=true
upload=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --upload)       upload=true ;;
        --upload-only)  record=false; upload=true ;;
        *)              echo "unknown flag: $1" >&2; exit 2 ;;
    esac
    shift
done

if $record; then
    : "${ACT:=npx -y @actcore/act@latest}"
    echo "→ pre-warming component cache"
    ${ACT} info ghcr.io/actpkg/random:latest >/dev/null 2>&1 || true

    echo "→ recording demo.sh → ${CAST}"
    rm -f "$CAST"
    asciinema rec --cols 96 --rows 28 \
        --command "bash ${HERE}/demo.sh" \
        "$CAST"
    echo "→ cast: $(wc -c < "$CAST" | awk '{printf "%.1f KB", $1/1024}')"
fi

if $upload; then
    if [[ ! -s "$CAST" ]]; then
        echo "error: no cast at ${CAST}" >&2
        exit 1
    fi
    echo "→ uploading ${CAST} to asciinema.org"
    asciinema upload "$CAST"
    echo
    echo "Put the cast ID in the intro post:"
    echo "    src/content/blog/2026-04-23-introducing-act.md"
    echo "    <div data-asciinema-id=\"<ID>\"></div>"
fi
