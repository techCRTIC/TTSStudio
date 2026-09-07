# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui — chosen by the user
2026-08-19. The choice was forced in part by ADR-001: ComfyUI answers **403 to any
request carrying a foreign `Origin`**, so the app can never be a purely static
frontend. Next's route handlers are the server-side proxy that constraint
requires, in the same project. Runs locally; no deploy target.

## Users

**One user: the operator of this machine** (CRTIC). There is no second audience,
no accounts, no roles, no sharing. He is at his own desk, ComfyUI running on the
same box, producing audio he will use elsewhere — in a video editor, a podcast
timeline, a prototype, or a client deliverable.

The job is always the same shape: *bring a written text into a specific voice,
hear whether it lands, and get a usable audio file out.* The loop is
write → generate → listen → judge → adjust → repeat. Judging is the part that
takes real time, because only listening tells you if it worked.

## Product Purpose

Turn voice cloning from a ComfyUI graph exercise into an everyday operation.
Today the user reaches this capability by wiring nodes and editing JSON; the
product exists so that producing narration costs a sentence of typing and a
click. Success is a negative result: **he stops opening ComfyUI for voice work.**

## Positioning

The mechanism a neighboring product cannot truthfully copy: **the whole pipeline
runs on the user's own machine, on hardware he already owns.** Cloned voices —
his own and those of people close to him — never leave the box, there is no
per-character cost, no quota, no account, and no third party holding a recording
of a real person's voice. Commercial cloud TTS can match the quality; it cannot
match that.

## Operating Context

- **Machine:** Windows 11, RTX 5090 Laptop (23.9 GB VRAM), 63 GB RAM.
- **Engine:** ComfyUI at `127.0.0.1:8188` (core 0.33.0, workspace
  `C:\Users\tech\comfy`), with the `comfyui-qwen3-tts` 1.7.0 pack. It must
  already be running; the app does not own its lifecycle yet (backlog B-003).
- **Four production contexts, all confirmed:** narration for video and courses ·
  fast prototypes and demos · podcast or finished audio pieces · client work.
  They are not variants of one use — they set different bars. Prototyping wants
  the shortest possible loop; podcast and client work want the highest quality
  and a record of what was produced.
- **Text length spans all scales** — single lines, paragraphs, and multi-minute
  scripts, depending on the day. The user asked that the long case drive the
  design, because it contains the others, **provided a single short line never
  costs more clicks than it needs.**
- Output leaves the app and enters other tools: video editors, podcast
  timelines, client deliveries.

## Capabilities and Constraints

**Confirmed capabilities**
- Text to speech in a cloned voice, via Qwen3-TTS 1.7B Base.
- Zero-shot cloning from a short reference (validated on ~15 s of real audio;
  the user's verdict on quality was "bastante decente").
- A voice library: register a voice from reference audio, name it, reuse it.
- Persistent history of generations (in MVP scope, by the user's decision).

**Hard constraints**
- **Qwen3-TTS Voice Clone exposes no speed or emotion parameter.** Only the
  `CustomVoice` mode (preset voices, not cloning) has them. The interface must
  not offer controls the engine does not have. Text punctuation does measurably
  affect perceived pausing — that is the one available lever.
- **The engine generates in chunks.** A multi-minute script is not one call.
  Any long-form surface must segment the text, let a single segment be
  regenerated without redoing the whole piece, and join the results. This is
  product truth even where it is out of MVP scope; the architecture must not
  foreclose it.
- **Cross-origin is refused by ComfyUI** (ADR-001). Every engine call is
  server-side.
- Generation is not instant and its duration varies with text length. **What the
  engine can actually report is queued-with-position and running — nothing
  finer.** Corrected 2026-08-24 (session 4, ADR-007): this line used to claim
  progress arrives over a websocket. There is no websocket. The client polls
  `/api/status/:promptId` every 700 ms, and `StatusLine` refuses to draw a
  percentage bar precisely because the engine cannot support one. Waiting is
  still shown honestly — with a real state, and for a long script with
  "segment K of N" — never with an indeterminate spinner and never with an
  invented percentage.

**Explicitly undecided**
- Whether the app starts and supervises ComfyUI itself (backlog B-003).
- Whether a real fine-tune replaces zero-shot cloning (roadmap Phase 3).

## Brand Commitments

- **"CRTIC clean" is the house design system** and this product is a spinoff of
  it, not a departure. The kit now lives in-repo at `CRTIC-design-system/`
  (V2 = current contract, byte-identical to the copies in the other CRTIC
  projects; V1 = the June revision; `CRTIC_identidad.md` = brand identity of
  CRTIC, the user's organisation). Inherited: Geist Sans + Mono, one earned accent (CRTIC orange
  `#FA4515`), depth earned rather than sprinkled, restrained and motivated
  motion, no second accent, no gradient text, no glassmorphism by default, never
  `#000` or `#fff`.
- The user has made one binding visual constraint for this product: **a dark,
  gray-leaning surface, weighted toward the dark end so it does not tire the
  eyes over long sessions**, and animated canvas graphics used to earn a premium
  feel.
- Available animated component assets (React + Tailwind + TS, already owned):
  `PlotFieldBg` (the canonical CRTIC living-data-field, Canvas 2D, parameterized
  wave layers, honors reduced-motion), `AccentDepthSystem` (depth + accent glow),
  `AetherFlow` (particle network), `DotGrid`, `ClickRipple`, `LiquidGradient`,
  `GalaxyStarfield`.

## Evidence on Hand

- **Real reference audio of a real, identifiable person** ("Martín"): ~37 min
  full and a compact cut, at `comfy-mcp/.tmp/audio/`. Not regenerable.
- **A 16-segment real-vs-cloned benchmark** at `comfy-mcp/.tmp/tts/benchmark/`,
  with its manifest. This is the existing quality baseline; any future claim of
  improvement is measured against it, not asserted.
- Five validated ComfyUI workflows (image and voice) at
  `C:\Users\tech\comfy-workflows\`, deliberately outside any repository.
- The prior investigation's own record at `comfy-mcp/`.
- **Absent, and must not be fabricated:** any user research, any second user,
  any benchmark against commercial TTS, any latency figures for this app (none
  exists yet), and any claim about fine-tune quality — the fine-tune has not
  been run.

## Product Principles

1. **The loop is the product.** Write, generate, listen, judge, adjust. Every
   design decision is measured by whether it shortens the distance between
   changing a word and hearing the result.
2. **Never promise what the engine cannot do.** No speed slider, no emotion
   dial, no fake precision. Where the engine is coarse, the interface is honest
   about it and surfaces the lever that does work.
3. **Waiting is shown, not hidden.** Generation takes real time and the duration
   varies. Show the state the engine really reports — never an indeterminate
   spinner, and never a percentage it cannot know.
4. **Long-form is the shape; short-form is the courtesy.** Design for the
   multi-minute script, but never make a single line pay for that capability.
5. **The voices are real people.** They stay on this machine. Provenance and
   deletion are product functions, not paperwork.

## Accessibility & Inclusion

- **Reduced motion is required, not optional.** The visual direction leans on
  animated canvas backdrops; every one must render a single static frame and
  drop pointer reactivity under `prefers-reduced-motion`.
- **This is an audio product, and its primary output cannot be heard by
  everyone.** Anything the app says with sound alone it must also say visually —
  generation completion, errors, and progress.
- Long writing sessions on a dark surface drove the palette choice; contrast is
  tuned for sustained reading, not for maximum punch.
