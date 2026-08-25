"use client";

import { useEffect, useState } from "react";
import type { Finding, ImproveState } from "@/lib/improve";
import { hasWordChanges, wordDiff } from "@/lib/diff";

/**
 * "Write it for the voice."
 *
 * WHY THIS EXISTS
 *   The two biggest levers on how a generated voice sounds are not in the
 *   engine, they are in the text — and both fail silently. Measured in the
 *   `voz-local` research: fixing the spelling changed the delivery by +15% to
 *   +29%, and punctuation moves the rhythm 3,5x more than the `instruct`
 *   parameter of a fine-tuned model. Nothing warns you. The graph validates,
 *   the audio generates, and it sounds foreign.
 *
 * WHY IT PROPOSES INSTEAD OF EDITING
 *   Because it is allowed to be wrong about meaning, and it has been: on the
 *   first test run, given "el año pasado cambió todo para nosotros", the model
 *   returned "cambié todo para nosotros" — every accent fixed, and the subject
 *   quietly changed. This text is what the voice says out loud. So the shape is
 *   the one ADR-003 already established for the transcript: the machine drafts,
 *   the human approves, and nothing is applied until they say so.
 *
 * PRESENTATIONAL BY DESIGN. The request is owned by ./lib/improve and started
 * from the field's rail, because the trigger and the result live in different
 * places in the tree. This renders a state; it does not fetch one.
 */

/**
 * When the wait stops being ordinary.
 *
 * Measured: the rewrite deliberates for 19-27 s before answering, and that is
 * the NORMAL case — the fast path was dropped because it invented things. Past
 * this threshold the model is also being loaded from disk (~28 s more), which
 * is a different and rarer story and gets its own line.
 */
const LONG_WAIT_SECONDS = 32;

/** A live count of how long we have been waiting. Reports; never predicts. */
function Waiting({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return (
    <div role="status" aria-live="polite">
      <p className="text-[13px] leading-relaxed text-ink-muted">
        Pensando la reescritura…{" "}
        <span className="font-mono text-[11px]">{seconds}s</span>
      </p>
      {/* Said up front, not as an apology after the fact: the wait IS the
          feature. (The fast way of asking was dropped because it produced text
          that changed the meaning of sentences — a reason the code keeps, but
          one the screen no longer spends a sentence on.) */}
      <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-muted">
        Tarda entre veinte y treinta segundos porque razona la respuesta antes
        de darla.
      </p>
      {seconds >= LONG_WAIT_SECONDS && (
        <p className="status-in mt-2 max-w-prose text-[13px] leading-relaxed text-ink-muted">
          Esta vez además está cargando el modelo en memoria, que son otros
          treinta segundos. Solo pasa la primera vez, o tras un rato sin usarlo.
        </p>
      )}
    </div>
  );
}

/**
 * The proposal, with the words that actually changed marked.
 *
 * ⚠️ NOT a nicety. The rewrite can change the meaning of a sentence — measured,
 * same input, three runs, one of which turned "cambió todo" into "Cambié todo"
 * — and reasoning made that rarer without making it impossible. Asking the user
 * to "read it carefully" does not work: finding a one-letter substitution
 * inside a rewritten paragraph is precisely what people miss.
 *
 * Accents and punctuation are folded out of the comparison, so the corrections
 * the button was pressed FOR stay unmarked and the marks mean something.
 */
function Proposal({ before, after }: { before: string; after: string }) {
  const parts = wordDiff(before, after);

  return (
    <p className="mb-2 whitespace-pre-wrap rounded-md bg-surface-raised px-4 py-3 text-[15px] leading-relaxed text-ink">
      {parts.map((part, i) => {
        const space = i === 0 ? "" : " ";
        if (part.kind === "same") return <span key={i}>{space + part.text}</span>;
        if (part.kind === "added") {
          return (
            <span
              key={i}
              className="text-accent-text underline decoration-accent/45 underline-offset-4"
            >
              {space + part.text}
            </span>
          );
        }
        return (
          <span key={i} className="text-ink-muted line-through decoration-ink-muted/60">
            {space + part.text}
          </span>
        );
      })}
    </p>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const blocking = finding.level === "BLOQUEANTE";
  return (
    <li className="flex gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
          blocking ? "bg-accent" : "bg-ink-muted/50"
        }`}
      />
      <div className="min-w-0">
        <p className="text-[13px] leading-relaxed text-ink">
          {blocking && (
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text">
              impide
            </span>
          )}
          {finding.message}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{finding.action}</p>
        {finding.examples && finding.examples.length > 0 && (
          <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
            {finding.examples.join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

export function ImprovePanel({
  state,
  text,
  onApply,
  onRun,
}: {
  state: ImproveState;
  /** What is in the field now — a result about older text is not a result. */
  text: string;
  onApply: (improved: string) => void;
  onRun: () => void;
}) {
  if (state.kind === "working") return <Waiting startedAt={state.startedAt} />;

  if (state.kind === "error") {
    return (
      <div role="alert">
        <p className="mb-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink">
          {state.message}
        </p>
        <button
          type="button"
          onClick={onRun}
          className="text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
        >
          Probar otra vez
        </button>
      </div>
    );
  }

  // Nothing written yet. There is no action to offer, so none is offered: a
  // disabled button is a promise the interface cannot keep, and it was reading
  // as a broken control rather than as a precondition.
  if (!text.trim()) {
    return (
      <p className="max-w-prose text-[13px] leading-relaxed text-ink-muted">
        Escribe algo primero. Esto revisa la ortografía y el ritmo, y propone una
        versión escrita para que la lea una voz — los acentos y la puntuación son
        lo que más cambia cómo suena.
      </p>
    );
  }

  // Idle, or a result that describes text the user has since changed. Both mean
  // the same thing to the reader: there is nothing true to show yet.
  if (state.kind === "idle" || state.source !== text) {
    return (
      <div>
        <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink-muted">
          {state.kind === "idle"
            ? "Revisa la ortografía y el ritmo, y propone una versión escrita para que la lea una voz. Los acentos y la puntuación son lo que más cambia cómo suena."
            : "El texto cambió desde la última revisión."}
        </p>
        {/* Outlined, not filled. `Generar` is the one primary action on this
            card, and a second solid accent button beside it makes the reader
            choose between two things that shout equally. */}
        <button
          type="button"
          onClick={onRun}
          style={{ transitionTimingFunction: "var(--ease-ui)" }}
          className="rounded-full border border-accent px-5 py-2.5 text-sm text-accent-text transition-[transform,background-color,color] duration-200 hover:bg-accent hover:text-accent-ink active:scale-[0.97]"
        >
          {state.kind === "idle" ? "Revisar" : "Revisar de nuevo"}
        </button>
      </div>
    );
  }

  const { findings, proposal, warnings, remaining, modelError } = state.result;

  if (findings.length === 0 && !proposal) {
    return (
      <p className="max-w-prose text-[13px] leading-relaxed text-ink">
        El texto está listo: ortografía con tildes, signos de apertura donde
        corresponde y un ritmo que el motor puede seguir.
      </p>
    );
  }

  return (
    <div>
      {findings.length > 0 && (
        <ul className="mb-5 divide-y divide-hairline border-y border-hairline">
          {findings.map((f) => (
            <FindingRow key={f.code} finding={f} />
          ))}
        </ul>
      )}

      {proposal && (
        <>
          <p className="eyebrow mb-3">Propuesta</p>
          <Proposal before={state.source} after={proposal} />
          {hasWordChanges(wordDiff(state.source, proposal)) ? (
            // The loud case. Everything marked is a word that changed, not an
            // accent that was fixed — so it is either a deliberate repetition
            // for rhythm or the model having reinterpreted something.
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink">
              Lo <span className="text-accent-text">subrayado</span> son palabras
              que cambiaron y lo tachado, palabras que ya no están. Las tildes y
              la puntuación no se marcan, porque eso es lo que le pediste.
              Míralas: aquí es donde el modelo puede haber cambiado lo que
              querías decir.
            </p>
          ) : (
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink-muted">
              Solo cambiaron las tildes y la puntuación. Ninguna palabra es
              distinta de las tuyas.
            </p>
          )}

          {remaining.length > 0 && (
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink-muted">
              Aun así queda algo por revisar: {remaining.map((r) => r.message).join(" ")}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onApply(proposal)}
              style={{ transitionTimingFunction: "var(--ease-ui)" }}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.97]"
            >
              Usar esta versión
            </button>
            <button
              type="button"
              onClick={onRun}
              className="text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
            >
              Proponer otra
            </button>
          </div>
        </>
      )}

      {warnings.length > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          {/* Acronyms are not guessed on purpose: "CRTIC" can be spelled out or
              read as a word, and getting it wrong sounds worse than asking. */}
          {warnings.map((w) => (
            <p key={w} className="max-w-prose text-[13px] leading-relaxed text-ink-muted">
              {w}
            </p>
          ))}
        </div>
      )}

      {modelError && (
        <p className="mt-5 max-w-prose border-t border-hairline pt-4 text-[13px] leading-relaxed text-ink-muted">
          La reescritura no está disponible ahora mismo — {modelError} Lo de
          arriba se detectó igual, sin modelo.
        </p>
      )}
    </div>
  );
}
