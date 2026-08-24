# ADR-006 — A local language model for the text, deterministic code first

**Status:** accepted
**Date:** 2026-08-24
**Closes:** backlog B-004 ("Controles de la interfaz acotados por el modelo")

## Context

The two biggest levers on how a generated voice sounds are not in the engine.
They are in the text, and both were **measured** in the `comfy-mcp` research
(2026-08-18/19), by generating audio and having a human listen:

| Lever | Effect |
|---|---|
| Spelling — accents, ñ, `¿` `¡` | Fixing it changed the delivery by **+15% to +29%**. A missing accent moves the stress ("ficcion" → FIC-cion instead of fic-CIÓN), and misplaced stress is one of the strongest signals that a voice sounds **foreign**. |
| Punctuation | Ellipses, short sentences and real questions move the rhythm **3.5× more than the `instruct` parameter of a fine-tuned model** (+54% vs +15%) — and it is free. |

Both fail **silently**. The model does not complain, the graph validates, the
audio generates, and it sounds wrong. In the session that produced those
findings, ~25 audios were generated before a human heard the first one, and
**all of them had badly written text**. No objective metric could see it.

Backlog B-004 recorded this and asked whether it should "become visible help for
the user". This ADR is that answer, plus a second feature the user asked for on
the same day: a ghost autocomplete for the script field.

**What was almost built instead.** The first plan was to measure punctuation
from scratch, because a search of *this repo* found no such research. That was
looking in the wrong place: the findings live in the user's `voz-local` skill,
along with two finished scripts that implement them. Same lesson as ADR-005 —
check the disk before declaring something absent.

## Decision

**Deterministic code does everything it can. The model does only what is
genuinely judgement. Nothing is applied without the user accepting it.**

Three steps, in this order:

1. **Review — deterministic.** `execution/tts_revisar_texto.py` reports what is
   wrong and why, with severity. ASCII-fied text and `ano`-for-`año` are
   **BLOQUEANTE**; missing `¿`, digits, over-length and flat prosody are avisos.
   Pure stdlib, ~80 ms.
2. **Normalize — deterministic.** `execution/tts_normalizar_texto.py` turns
   numbers, dates, times and amounts into their spoken form. "31/12/2026" has
   exactly one correct reading in Spanish, so a model has no business making
   that call. Acronyms are **reported, never guessed** — "CRTIC" could be spelled
   out or read as a word, and being wrong sounds worse than asking.
3. **Rewrite — the model.** Only the rhythm and the accents.

Both scripts are copied from the skill rather than reimplemented: what they
encode is measured, and rewriting it would throw away the evidence. Their
headers say so, so nobody edits the copy believing it is the original.

Running normalisation **before** the rewrite also stops the model reintroducing
digits: it sees "treinta y uno de diciembre" already written out.

### The model: `qwen3:4b` through ollama

**Why a small one.** With ComfyUI loaded the GPU has ~16 GB free of 23.9. The
two models already on this machine are 18 GB each — they do not fit beside the
voice engine at all. `qwen3:4b` is 2.5 GB. Qwen was preferred for being strong
in Spanish, which matters more here than usual: the job *is* accents and rhythm.

**Why raw completion and never the chat template.** Measured on this machine,
2026-08-24:

| Path | Result |
|---|---|
| chat template, thinking on | **21 s**, and 11 854 characters of deliberation to suggest two words |
| chat template, `think: false` | Did **not** suppress the reasoning — it merged it *into* the answer, in English: *"Okay, the user wants me to continue the Spanish sentence…"* |
| chat template, `/no_think` | Same leak |
| **raw completion** | **50 ms**, clean Spanish, no preamble |

So the chat path is unusable here regardless of latency. Raw completion is also
the conceptually right one: an autocomplete is a continuation, not a
conversation.

**Measured cost, resident:** ghost 94–141 ms, rewrite 0.08–0.28 s. **Cold:**
27.7 s to load; ollama unloads it after a few minutes idle, and the next call
then pays ~2.7 s. That is left alone deliberately — pinning it would hold 2.5 GB
against the voice engine, which is the thing this app exists to run.

### The result is always a proposal

**This is not caution in the abstract.** On the very first test run, given
*"el año pasado cambió todo para nosotros"*, the model returned *"cambié todo
para nosotros"* — it fixed every accent correctly and **changed who did what**.

The text is what the voice says out loud. So the shape is the one ADR-003
already established for the reference transcript: the machine drafts, the human
approves, nothing is applied until they say so. The panel additionally
**re-reviews its own proposal** and reports what is still wrong, rather than
claiming the rewrite fixed everything.

### Guard rails on the ghost — SUPERSEDED, see the Correction below

> The ghost was removed the same day. This section is kept because it records
> what was learned building it, not because any of it still runs. The test file
> it names went with the feature.


- It appears only when the caret is at the end. A continuation rendered
  mid-sentence points at a place the words would not go.
- It waits 400 ms after typing stops — longer than the round trip, because the
  cost being managed is interruption, not latency.
- **Suggestions are filtered.** Digits are trimmed (this project's own measured
  rule puts numbers in words), and anything containing characters that do not
  occur in Spanish narration is dropped: with too little context, raw completion
  continues whatever the fragment resembles, and for the single word "corto" it
  produced `= float(input("Corto: "))`.
  The filter is **characters only, no keyword list** — a first version also
  matched `def` and `import`, which in Spanish silently eats "definitivamente"
  and "importante". `web/tests/suggestion-guard.test.ts` exists because that
  version was written.
- Failure is silent. An autocomplete that reports errors while you type is worse
  than one that occasionally has no idea.

## Correction, same day: the ghost is gone, and with it the raw-completion rule

The user removed the ghost autocomplete ("solo le carga rendimiento al PC") and
separately reported that the rewrite was hallucinating. Those two facts are the
same fact.

**Raw completion was chosen for the ghost's latency budget**, and the rewrite
inherited it. But raw completion has no instruction to obey — it CONTINUES A
PATTERN of examples, which is exactly the mechanism that invents things. With
the ghost deleted the ~100 ms budget disappeared, and the rewrite could move to
the path the model is actually good at.

Measured on this machine, same model, same input, "el año pasado cambió todo":

| Path | Time | Result |
|---|---|---|
| raw completion | 0.3–3.7 s | *"el año pasado **cambié** todo"* — every accent fixed, subject of the sentence replaced |
| chat + reasoning | 19–27 s | *"el año pasado **cambió** todo"* — faithful, and it still broke the long sentences and marked the pauses |

A first instruction listed fidelity as rule 1 and rhythm as rule 3; the model
duly optimised the first and coasted on the third, returning faithful text with
no pauses in it. Stating both as obligations — with a failure condition on the
rhythm — and SHOWING the measured examples got both. That is `REWRITE_SYSTEM`.

**Reasoning stays ON.** `think: false` and `/no_think` do not suppress it
through ollama: they merge the deliberation into the answer, in English.

### And it is still not enough, which the interface now handles

Three verification runs of the same input: twice faithful, once *"Cambié todo"*
again. Reasoning made the failure rarer, not impossible, and no prompt will make
a 4B model incapable of it.

So the guard moved from the model to the interface: `web/src/lib/diff.ts` marks
**the words that actually changed**, folding accents, case and punctuation out
of the comparison so the corrections the button was pressed for stay unmarked.
A one-letter substitution inside a rewritten paragraph is precisely what a
reader misses; marked, it is the first thing they see.

**A bigger model was not adopted.** The two 30B models on this machine are 18 GB
each against ~16 GB free with the voice engine loaded — they do not fit beside
the thing this app exists to run.

## Consequences

**Good**
- The measured levers become visible help instead of tribal knowledge, closing
  B-004.
- Half the feature — knowing *what* is wrong — needs no model at all, and still
  answers when ollama is down.
- The engine's own constraints stay respected: numbers in words, text under the
  length ceiling, real `¿`.

**Bad, and accepted**
- **A new dependency the app does not install**: ollama plus a 2.5 GB model. The
  app degrades honestly without it (the deterministic half answers, the panel
  says the rewrite is unavailable) but this belongs in the install phase idea,
  backlog B-006.
- Two copies of the measured scripts exist — here and in the skill. Their
  headers name the original; if the rules change they change in both or the two
  diverge.
- The rewrite can be wrong about meaning. Contained by never applying it
  automatically, and by re-reviewing the proposal.

## Alternatives rejected

- **Measuring punctuation from scratch.** The research exists; see Context.
- **The 30B models already installed.** 18 GB each; they do not fit beside the
  voice engine, and a reasoning model needs ~21 s to suggest two words.
- **A cloud API.** This project runs entirely on the user's machine, by
  `PRODUCT.md`. Sending a script to a third party to fix its commas is not a
  trade this project makes.
- **Applying the rewrite directly, with undo.** Undo does not help when the
  change is a subtly different meaning that reads fine — which is exactly the
  failure observed.
