---
title: "One .wasm, everywhere — introducing ACT"
description: "ACT packages tools as WebAssembly components — one binary that runs on every OS, every CPU, under an explicit capability sandbox. Stops the per-platform install tax that native tools pay today."
pubDate: 2026-04-23
author: actcore
tags:
  - webassembly
  - rust
  - opensource
  - ai
---

A useful tool today ships with a matrix behind it.

`npm install`, `pip install`, `cargo install`, `brew install`, or `apt
install` — pick your package manager. Now pick your OS. Now pick your
architecture. Somewhere in the middle a native dependency falls over:
a missing system library, a mismatched wheel, a postinstall script
that tries to shell out to `gcc`. You end up with half a gigabyte of
build tooling on your laptop just to run a 200-line utility.

**ACT** — Agent Component Tools — tries a different deal.

You compile the tool **once**, as a WebAssembly component. You get a
single `.wasm` file. That file runs on Linux x86_64, macOS arm64,
Windows, Android, Raspberry Pi, inside a browser tab, inside a
serverless runtime. Same bytes. Same SHA256. No per-platform wheels,
no native shims, no build toolchain required on anyone's machine but
yours.

## Distribution, for free

The artifact is a container-registry object, because that's what OCI
registries already do well:

```bash
npx @actcore/act info ghcr.io/actpkg/sqlite:latest --tools
```

That command pulls a 1.5 MB component from GitHub's container
registry, reads its metadata from a WASM custom section (no
instantiation), and prints the tools it exposes. First pull is
cached. The artifact is signed by GitHub's attestation workflow and
comes with an SBOM. That's all upstream machinery; ACT just uses it.

Want to host your own component? `oras push` it to any OCI registry.
Want to ship it as a plain file? `.wasm` over HTTP works just as
well. `act` accepts all three:

- local path: `./my-component.wasm`
- HTTP URL: `https://example.com/tool.wasm`
- OCI ref: `ghcr.io/your-org/tool:1.2.3`

No "my-tool-npm" and "my-tool-pypi" and "my-tool-cargo". One
artifact. One namespace.

## Sandboxing, by default

This is the part that matters most.

Any tool you install today — unless you go out of your way — runs
with your full user permissions. An `npm install` can read your SSH
keys. A `pip install` can exfiltrate your `.env`. A "simple" CLI
utility has the same ambient filesystem and network access as you do.
Sandboxing native code is possible (firejail, bwrap, cgroups) but
tedious enough that almost nobody does it for day-to-day tooling.

ACT components don't run natively. They run inside [`wasmtime`](https://wasmtime.dev) —
a full WebAssembly VM with a JIT, linear-memory isolation, and no
direct access to host syscalls.
The component can't read files, open sockets, or spawn processes on
its own; the only way out of the VM is through explicit imports the
host chose to wire up. That's the real isolation boundary — and
because every target runs the same wasmtime, it's identical on
Linux, macOS, Windows, and Android.

WASI is the capability-oriented I/O interface layered on top of
that VM. A component asks for `wasi:filesystem` or `wasi:http`
imports; the host either provides them, provides a gated proxy, or
doesn't provide them at all. Everything else stays inside wasmtime.

ACT adds a policy layer on top of the capability imports. Filesystem
and outbound network are **deny-by-default**. To let a component
touch anything, two things have to agree:

1. The component's manifest declares what it needs
   (`[std.capabilities."wasi:filesystem"]`, `"wasi:http"`). This is a
   ceiling — empty or missing = hard-deny, full stop.
2. At run time, the operator grants a policy that fits inside that
   ceiling (`--fs-allow /tmp/db.sqlite`, `--http-allow host=api.example.com`).

The effective policy is the intersection. A permissive operator
can't escalate past a component's stated intent, and a lazy
component can't silently exceed the operator's grants. Deny-CIDR
rules filter outbound resolution against RFC1918, link-local, and
anything else you mark off-limits — right at the DNS layer, so a
component that tries to phone home to `169.254.169.254` (the
cloud-metadata IP) fails with a `DnsError` before a socket is ever
opened.

The VM gives us isolation. WASI gives us capability imports. ACT
gives us the declaration-plus-ceiling model that makes those
capabilities safe to hand to third-party code.

## One component, any transport

A neat side-effect of writing tools as components: the host can serve
them over whatever wire format the caller wants.

```bash
# Claude Desktop / Cursor / Cline → stdio JSON-RPC
act run ghcr.io/actpkg/sqlite:latest --mcp \
  --fs-policy allowlist --fs-allow /tmp/demo.sqlite

# Web backend → REST-ish HTTP with SSE streaming
act run ghcr.io/actpkg/sqlite:latest --http --listen "[::1]:3000"

# Script / CI → one-shot direct call
act call ghcr.io/actpkg/sqlite:latest query \
  --args '{"sql": "SELECT sqlite_version()"}' \
  --metadata '{"database_path":"/tmp/demo.sqlite"}'

# Browser tab → jco transpile, no server at all
jco transpile ghcr.io/actpkg/sqlite:latest -o dist/
```

Same component. Same tool. Four deployments. Whatever new transport
shows up next, the component doesn't change.

## Writing one

Rust, the whole SDK surface for a trivial tool:

```rust
use act_sdk::prelude::*;

#[act_component]
mod component {
    use super::*;

    #[act_tool(description = "Reverse a string", read_only)]
    fn reverse(text: String) -> ActResult<String> {
        Ok(text.chars().rev().collect())
    }
}
```

`cargo build --target wasm32-wasip2 --release` + `act-build pack` and
you have a `.wasm` that speaks MCP, HTTP, and the CLI. `#[act_tool]`
derives the JSON Schema from the function signature; `#[act_component]`
emits the WIT export. Python has the same shape with `@component` /
`@tool` decorators on top of [`componentize-py`](https://github.com/bytecodealliance/componentize-py).

## Where this is

Early, and deliberately narrow.

The core spec — [act:core@0.3.0](https://github.com/actcore/act-spec/blob/main/wit/act-core.wit) — is a WIT world with three async functions. The
host ships as `act` on npm and cargo. Eleven components are published
on `ghcr.io/actpkg`: sqlite, http-client, openapi-bridge, mcp-bridge,
crypto, encoding, filesystem, random, time, openwallet, python-eval.
Rust and Python SDKs are live; JavaScript via componentize-js is [blocked on upstream async-export support](https://github.com/bytecodealliance/ComponentizeJS/issues/335).

Follow-up posts coming on:

- The 0.5 capability / policy layer in more detail.
- The `rmcp` bridge (a thin shim over the official MCP crate instead
  of the hand-rolled JSON-RPC dispatcher we had before).
- Distribution stories — signed SBOMs, reproducible builds, the
  artifact lifecycle from `just build` to `actpkg.dev`.

If you write MCP servers, build agent tooling, or work on the
component model, we'd love your thoughts. Start at [actcore.dev/docs](https://actcore.dev/docs/),
browse [github.com/actcore](https://github.com/actcore), or ping us
in the Bytecode Alliance Zulip.
