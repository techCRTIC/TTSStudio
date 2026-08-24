"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdvancedPanel,
  ADVANCED_DEFAULTS,
  isModified,
  type AdvancedState,
} from "@/components/AdvancedPanel";
import { AudioField } from "@/components/AudioField";
import { ImprovePanel } from "@/components/ImprovePanel";
import {
  ScriptField,
  MAX_HEIGHT,
  MAX_HEIGHT_COMPACT,
} from "@/components/ScriptField";
import {
  DockButton,
  TakesIcon,
  VoicesIcon,
  type Origin,
} from "@/components/DockButton";
import { PanelSlot } from "@/components/PanelSlot";
import { ToolRail, type Tool } from "@/components/ToolRail";
import { StatusLine, type Phase } from "@/components/StatusLine";
import { VoiceLibrary, type Voice } from "@/components/VoiceLibrary";
import { VoiceSelect } from "@/components/VoiceSelect";
import { Waveform } from "@/components/Waveform";
import { addTake, deleteTake, toggleGood, useHistory, type Take } from "@/lib/history";
import { useImprove } from "@/lib/improve";
import { clipFor, revealAt, REVEAL_CENTRE } from "@/lib/reveal";
import { useTextReview } from "@/lib/review";

export default function Studio() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState("");
  const [current, setCurrent] = useState<Take | null>(null);
  const history = useHistory();
  const [trayOpen, setTrayOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  /**
   * Where each drawer's reveal starts, as a CSS position.
   *
   * Computed in the click handler rather than during render, because it reads
   * the pressed button's box and the window's width. It survives the close so a
   * reopen grows from the same place — and so does the collapse.
   */
  const [voicesAt, setVoicesAt] = useState(REVEAL_CENTRE);
  const [trayAt, setTrayAt] = useState(REVEAL_CENTRE);

  const openDrawer = useCallback(
    (side: "left" | "right", origin: Origin) => {
      if (side === "left") {
        setVoicesAt(revealAt("left", origin));
        setLibraryOpen(true);
      } else {
        setTrayAt(revealAt("right", origin));
        setTrayOpen(true);
      }
    },
    [],
  );
  const [advanced, setAdvanced] = useState<AdvancedState>(ADVANCED_DEFAULTS);
  const [confirmingTake, setConfirmingTake] = useState<string | null>(null);
  const [takeError, setTakeError] = useState<string | null>(null);
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

  /**
   * The library is read from the engine, never cached as truth — registering a
   * voice writes a file into ComfyUI's prompts directory, and this re-read is
   * what makes it appear. An empty list is not an error: it is a fresh install
   * with no voices yet, which the library drawer says in its own words.
   */
  const loadVoices = useCallback(
    () =>
      fetch("/api/voices")
        .then((r) => r.json())
        .then((d) => {
          if (!Array.isArray(d.voices)) {
            setEngineDown(true);
            return;
          }
          setVoices(d.voices);
          setVoiceId((v) =>
            v && d.voices.some((x: Voice) => x.id === v) ? v : (d.voices[0]?.id ?? ""),
          );
          setEngineDown(false);
        })
        .catch(() => setEngineDown(true)),
    [],
  );

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

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

  /**
   * Which of the field's tools is open — at most one, ever.
   *
   * That is not a simplification, it is what keeps the card centred. The stage
   * sits in the middle of the viewport; two panels open at once would push it
   * past the fold and the user would have to scroll to reach the button they
   * were already looking at.
   */
  const [tool, setTool] = useState<Tool>(null);
  /**
   * What the slot is still RENDERING, which lags `tool` on the way down.
   *
   * React unmounts children in the same render that closes a panel, so the box
   * would collapse from a height it no longer has and the fold would simply not
   * be seen. The panel stays mounted until the collapse actually ends.
   */
  const [shownTool, setShownTool] = useState<Tool>(null);
  const improve = useImprove();

  // A quiet, continuous read of the text, with no model involved (~80 ms of
  // pure stdlib). It is what lets the rail's rewrite control mean something: it
  // wakes up when there is genuinely a finding, and stays still otherwise.
  const verdict = useTextReview(text, expanded && !busy);

  const openTool = useCallback(
    (next: Tool) => {
      setTool(next);
      // On the way UP the rendered panel changes immediately: the slot animates
      // to the new content's height and the contents rise into it.
      if (next !== null) setShownTool(next);
      // Opening the rewrite runs it, unless the answer on hand already
      // describes exactly this text. Pressing a control should produce a
      // result, not another button to press.
      const fresh = improve.state.kind === "done" && improve.state.source === text;
      if (next === "improve" && !fresh) improve.run(text);
    },
    [improve, text],
  );

  const generate = useCallback(async () => {
    const body = text.trim();
    if (!body || !voiceId || busy) return;

    setPhase("queued");
    setDetail("Enviando al motor");
    setCurrent(null);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: body,
        voiceId,
        // A pinned seed is sent; null means "roll a fresh one", which the
        // server does rather than the client, so the take records what ran.
        seed: advanced.seed,
        language: advanced.language,
        maxNewTokens: advanced.maxNewTokens,
      }),
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
      } else if (s.state === "finished") {
        // The engine finished successfully but handed back no audio. Normal for
        // a graph that writes a file (voice registration); for a generation it
        // means something is wrong with the graph, and saying so beats spinning
        // forever waiting for audio that is never coming.
        if (pollRef.current) window.clearInterval(pollRef.current);
        setPhase("failed");
        setDetail("El motor terminó pero no devolvió audio.");
      } else if (s.state === "failed") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setPhase("failed");
        setDetail(s.message ?? "La generación falló.");
      }
    }, 700);
  }, [text, voiceId, busy, voices, advanced]);

  /**
   * Delete a take: the audio file on disk AND the entry here. If the file
   * cannot be removed, the entry stays and the error is shown — dropping the
   * row first would lose the only handle to the orphaned file.
   */
  const removeTake = async (take: Take) => {
    setTakeError(null);
    try {
      await deleteTake(take);
      // The stage is showing a player pointed at a file that no longer exists.
      if (current?.id === take.id) {
        setCurrent(null);
        setPhase("idle");
        setDetail("");
      }
    } catch (cause) {
      setTakeError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setConfirmingTake(null);
    }
  };

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
          {/* The two handles, anchored to the card's own edges so they travel
              with it when the stage unfolds. Each one becomes its panel. */}
          <DockButton
            side="left"
            label="Voces"
            count={voices.length}
            open={libraryOpen}
            onOpen={(origin) => openDrawer("left", origin)}
          >
            <VoicesIcon />
          </DockButton>

          <DockButton
            side="right"
            label="Tomas"
            count={history.length}
            open={trayOpen}
            onOpen={(origin) => openDrawer("right", origin)}
          >
            <TakesIcon />
          </DockButton>

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

              {/* The field and its tools share one row. The rail costs no
                  vertical space — it stands in the margin the text never used —
                  where the same two controls as separate rows underneath cost
                  the centred card a line each, open or not. */}
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <ScriptField
                    id="script"
                    inputRef={scriptRef}
                    value={text}
                    onChange={setText}
                    onSubmit={() => void generate()}
                    // The field yields its ceiling to whatever panel is open,
                    // through the growth transition it already had. That is what
                    // keeps the card's total height nearly constant.
                    maxHeight={tool ? MAX_HEIGHT_COMPACT : MAX_HEIGHT}
                    placeholder="Escribe lo que debe decir. La puntuación es la palanca: los puntos suspensivos y las frases cortas cambian el ritmo."
                  />
                </div>

                <ToolRail
                  open={tool}
                  onOpen={openTool}
                  advancedModified={isModified(advanced)}
                  textMark={
                    (verdict?.blocking ?? 0) > 0
                      ? "attention"
                      : (verdict?.total ?? 0) > 0
                        ? "set"
                        : "none"
                  }
                  disabled={busy}
                />
              </div>

              {/* One slot, one panel at a time. It measures its contents and
                  animates an explicit height, which is the only way the same
                  rule can cover opening, SWITCHING between panels, and a panel
                  growing while it is open. See PanelSlot. */}
              <PanelSlot
                open={tool !== null}
                contentKey={shownTool ?? "none"}
                onClosed={() => setShownTool(null)}
              >
                {shownTool === "improve" && (
                  <ImprovePanel
                    state={improve.state}
                    text={text}
                    onRun={() => improve.run(text)}
                    onApply={(improved) => {
                      setText(improved);
                      setTool(null);
                    }}
                  />
                )}
                {shownTool === "advanced" && (
                  <AdvancedPanel
                    chromeless
                    state={advanced}
                    onChange={setAdvanced}
                    lastSeed={current?.seed ?? null}
                    lastText={current?.text ?? ""}
                    lastVoiceLabel={current?.voiceLabel ?? ""}
                  />
                )}
              </PanelSlot>

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

      <VoiceLibrary
        voices={voices}
        selectedId={voiceId}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onVoicesChanged={() => void loadVoices()}
        onSelect={setVoiceId}
        revealAt={voicesAt}
      />

      <aside
        aria-label="Historial de tomas"
        // A closed drawer stays in the DOM so it can glide. Without `inert` its
        // buttons stay in the tab order, so keyboard focus walks into a panel
        // nobody can see.
        inert={!trayOpen}
        // Revealed from its handle rather than slid in. See lib/reveal.
        style={{ clipPath: clipFor(trayOpen, trayAt) }}
        className="panel-reveal fixed right-0 top-0 z-30 h-dvh w-[380px] max-w-[86vw] border-l border-hairline bg-surface"
      >
        {/* The contents arrive after the panel. See .drawer-reveal. */}
        <div
          data-open={trayOpen}
          className="drawer-reveal drawer-reveal--right flex h-full flex-col"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-hairline px-5 py-5">
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

          <div className="min-h-0 flex-1 overflow-y-auto">
            {takeError && (
              <p
                role="alert"
                className="mx-5 mt-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink"
              >
                {takeError}
              </p>
            )}
            {history.length === 0 ? (
              <p className="px-5 py-8 text-sm leading-relaxed text-ink-muted">
                Todavía no hay tomas. Lo que generes queda aquí, y sigue aquí mañana.
              </p>
            ) : (
              <ul>
                {history.map((t) => (
                  <li key={t.id}>
                    <TakeRow
                      take={t}
                      active={current?.id === t.id}
                      confirming={confirmingTake === t.id}
                      onRecall={() => recall(t)}
                      onToggleGood={() => toggleGood(t.id)}
                      onAskDelete={() => setConfirmingTake(t.id)}
                      onCancelDelete={() => setConfirmingTake(null)}
                      onConfirmDelete={() => void removeTake(t)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </main>
  );
}

/**
 * One take in the tray.
 *
 * Its seed is on show because a seed is the only handle that makes a delivery
 * repeatable — and because a saved seed in the advanced panel is worth nothing
 * if you cannot see which take it came from.
 *
 * Deleting asks first, in place. The audio file is removed from disk for real,
 * and it is not regenerable once the take is gone from here.
 */
function TakeRow({
  take,
  active,
  confirming,
  onRecall,
  onToggleGood,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  take: Take;
  active: boolean;
  confirming: boolean;
  onRecall: () => void;
  onToggleGood: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="border-b border-hairline px-5 py-4">
        <p className="mb-3 text-[13px] leading-relaxed text-ink">
          ¿Borrar esta toma? El archivo de audio se elimina del disco.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirmDelete}
            className="rounded-full border border-accent px-4 py-1.5 text-sm text-accent-text transition-colors duration-200 hover:bg-accent hover:text-accent-ink"
          >
            Borrar
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            autoFocus
            className="rounded-full px-3 py-1.5 text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ boxShadow: active ? "inset 2px 0 0 var(--accent)" : "none" }}
      className="group flex items-start border-b border-hairline transition-colors duration-200 hover:bg-surface-raised"
    >
      <button type="button" onClick={onRecall} className="flex-1 px-5 py-4 text-left">
        <p className="line-clamp-2 text-sm leading-snug text-ink">{take.text}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-muted">
          <span>{take.voiceLabel}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(take.createdAt).toISOString()}>
            {new Date(take.createdAt).toLocaleTimeString("es", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          <span aria-hidden="true">·</span>
          <span title="La semilla con la que se generó">{take.seed}</span>
        </p>
      </button>
      {/* A take that was marked keeps its mark VISIBLE at rest; the unmarked
          control only appears on hover. The list should read as "these are the
          good ones" at a glance, without hovering every row. */}
      <button
        type="button"
        onClick={onToggleGood}
        aria-pressed={Boolean(take.good)}
        aria-label={take.good ? "Quitar la marca de buena" : "Marcar como buena"}
        className={`mt-3 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-opacity duration-200 focus-visible:opacity-100 group-hover:opacity-100 ${
          take.good
            ? "text-accent-text opacity-100"
            : "text-ink-muted opacity-0 hover:text-ink"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 1.8l1.6 3.3 3.6.5-2.6 2.6.6 3.6L7 10.1 3.8 11.8l.6-3.6L1.8 5.6l3.6-.5L7 1.8Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill={take.good ? "currentColor" : "none"}
            fillOpacity={take.good ? 0.22 : 0}
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onAskDelete}
        aria-label="Borrar esta toma"
        className="mr-3 mt-3 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted opacity-0 transition-opacity duration-200 hover:text-accent-text focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M2.5 3.5h9M5.5 3.5V2.4h3v1.1M3.6 3.5l.5 7.4a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-7.4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
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
