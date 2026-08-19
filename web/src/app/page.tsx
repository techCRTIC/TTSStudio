"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioField } from "@/components/AudioField";
import { Waveform } from "@/components/Waveform";
import { addTake, useHistory, type Take } from "@/lib/history";

type Voice = { id: string; label: string };
type Phase = "idle" | "queued" | "running" | "done" | "failed";

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
  const pollRef = useRef<number | null>(null);

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
        <StatusPill phase={phase} detail={detail} engineDown={engineDown} />
      </header>

      <div className="relative z-10 flex min-h-[calc(100dvh-160px)] items-center justify-center px-8 pb-12">
        <section className="elevated elevated--focal w-full max-w-3xl p-8" aria-label="Generación">
          <label htmlFor="script" className="eyebrow mb-4 block">
            El texto
          </label>
          <textarea
            id="script"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void generate();
            }}
            rows={5}
            spellCheck={false}
            placeholder="Escribe lo que debe decir. La puntuación es la palanca: los puntos suspensivos y las frases cortas cambian el ritmo."
            className="w-full resize-none bg-transparent text-[19px] leading-[1.55] text-ink outline-none placeholder:text-ink-muted"
          />

          <div className="mt-6 border-t border-hairline pt-6">
            <Waveform src={current?.audioUrl ?? null} onEnergy={setEnergy} />
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label htmlFor="voice" className="eyebrow">
                Voz
              </label>
              <select
                id="voice"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                disabled={!voices.length}
                className="rounded-full border border-hairline bg-surface px-4 py-2 text-sm text-ink outline-none transition-colors duration-200 hover:border-accent disabled:opacity-40"
              >
                {voices.length === 0 && <option>Sin voces</option>}
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>

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
              {busy ? "Generando…" : "Generar"}
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
            <span aria-hidden="true">✕</span>
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

function StatusPill({
  phase,
  detail,
  engineDown,
}: {
  phase: Phase;
  detail: string;
  engineDown: boolean;
}) {
  if (engineDown) {
    return (
      <span
        role="status"
        className="flex items-center gap-2 rounded-full border border-accent/40 px-3 py-1.5 text-xs text-ink"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        ComfyUI no responde
      </span>
    );
  }
  if (phase === "idle") return <span className="eyebrow">Listo</span>;

  const live = phase === "queued" || phase === "running";
  return (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 text-xs text-ink-muted"
    >
      <span
        aria-hidden="true"
        className={
          "h-1.5 w-1.5 rounded-full " + (live ? "animate-pulse bg-accent" : "bg-ink-muted")
        }
      />
      {detail}
    </span>
  );
}
