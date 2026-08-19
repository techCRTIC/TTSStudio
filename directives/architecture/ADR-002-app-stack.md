# ADR-002 — Next.js + TypeScript + Tailwind + shadcn/ui

**Status:** Accepted — 2026-08-19 (session 1)
**Deciders:** user (chose from four options), orchestrator (recommended)
**Related:** ADR-001 (constrains this decision), PRODUCT.md § Stack, roadmap Phase 0

## Context

TTS Studio is a single-user app with a GUI, running on the user's own Windows
machine, with no deploy target and no second audience. It has to look genuinely
good — that was an explicit requirement, not a nice-to-have — and it has to
reach an MVP fast.

**ADR-001 removed one whole class of answer.** ComfyUI returns 403 to any request
carrying a foreign `Origin`, so the app cannot be a purely static frontend that
calls the engine from the browser. Whatever is chosen must include a
server-side or native component.

Four candidates were put to the user:

| Candidate | Server side | Cost |
|---|---|---|
| **Next.js + Tailwind + shadcn/ui** | route handlers, in-project | Heavier than a single-user local app strictly needs |
| Vite + React + separate Fastify | a second process | Two configs, hand-written proxy |
| Tauri | native, Rust | Rust toolchain, slow builds, high iteration friction |
| FastAPI + React | a second process, second language | Two languages from day one |

## Decision

**Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui.**

## Rationale

- **The proxy ADR-001 demands already exists in the framework.** A route handler
  is the server-side caller, in the same project, in the same language, with no
  second process to start or supervise. Every other candidate either adds a
  process or adds a toolchain.
- **The visual requirement is real and this is where the material lives.**
  Tailwind and shadcn/ui are what the user's existing animated component assets
  (`PlotFieldBg`, `AccentDepthSystem`, `AetherFlow`, and the rest) are already
  written for — every one of them ships as React + Tailwind + TypeScript. Any
  other choice means porting them.
- **Tauri is the right destination and the wrong start.** A real `.exe` opened
  from the desktop is a better end state than a browser tab, and it would make
  the 403 vanish natively. But a Rust toolchain and slow compiles tax every
  iteration, and iteration speed is what an MVP spends. Tauri can wrap a Next
  build later; the reverse is not true.
- FastAPI would put the backend in ComfyUI's own language, which helps if the app
  ever manipulates graphs or drives a fine-tune. That is a Phase 4 concern, and
  paying two languages from day one to buy it is premature.

## Consequences

**Positive**
- One project, one language, one command.
- The owned component assets drop in without a port.
- The server side is also the natural home for writing reference audio into
  ComfyUI's `input` directory — something the browser cannot do at all.

**Negative**
- Next.js carries server machinery this app will not use (no SSR need, no
  deploy, no edge). Accepted as the price of the in-project proxy.
- **The dev-server proxy must strip or rewrite `Origin`.** A proxy that forwards
  it verbatim reproduces ADR-001's 403. This is the predictable first bug and
  Phase 0 must cover it with a test, not a manual check.

**Neutral**
- Nothing here binds the app to a browser forever; a Tauri shell around the
  built app stays available if the desktop-app feel becomes worth its cost.
