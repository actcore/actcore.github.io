# Terminal demo — "MCP servers, sandboxed"

Reproducible assets for the intro blog post's embedded terminal demo.

## Source of truth

- **`demo.sh`** — the shell script whose output is what readers see. Edit
  this when command flags rename, output shape changes, or we want to
  swap the demo component.
- **`demo.cast`** — the last recorded session. Checked in so the cast
  survives re-clones and the asciinema.org upload can be re-run without
  re-recording.

## Hosting

The blog embed lives on **asciinema.org** (public). Both actcore.dev and
dev.to resolve their embeds against the same asciinema.org cast ID —
actcore.dev via a client-side script substitution, dev.to via its
native `{% asciinema ID %}` liquid tag. We intentionally don't self-host
the `.cast` in `public/blog/` so there's one canonical source.

## Prerequisites

```bash
brew install asciinema   # macOS
pipx install asciinema   # pip-based systems
asciinema auth           # first time; opens a browser
```

## Workflows

### Record + upload (first time or after a `demo.sh` change)

```bash
./render.sh --upload
# → records demo.cast, uploads to asciinema.org, prints cast URL + ID
```

Then paste the ID into:
```
src/content/blog/2026-04-23-introducing-act.md
    <div data-asciinema-id="NEW_ID"></div>
```

### Re-upload the existing demo.cast without re-recording

```bash
./render.sh --upload-only
```

### Just record, don't upload

```bash
./render.sh
```

Useful while iterating on `demo.sh` timings before burning an
asciinema.org ID.

## How the embed resolves

| Target | Source | Mechanism |
|---|---|---|
| actcore.dev | asciinema.org cast ID | Client-side JS replaces `<div data-asciinema-id="X"></div>` with `<script src="https://asciinema.org/a/X.js">` |
| dev.to | asciinema.org cast ID | `devto.xml` RSS emits `{% asciinema X %}` liquid tag; dev.to renders it server-side |
| generic RSS readers | asciinema.org cast URL | `rss.xml` emits a plain link to the cast page (feed readers can't execute JS) |

Source of substitution logic: `src/pages/blog/[...slug].astro` and
`src/lib/rss-items.ts`.
