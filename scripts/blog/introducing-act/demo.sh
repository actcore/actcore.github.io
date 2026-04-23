#!/usr/bin/env bash
# Reproducible terminal demo for the "MCP servers, sandboxed" intro post.
#
# Record with:
#     asciinema rec --cols 96 --rows 28 --command 'bash demo.sh' demo.cast
#
# Render to SVG (public/blog/introducing-act-demo.svg) with:
#     ./render.sh

set -u

# ACT can be the local debug build or any wrapper — default to npx for
# deterministic fetches against published artifacts.
: "${ACT:=npx -y @actcore/act@latest}"

# ── Styling ──────────────────────────────────────────────────────────
cyan=$'\e[36;1m'
bold=$'\e[1m'
dim=$'\e[2m'
reset=$'\e[0m'

prompt() {
    printf '%s$ %s%s%s\n' "${cyan}" "${bold}" "$1" "${reset}"
}

note() {
    printf '%s# %s%s\n' "${dim}" "$1" "${reset}"
    sleep 0.8
}

run() {
    prompt "$1"
    sleep 0.4
    eval "$1" || true
    sleep 1.8
}

# ── Demo ─────────────────────────────────────────────────────────────

clear

note "Inspect a published component — no instantiation, no network"
note "traffic beyond the initial OCI pull; metadata is read from the"
note "act:component WASM custom section."
run "${ACT} info ghcr.io/actpkg/sqlite:latest --tools"

note "Call a tool without granting the declared wasi:filesystem"
note "capability. The host denies access by default."
run "${ACT} call ghcr.io/actpkg/sqlite:latest query \\
    --args '{\"sql\":\"SELECT sqlite_version()\"}' \\
    --metadata '{\"database_path\":\"/tmp/demo.sqlite\"}'"

note "Grant the capability explicitly — deny-by-default → allow-by-flag."
note "The component gets exactly what the operator authorized, no more."
run "${ACT} call ghcr.io/actpkg/sqlite:latest query \\
    --args '{\"sql\":\"SELECT sqlite_version()\"}' \\
    --fs-policy allowlist --fs-allow /tmp/demo.sqlite \\
    --metadata '{\"database_path\":\"/tmp/demo.sqlite\"}'"

sleep 2
