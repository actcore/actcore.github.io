---
title: "One .wasm, four transports — introducing ACT"
description: "ACT is a protocol for packaging tools as WebAssembly components. One file, served to agents (MCP), applications (HTTP), the command line, and the browser — with a capability-gated sandbox by default."
pubDate: 2026-04-23
author: actcore
---

Writing a useful tool today means writing it four times.

Your AI agent wants an MCP server over stdio. Your web backend wants
a REST service. Your CI pipeline wants a one-shot CLI. Your playground
wants something that runs in a browser tab without a server. Each
target gets its own adapter, its own auth story, its own sandbox,
its own bug surface.

**ACT** — Agent Component Tools — is an attempt to collapse that.
You write the tool once, as a WebAssembly component. The host runs
it over whichever transport the caller wants. A single `.wasm` file,
one `SELECT sqlite_version()` away from being four tools at once.

## Try it

If you have `npx`:

```bash
npx @actcore/act info ghcr.io/actpkg/sqlite:latest --tools
```

That one command pulls a 1.5 MB component from a container registry,
reads its metadata from a custom section without instantiating it, and
prints the tools it exposes. Now run it as an MCP server:

```bash
npx @actcore/act run ghcr.io/actpkg/sqlite:latest --mcp \
  --fs-policy allowlist --fs-allow /tmp/demo.sqlite
```

Point Claude Desktop / Cursor / Cline at that command and it's now a
SQL tool for your agent. Or skip the agent and call it directly:

```bash
act call ghcr.io/actpkg/sqlite:latest query \
  --args '{"sql": "SELECT sqlite_version()"}' \
  --fs-policy allowlist --fs-allow /tmp/demo.sqlite \
  --metadata '{"database_path": "/tmp/demo.sqlite"}'
```

Or serve it as HTTP:

```bash
act run ghcr.io/actpkg/sqlite:latest --http --listen "[::1]:3000" \
  --fs-policy allowlist --fs-allow /tmp/demo.sqlite
curl http://[::1]:3000/tools
```

Same component. Same `query` tool. Different wire formats.

## Why a component model

Everyone's instinct for "universal tools" eventually lands on HTTP
plus JSON Schema. That approximates the shape — but misses the two
things that actually matter for agent-era tooling:

- **Distribution.** A WASM component is a byte-identical artifact on
  any OS, any CPU. `ghcr.io/actpkg/sqlite:0.2.3` has one SHA256, full
  stop. No native deps, no `npm install && build-from-source`, no
  "works on my machine". It also happens to be signed and attested
  via SBOM, because OCI registries and GitHub Attestations already do
  that work.

- **Sandboxing.** WASI sandboxes the filesystem and network by
  default. ACT adds a manifest layer: each component *declares* what
  capabilities it needs (`[std.capabilities."wasi:filesystem"]`,
  `"wasi:http"`) and the host intersects that with the operator's
  runtime policy. A permissive operator can't escalate past a
  component's stated intent, and a lazy component can't silently
  exceed the operator's grants. Deny-by-default, positive-only grants,
  CIDR filtering on outbound HTTP.

The WebAssembly Component Model gives us all of that for free and
leaves us to design the actual tool protocol.

## The protocol fits on a postcard

The spec is [act:core@0.3.0](https://github.com/actcore/act-spec/blob/main/wit/act-core.wit). Every component exports one WIT interface with three
functions:

```wit
interface tool-provider {
  get-metadata-schema: async func(metadata: metadata) -> option<string>;
  list-tools:          async func(metadata: metadata) -> result<list-tools-response, tool-error>;
  call-tool:           async func(call: tool-call) -> tool-result;
}
```

Component-level info — name, version, capabilities — lives in a CBOR
custom section so the host can read it without instantiating the
code. Tools speak CBOR by default (JSON when asked). JSON Schema for
tool arguments is *derived* from WIT, not hand-written. MCP, OpenAPI,
and the REST-ish HTTP binding are all adapters over the same three
functions.

## Writing one

Rust, with the `act-sdk` macros:

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
you have a component that speaks MCP, HTTP, and the CLI. `#[act_tool]`
derives the JSON Schema from the function signature; `#[act_component]`
emits the WIT export. That's the whole SDK surface for a simple tool.

Python works the same way with `@component` / `@tool` decorators on
top of [`componentize-py`](https://github.com/bytecodealliance/componentize-py).

## Where this is

Early. The core spec is at 0.3.0 (normative), the host ships as
`act` on npm / cargo, and there are eleven components published on
`ghcr.io/actpkg`: sqlite, http-client, openapi-bridge, mcp-bridge,
crypto, encoding, filesystem, random, time, openwallet, python-eval.
Rust and Python SDKs are live; JavaScript via componentize-js is
[blocked on upstream async-export support](https://github.com/bytecodealliance/ComponentizeJS/issues/335).

What's next, roughly in order:

- A deeper post on the 0.5 capability / policy layer.
- A post on the `rmcp` bridge (a thin shim over the official MCP
  crate instead of the hand-rolled JSON-RPC dispatcher we had before).
- More components and language SDKs as the shape settles.

If you write MCP servers, build agent tooling, or work on the
component model, we'd love your thoughts. Start at
[actcore.dev/docs](https://actcore.dev/docs/), browse
[github.com/actcore](https://github.com/actcore), or ping us in the
Bytecode Alliance Zulip.
