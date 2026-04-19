---
title: "The capability ceiling — how ACT sandboxes third-party tools"
description: "ACT layers a declaration-as-ceiling policy model on top of WASI's capability imports and wasmtime's VM isolation. The declared ceiling, runtime policy, DNS-layer deny-CIDR, and per-hop redirect re-check combine to make a tool from an untrusted author safe to run under your agent."
pubDate: 2026-04-24
author: actcore
draft: true
---

Handing a third-party tool to your AI agent is the same problem as
handing a third-party binary to `cron`. The tool's author may be a
good actor or not. The agent may misuse the tool or not. The
operator — you — wants a floor on how bad either outcome can get.

ACT's policy layer is about installing that floor. This post walks
through how it works in 0.5, from the wasmtime VM up to the DNS
resolver.

## Three layers, explicit

```
┌─────────────────────────────────────────────────────┐
│  ACT policy (declaration × operator intent)         │ ← what this post is about
├─────────────────────────────────────────────────────┤
│  WASI capabilities (wasi:filesystem, wasi:http, …)  │ ← capability imports
├─────────────────────────────────────────────────────┤
│  wasmtime VM (JIT, linear memory, no host syscalls) │ ← isolation
└─────────────────────────────────────────────────────┘
```

Confusing the bottom two layers is a common trap. The **isolation**
is wasmtime: a full WebAssembly VM with a JIT, linear-memory
boundaries, and no direct syscall access. A component can't read
`/etc/passwd`, open a raw socket, or `execve`. It can only call
imports the host chose to wire up.

**WASI** is the capability-oriented I/O surface. A component asks
for imports like `wasi:filesystem` or `wasi:http`; the host either
provides them, provides a gated shim, or leaves them unlinked. Those
imports are positive-only — there's no "deny" at the capability
level; a component either has the import or it doesn't.

**ACT policy** is the layer this post is about. It sits between the
component's declared capability *intent* and the operator's runtime
*grants*, and makes sure neither side escalates past the other.

## Declarations are ceilings

Every ACT component ships a manifest (`act.toml` or a merged
equivalent from `Cargo.toml` / `pyproject.toml` / `package.json`).
If it needs filesystem access, it must declare it:

```toml
[std.capabilities."wasi:filesystem"]
description = "Stores the database file."

[[std.capabilities."wasi:filesystem".allow]]
path = "**"           # glob — "**" means any path
mode = "rw"           # "ro" or "rw"
```

If it needs outbound HTTP:

```toml
[std.capabilities."wasi:http"]
description = "Fetches OpenAPI specs from public catalogs."

[[std.capabilities."wasi:http".allow]]
host = "petstore3.swagger.io"   # "*" = any, "*.suffix" = suffix, else exact
scheme = "https"                # optional
methods = ["GET"]               # optional
ports = [443]                   # optional
```

`act-build pack` validates these at build time and embeds them in the
`act:component` custom section. `act-build validate` re-parses at
any point in the supply chain. A component with a missing declaration
— or one that declares the capability table but leaves `allow` empty
— is hard-deny at host-load time, full stop. There's no way to "oops,
I forgot to declare" yourself into ambient access.

## Operator policy is the other half

Separately, the operator specifies what they'll grant:

```bash
act run <component> \
  --fs-policy allowlist \
  --fs-allow "/data/**" \
  --fs-allow "/tmp/work/db.sqlite" \
  --http-policy allowlist \
  --http-allow "host=api.example.com;scheme=https" \
  --http-deny "cidr=10.0.0.0/8" \
  --http-deny "cidr=169.254.169.254/32"
```

Or packaged as a profile in `~/.config/act/config.toml`:

```toml
[profile.sqlite-dev.policy]
fs = { mode = "allowlist", allow = [
  { path = "/Users/me/dev.sqlite", mode = "rw" },
]}
```

This is the operator's intent, not the component's. It can be as
liberal or paranoid as you like.

## The effective policy is the intersection

The host computes `user ∩ declaration` at component load. Concretely,
in the runtime code:

```rust
// runtime/effective.rs
pub fn effective_fs(
    user: &FsConfig,
    declared: &[FilesystemAllow],
) -> FsConfig { … }
```

Every operator `--fs-allow` entry is checked against the declared
ceiling; entries that fall outside the ceiling are silently dropped.
Symmetrically, a declaration alone doesn't grant anything — the
operator still has to opt in.

This model has two nice properties:

- A **permissive operator** (say, `--fs-policy open`) still can't
  let a component read files outside what it declared. The ceiling
  stops them.
- A **lazy component author** can't silently reach outside the
  operator's policy. The WASI layer's capability imports come from
  the host; the host refuses to wire up more than the operator
  authorized.

## DNS-layer deny

HTTP policy is the more interesting half because redirects, CIDR
rules, and DNS all interact.

The [`reqwest`](https://docs.rs/reqwest)-backed HTTP client that ACT
uses in 0.5 has a **custom DNS resolver** that sits in front of
every outbound request. After a name resolves, every resolved IP
is checked against the operator's `--http-deny cidr=…` rules
**before** the client proceeds to connect.

```
reqwest → PolicyDnsResolver
           ├── resolve("api.example.com")
           │    → [1.2.3.4, 5.6.7.8]
           ├── check each IP vs deny-CIDRs
           ├── check each IP vs allow-CIDRs
           └── if none survives: DnsError
```

A component that tries to phone home to `169.254.169.254` (the
cloud-metadata service IP) doesn't get a "connection refused" —
it gets a `DnsError`, before the socket is ever opened. That's a
deliberate choice: attackers can differentiate connection-refused
from DNS-not-resolved, and we want the failure indistinguishable
from the name never existing.

## Per-hop redirect re-check

Every hop of an HTTP redirect chain is re-checked against the same
policy. A 302 to a denied host fails mid-chain instead of quietly
succeeding. The client uses a custom `redirect::Policy` that invokes
the same `network::decide` function used for the initial request:

```rust
// runtime/http_client.rs
fn build_redirect_policy(
    cfg: HttpConfig, declared: Vec<HttpAllow>
) -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(move |attempt| {
        match decide(&cfg, &declared, attempt.url()) {
            Decision::Allow => attempt.follow(),
            Decision::Deny(_) => attempt.stop(),
            …
        }
    })
}
```

This closes the redirect-smuggling bypass that naive host-list
filters fall into.

## Ancestor traversal, a practical detail

WASI path resolution stats every intermediate directory when opening
a nested file. That bit us in 0.5.0: an `--fs-allow
/tmp/work/db.sqlite` entry failed to open the file because WASI
needed to stat `/tmp/work` and `/tmp` first, and neither was
explicitly allowed.

0.5.1 fixed it: an allow entry for `/tmp/work/db.sqlite` now
implicitly permits `/tmp/work` and `/tmp` for directory traversal,
while sibling files in those directories remain denied. The
implementation walks `target.ancestors()` during policy check:

```rust
// runtime/fs_matcher.rs
if self.allow_prefixes.iter().any(|prefix| is_ancestor(path, prefix)) {
    return FsDecision::Allow;
}
```

No more "list every parent directory" dance. If you allow a leaf,
you get traversal to it for free.

## What this buys us

All together: the component author states intent at build time, the
operator states grants at run time, the host computes the
intersection, the WASI imports are filtered accordingly, the HTTP
client re-checks each redirect hop, and the DNS resolver filters IPs
before a socket opens.

It's not "a sandbox". It's a VM plus an explicit, auditable
capability pipeline. A tool from a stranger — `ghcr.io/somebody/…`
— is safe to point your agent at in a way that `npm install -g` has
never been.

## What's next

- The `rmcp` bridge and why we moved off a hand-rolled JSON-RPC
  dispatcher.
- Distribution: OCI registries, SBOMs, reproducible builds, and what
  `actpkg.dev` will ship.
- p3 (wasip3) filesystem per-op gating — currently awaiting upstream
  wasmtime-wasi API.

Questions welcome in the Bytecode Alliance Zulip.
