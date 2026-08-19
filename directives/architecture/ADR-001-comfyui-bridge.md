# ADR-001 — The app reaches ComfyUI through its own server-side HTTP proxy

**Status:** Accepted — 2026-08-19 (session 1)
**Deciders:** user, orchestrator
**Supersedes:** nothing
**Related:** backlog B-002 (closed by this ADR), roadmap Phase 0

## Context

TTS Studio is a single-user local app whose voice engine is Qwen3-TTS running
inside ComfyUI. Something has to carry text and a reference voice to ComfyUI and
carry audio back. Three candidate bridges existed:

1. **The `comfy` MCP server** — already installed and registered at user scope in
   Claude Code, exposing 39 tools over comfy-cli.
2. **ComfyUI's own HTTP API** at `http://127.0.0.1:8188`, called **directly from
   the browser**.
3. **ComfyUI's HTTP API called from a server-side component we own.**

### Evidence gathered (2026-08-19, against the live install)

`server_info` confirms ComfyUI running: `127.0.0.1:8188`, PID 48716, core
`0.33.0`, pack `comfyui-qwen3-tts` 1.7.0, RTX 5090 Laptop (23.9 GB VRAM),
63 GB RAM, workspace `C:\Users\tech\comfy`.

**ComfyUI rejects cross-origin requests outright.** Probed with curl, holding
every variable but the `Origin` header constant:

| Request | Result |
|---|---|
| `GET /queue`, no `Origin` | **200** |
| `GET /queue`, `Origin: http://localhost:5173` | **403 Forbidden** |
| `GET /queue`, `Origin: http://127.0.0.1:8188` | **200** |
| `GET /system_stats`, `Origin: http://localhost:5173` | **403 Forbidden** |
| `GET /queue`, foreign `Host` header | 200 (only `Origin` is checked) |

This is an origin allow-list, not a missing-CORS-header problem: the body is
empty and the status is 403, so no browser-side workaround exists. It is a
deliberate ComfyUI defence against a malicious web page reaching a localhost
service.

## Decision

**The app talks to ComfyUI over its HTTP API, and every such call is made from a
server-side component that the app itself owns.** The browser never calls
ComfyUI; it calls our own origin, which forwards the request without an `Origin`
header.

The `comfy` MCP server is **not** part of the app's runtime. It stays what it is:
a tool for agents to drive ComfyUI during development.

## Rationale

- **Option 2 is not implementable.** The 403 above is measured, not predicted.
- **Option 1 is a category error.** MCP is a protocol for LLM agents, spoken over
  stdio to a subprocess. Wiring an end-user app's runtime through an agent tool
  server means shipping comfy-cli, a Python venv and an MCP client to do what one
  HTTP call does. It also inherits comfy-cli's consent-elicitation prompts, which
  are designed to interrupt an agent, not to serve a UI.
- **Option 3 additionally solves file placement.** Reference audio has to reach
  ComfyUI's `input` directory. A server-side component on the same machine can
  write there directly or call `/upload/image`; a browser can do neither.
- The rejected fourth path — launching ComfyUI with a permissive CORS flag —
  would weaken a security boundary **globally, for every ComfyUI use on this
  machine**, to work around a constraint that a proxy removes locally.

## Consequences

**Positive**
- The app has one integration surface (ComfyUI's documented HTTP API) and no
  dependency on comfy-cli, MCP, or a Python venv at runtime.
- The server-side component is the natural home for file placement, request
  queueing, and hiding ComfyUI's graph JSON from the UI.
- ComfyUI keeps its origin check intact.

**Negative**
- **The app can never be a purely static frontend.** Whatever stack is chosen
  must include a server-side or native component. This constrains ADR-002.
- One more moving part to start and supervise.
- The proxy must strip or rewrite `Origin` on forwarded requests. A dev-server
  proxy that passes `Origin` through verbatim will reproduce the 403 — this is
  the predictable first bug of Phase 0 and must be covered by a test.

**Neutral**
- ComfyUI core is one patch behind (`0.33.0` vs `0.33.2`). Not blocking; worth
  updating before building against the API.
