# Terminal demo — "MCP servers, sandboxed"

Reproducible assets for the intro blog post's embedded terminal demo.

## Files

| File | Purpose |
|---|---|
| `demo.sh` | The session script. Shows `act info`, a denied call, and an allowed call. |
| `render.sh` | Records `demo.sh` with `asciinema`, renders to `public/blog/introducing-act-demo.svg`. |
| `demo.cast` | (gitignored) Captured recording. Regenerate via `./render.sh`. |

## Prerequisites

```bash
# asciinema — recorder
brew install asciinema           # macOS
pipx install asciinema           # pip-based systems
# svg-term-cli is pulled by `render.sh` via npx on demand; no install needed
```

Plus whatever your `ACT` env points at — by default `npx -y @actcore/act@latest`.

## Regenerate

```bash
cd scripts/blog/introducing-act
./render.sh                  # record a new cast AND render to SVG
./render.sh --render-only    # re-render existing cast (after style tweaks)
```

Output: `public/blog/introducing-act-demo.svg`.

## Editing the demo

- Tweak timings in `demo.sh` (`sleep` calls inside `note`/`run`).
- Change the displayed text in `note "..."` calls.
- Update commands — `run` echoes the string verbatim and executes it, so
  the display and the invocation stay in sync.

## Why this layout

`demo.sh` is the single source of truth. The `.cast` is captured output;
the `.svg` is rendered output. When `act` evolves (flags rename, output
shape changes), you edit `demo.sh` and re-render. No per-output
drift.
