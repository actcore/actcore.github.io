---
title: "MCP servers, sandboxed — introducing ACT"
description: "Today's MCP servers ship as `npx`, `uvx`, or `curl | bash` — ambient-permission native processes with your full user access. ACT packages tools as sandboxed WebAssembly components with declared capabilities and deny-by-default filesystem and network, so an agent can safely call tools written by a stranger."
pubDate: 2026-04-23
author: actcore
tags:
  - act
  - webassembly
  - opensource
  - ai
cover_image: https://actcore.dev/blog/introducing-act-cover.png
---

Setting up an MCP server for your AI agent today usually looks like this:

```bash
npx -y @some-org/mcp-server          # or
uvx some-mcp-server                  # or the occasional
curl https://example.com/install.sh | bash
```

The server runs as you. It can read your home directory. It sees your SSH keys, your `.env` files, your shell history, your browser cookies, your GPG keyring. If the server has a bug — or a malicious dependency sneaks in — the code that reads those files also runs as you. If your kernel or any installed binary has an unpatched local privilege escalation, the agent-invoked tool just inherited that escalation path too.

That isn't a failure mode of any particular MCP server; it's the default deployment model. **Ambient-permission native processes, shipped by anyone, invoked on demand by an LLM that's notoriously easy to talk into misusing them.** "Your agent has your credentials and runs strangers' code on request" is the baseline security posture of every MCP setup built on `npx` / `uvx` / `curl | bash` today. It's a full-blown security nightmare that the industry has collectively decided not to look at.

**ACT** — Agent Component Tools — is the model that looks at it.

Every ACT tool is a WebAssembly component running inside [`wasmtime`](https://wasmtime.dev) — a full VM with a JIT, linear memory, and no ambient host syscalls. Out of the box the component has zero filesystem access, zero outbound network, and no way to spawn a process. Each capability it does use (`wasi:filesystem`, `wasi:http`) is **declared** in the component manifest at build time and **granted** by the operator at run time. The host enforces the intersection: a permissive operator can't escalate past the component's stated intent, a lazy component can't silently exceed the operator's grant. You hand a tool from `ghcr.io/someone-else/whatever` to your agent, and the worst-case blast radius is still bounded by the policy you wrote.

That's the core trade ACT offers. The rest of this post is about why the WebAssembly-component substrate makes it practical.

## Distribution, for free

A side benefit of picking WebAssembly: the artifact is a single binary that runs everywhere.

![act info ghcr.io/actpkg/sqlite:latest --tools](/blog/introducing-act-demo.svg)

That command pulls a 1.5 MB component from GitHub's container registry, reads its metadata from a WASM custom section (no instantiation), and prints the tools it exposes. First pull is cached. The artifact is signed by GitHub's attestation workflow and comes with an SBOM — all upstream machinery; ACT just uses it.

Same bytes, same SHA256, on Linux x86_64, macOS arm64, Windows, Android (validated), Raspberry Pi, inside a browser tab, inside a serverless runtime. No per-platform wheels, no native shims, no build toolchain required on anyone's machine but yours. And because the artifact is a registry object rather than three separate npm/pip/cargo packages, there's one supply-chain path to audit instead of three.

`act` accepts components from any of:

- local path: `./my-component.wasm`
- HTTP URL: `https://example.com/tool.wasm`
- OCI ref: `ghcr.io/your-org/tool:1.2.3`

No "my-tool-npm" and "my-tool-pypi" and "my-tool-cargo". One artifact. One namespace.

## How the sandbox actually works

The isolation comes from three stacked layers, and it's worth separating them because "WASI sandbox" isn't quite the right phrase.

**wasmtime** is the actual isolation. It's a WebAssembly VM: linear-memory bounds enforced, no direct syscalls, no pointer aliasing, no escape outside of explicit host imports. Every ACT target runs the same wasmtime, so the isolation is identical on every OS and CPU.

**WASI** is the capability-import layer on top. A component asks for `wasi:filesystem` or `wasi:http` imports; the host either wires them up, provides a gated proxy, or leaves them unlinked. There's no "deny" at the capability level — a component either has the import or it doesn't.

**ACT** is the policy layer on top of WASI. Filesystem and outbound network are deny-by-default. The component's manifest declares what it needs (`[std.capabilities."wasi:filesystem"]`, `"wasi:http"`) — this is a ceiling. The operator's runtime flags (`--fs-allow /tmp/db.sqlite`, `--http-allow host=api.example.com`) are the grant. The host computes the intersection and refuses to wire up anything outside it.

Deny-CIDR rules sit in front of DNS resolution, so a component that tries to reach `169.254.169.254` (the cloud-metadata service) fails with a `DnsError` before a socket opens. HTTP redirects are re-checked per-hop, so a 302 to a denied host fails mid-chain instead of quietly succeeding. Details are in the [capability-layer deep-dive](/blog/) (next post).

The VM gives us isolation. WASI gives us capability imports. ACT gives us the declaration-plus-ceiling model that makes those capabilities safe to hand to third-party code.

## One component, any transport

Because tools are components, not native processes, the host can serve them over whatever wire format the caller wants.

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

Same component, same tool, four deployments. Whatever new transport shows up next, the component doesn't change.

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

`cargo build --target wasm32-wasip2 --release` + `act-build pack` and you have a `.wasm` that speaks MCP, HTTP, and the CLI. `#[act_tool]` derives the JSON Schema from the function signature; `#[act_component]` emits the WIT export. Python has the same shape with `@component` / `@tool` decorators on top of [`componentize-py`](https://github.com/bytecodealliance/componentize-py).

## Where this is

Early, and deliberately narrow.

The core spec — [act:core@0.3.0](https://github.com/actcore/act-spec/blob/main/wit/act-core.wit) — is a WIT world with three async functions. The host ships as `act` on npm and cargo. Eleven components are published on `ghcr.io/actpkg`: sqlite, http-client, openapi-bridge, mcp-bridge, crypto, encoding, filesystem, random, time, openwallet, python-eval. Rust and Python SDKs are live; JavaScript via componentize-js is [blocked on upstream async-export support](https://github.com/bytecodealliance/ComponentizeJS/issues/335).

Follow-up posts coming on:

- The capability / policy layer in depth — declaration-as-ceiling, DNS-level deny-CIDR, per-hop redirect re-check, ancestor traversal, and what goes wrong when any of those is missing.
- The `rmcp` bridge (a thin shim over the official MCP crate instead of the hand-rolled JSON-RPC dispatcher we had before).
- Distribution — signed SBOMs, reproducible builds, the artifact lifecycle from `just build` to `actpkg.dev`.

If you write MCP servers, build agent tooling, or work on the component model, we'd love your thoughts. Start at [actcore.dev/docs](https://actcore.dev/docs/), browse [github.com/actcore](https://github.com/actcore), or ping us in the Bytecode Alliance Zulip.
