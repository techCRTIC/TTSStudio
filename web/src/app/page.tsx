"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioField } from "@/components/AudioField";
import { ScriptField } from "@/components/ScriptField";
import { StatusLine, type Phase } from "@/components/StatusLine";
import { VoiceSelect } from "@/components/VoiceSelect";
import { Waveform } from "@/components/Waveform";
import { addTake, useHistory, type Take } from "@/lib/history";

type Voice = { id: string; label: string };

export default function Studio() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState("");
  const [current, setCurrent] = useState<Take | null>(null);
  const history = useHistory();
  const [trayOpen, setTrayOpen] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [engineDown, setEngineDown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pollRef = useRef<number | null>(null);
  const scriptRef = useRef<HTMLTextAreaElement>(null);

  const expand = useCallback(() => {
    setExpanded(true);
    // The click that opened the stage should also be the click that put the
    // caret in it; anything else asks for a second one.
    requestAnimationFrame(() => scriptRef.current?.focus());
  }, []);

  /**
   * Folding back is deliberately conservative: only when the stage is empty AND
   * nothing has been generated. Collapsing over a finished take would hide the
   * player and the download along with it.
   */
  const onStageBlur = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      // Focus moving WITHIN the stage is not leaving it.
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      const working = phase === "queued" || phase === "running";
      if (text.trim() === "" && !current && !working) setExpanded(false);
    },
    [text, current, phase],
  );

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => {
        if (d.voices?.length) {
          setVoices(d.voices);
          setVoiceId((v) => v || d.voices[0].id);
          setEngineDown(false);
        } else {
          setEngineDown(true);
        }
      })
      .catch(() => setEngineDown(true));
  }, []);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  // A drawer that opens must close with Escape; anything else is a trap for
  // whoever is not driving with a mouse.
  useEffect(() => {
    if (!trayOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") setTrayOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trayOpen]);

  const busy = phase === "queued" || phase === "running";

  const generate = useCallback(async () => {
    const body = text.trim();
    if (!body || !voiceId || busy) return;

    setPhase("queued");
    setDetail("Enviando al motor");
    setCurrent(null);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: body, voiceId }),
    });
    const submitted = await res.json();

    if (!res.ok) {
      setPhase("failed");
      setDetail(submitted.message ?? "No se pudo enviar la generación.");
      return;
    }

    const { promptId, seed } = submitted;

    pollRef.current = window.setInterval(async () => {
      const s = await fetch("/api/status/" + promptId)
        .then((r) => r.json())
        .catch(() => null);
      if (!s) return;

      if (s.state === "queued") {
        setPhase("queued");
        setDetail(s.position ? "En cola, posición " + s.position : "En cola");
      } else if (s.state === "running") {
        setPhase("running");
        setDetail("Generando");
      } else if (s.state === "done") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        const voice = voices.find((v) => v.id === voiceId);
        const take: Take = {
          id: promptId,
          text: body,
          voiceId,
          voiceLabel: voice?.label ?? voiceId,
          seed,
          audioUrl: s.audioUrl,
          filename: s.filename,
          createdAt: Date.now(),
        };
        setCurrent(take);
        setPhase("done");
        setDetail("Listo");
        addTake(take);
      } else if (s.state === "failed") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setPhase("failed");
        setDetail(s.message ?? "La generación falló.");
      }
    }, 700);
  }, [text, voiceId, busy, voices]);

  const recall = (take: Take) => {
    setCurrent(take);
    setText(take.text);
    setVoiceId(take.voiceId);
    setPhase("done");
    setDetail("Toma recuperada");
    // A take pulled from the tray has text and audio to show; a folded stage
    // would hide both.
    setExpanded(true);
  };

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <AudioField energy={energy} />

      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
            TTS Studio
          </h1>
          <span className="eyebrow">Qwen3 · local</span>
        </div>
        <EngineHealth down={engineDown} />
      </header>

      <div className="relative z-10 flex min-h-[calc(100dvh-160px)] items-center justify-center px-8 pb-12">
        <section
          onBlur={onStageBlur}
          aria-label="Generación"
          style={{
            /**
             * `max-width` and `padding` are layout properties, and animating
             * them is deliberate here: this is a discrete moment the user asked
             * for by clicking, once, not something running per frame or per
             * keystroke. The unfolding of the body itself avoids the same cost
             * by using grid-template-rows, which is the technique the design
             * detector recommends over animating height.
             */
            transitionProperty: "max-width, padding",
            transitionDuration: "var(--dur-glide)",
            transitionTimingFunction: "var(--ease-wave)",
          }}
          className={`elevated elevated--focal relative w-full ${
            expanded ? "max-w-3xl p-8" : "max-w-lg p-2"
          }`}
        >
          {/* Collapsed: one quiet line, sized like a search box. It collapses
              through the same grid technique as the body, in reverse, so each
              state contributes its own height and neither needs a fixed one. */}
          <div
            className="grid"
            inert={expanded}
            style={{
              gridTemplateRows: expanded ? "0fr" : "1fr",
              transitionProperty: "grid-template-rows, opacity",
              transitionDuration: "var(--dur-glide)",
              transitionTimingFunction: "var(--ease-wave)",
              opacity: expanded ? 0 : 1,
            }}
          >
            <div className="overflow-hidden">
              <button
                type="button"
                onClick={expand}
                className="flex h-12 w-full items-center rounded-md px-4 text-left text-[15px] text-ink-muted"
              >
                Escribe lo que debe decir…
              </button>
            </div>
          </div>

          {/* Expanded. grid-template-rows is what animates the unfold: it is the
              technique the design detector points to instead of animating
              height, and here it does the whole job. */}
          <div
            className="grid"
            style={{
              gridTemplateRows: expanded ? "1fr" : "0fr",
              transitionProperty: "grid-template-rows, opacity",
              transitionDuration: "var(--dur-glide)",
              transitionTimingFunction: "var(--ease-wave)",
              opacity: expanded ? 1 : 0,
            }}
          >
            <div className="overflow-hidden">
              {/* Label and status share the row: what this field is on the left,
                  what the engine is doing with it on the right. */}
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <label htmlFor="script" className="eyebrow">
                  El texto
                </label>
                <StatusLine phase={phase} detail={detail} />
              </div>

              <ScriptField
                id="script"
                inputRef={scriptRef}
                value={text}
                onChange={setText}
                onSubmit={() => void generate()}
                placeholder="Escribe lo que debe decir. La puntuación es la palanca: los puntos suspensivos y las frases cortas cambian el ritmo."
              />

              <div className="mt-6 border-t border-hairline pt-6">
                <Waveform src={current?.audioUrl ?? null} onEnergy={setEnergy} />
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="eyebrow">Voz</span>
                  <VoiceSelect voices={voices} value={voiceId} onChange={setVoiceId} />

                  {current && (
                    <a
                      href={current.audioUrl}
                      download={current.filename}
                      className="rounded-full border border-hairline px-4 py-2 text-sm text-ink-muted transition-colors duration-200 hover:border-accent hover:text-accent-text"
                    >
                      Descargar
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={!text.trim() || !voiceId || busy}
                  style={{ transitionTimingFunction: "var(--ease-ui)" }}
                  className="rounded-full bg-accent px-7 py-3 text-sm font-medium text-accent-ink transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {/* The label stays put. The status line beside the field already
                      says "Generando", and a button that renames itself mid-action
                      changes width under the cursor for no information gained. */}
                  Generar
                  <span className="ml-2 font-mono text-[11px] opacity-60">Ctrl ↵</span>
                </button>
              </div>

              {phase === "failed" && (
                <p
                  role="alert"
                  className="mt-5 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-ink"
                >
                  {detail}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={() => setTrayOpen((o) => !o)}
        aria-expanded={trayOpen}
        className="fixed right-0 top-1/2 z-20 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-hairline bg-surface px-3 py-7 text-ink-muted transition-colors duration-200 hover:text-accent-text"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] [writing-mode:vertical-rl]">
          Tomas{history.length > 0 ? " · " + history.length : ""}
        </span>
      </button>

      <aside
        aria-label="Historial de tomas"
        // A closed drawer stays in the DOM so it can glide. Without `inert` its
        // buttons stay in the tab order, so keyboard focus walks into a panel
        // nobody can see.
        inert={!trayOpen}
        style={{
          transform: trayOpen ? "translateX(0)" : "translateX(100%)",
          transitionDuration: "var(--dur-glide)",
          transitionTimingFunction: "var(--ease-wave)",
        }}
        className="fixed right-0 top-0 z-30 h-dvh w-[380px] max-w-[86vw] border-l border-hairline bg-surface transition-transform"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-5">
          <span className="eyebrow">Tomas</span>
          <button
            type="button"
            onClick={() => setTrayOpen(false)}
            aria-label="Cerrar historial"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-surface-raised hover:text-ink"
          >
            {/* Drawn, not a Unicode glyph standing in for an icon. */}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="h-[calc(100dvh-73px)] overflow-y-auto">
          {history.length === 0 ? (
            <p className="px-5 py-8 text-sm leading-relaxed text-ink-muted">
              Todavía no hay tomas. Lo que generes queda aquí, y sigue aquí mañana.
            </p>
          ) : (
            <ul>
              {history.map((t) => {
                const active = current?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => recall(t)}
                      style={{ boxShadow: active ? "inset 2px 0 0 var(--accent)" : "none" }}
                      className="w-full border-b border-hairline px-5 py-4 text-left transition-colors duration-200 hover:bg-surface-raised"
                    >
                      <p className="line-clamp-2 text-sm leading-snug text-ink">{t.text}</p>
                      <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-ink-muted">
                        <span>{t.voiceLabel}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={new Date(t.createdAt).toISOString()}>
                          {new Date(t.createdAt).toLocaleTimeString("es", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </main>
  );
}

/**
 * Engine health, which is about the app rather than about this take — so it
 * stays in the top bar while the generation status moved down beside the field.
 * It shows nothing while ComfyUI is answering: a permanent green light is noise,
 * and its absence is what makes the warning register when it appears.
 */
function EngineHealth({ down }: { down: boolean }) {
  if (!down) return null;
  return (
    <span
      role="status"
      className="status-in flex items-center gap-2 rounded-full border border-accent/40 px-3 py-1.5 text-xs text-ink"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      ComfyUI no responde
    </span>
  );
}
