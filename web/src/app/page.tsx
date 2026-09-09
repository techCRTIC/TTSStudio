"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SegmentStrip, type SegmentInfo } from "@/components/SegmentStrip";
import SetupGate from "@/components/SetupGate";
import { needsSegmentation, useLongScript } from "@/lib/long-script";
import { segmentViews } from "@/lib/segment-view";
import { randomSeed } from "@/lib/tts";
import { VoiceLibrary, type Voice } from "@/components/VoiceLibrary";
import { VoiceSelect } from "@/components/VoiceSelect";
import { Waveform } from "@/components/Waveform";
import { addTake, audioRefOf, deleteTake, toggleGood, useHistory, type Take } from "@/lib/history";
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

  /**
   * The long-script path. It is a SECOND path, deliberately, and `generate()`
   * below chooses between them by counting characters — never by asking the
   * segmenter, which would be the extra Python process the roadmap's exit
   * criterion forbids for a short line.
   */
  /** The chosen voice's kind decides which node says it — and whether the
   *  intent field exists at all. Derived, never stored: a second copy could
   *  disagree with the list after a refresh. */
  const voiceKind = voices.find((v) => v.id === voiceId)?.kind ?? "cloned";

  const long = useLongScript();
  const [openSegment, setOpenSegment] = useState<number | null>(null);
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

  /**
   * The long run in flight, in the three phases where the engine is actually
   * working. Only "generating" can still be stopped: once the run is joining,
   * every segment is already paid for.
   */
  const longPhase = long.state.phase;
  const canStop = longPhase === "generating";
  const stopping = longPhase === "stopping";
  const longBusy = canStop || stopping || longPhase === "splitting" || longPhase === "joining";

  /**
   * Anything the user must not change mid-flight.
   *
   * It used to read the short path's `phase` alone, which meant the tool rail
   * locked during a twenty-second generation and stayed WIDE OPEN through a
   * twenty-eight segment run — exactly backwards, since changing the seed or
   * the language halfway through a long run corrupts the segments that have
   * not been generated yet.
   */
  const busy = phase === "queued" || phase === "running" || longBusy;

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

  /**
   * The long run, translated into what the screen already knows how to show.
   *
   * `tracks` is the sequencer's own record; `SegmentInfo` is what the strip
   * takes. They are near-identical on purpose — the translation stays here so
   * neither side has to know the other's vocabulary.
   */
  /**
   * The strip always draws EVERY cut, whether or not it has been generated
   * yet. Mapping over `tracks` instead made the total climb — "tramo 1 de 1",
   * then "de 2" — because tracks appear one at a time. See `segmentViews`.
   */
  const segmentInfos: SegmentInfo[] = useMemo(
    () => segmentViews(long.state.segments, long.state.tracks),
    [long.state.segments, long.state.tracks],
  );

  /**
   * Which tramo the engine is on, and what it says about it.
   *
   * The index comes from the tracks (exactly one is "generating", because the
   * walk is strictly in order) and the report comes from the poll. Falling
   * back to "running" when no report has landed yet is honest: the engine has
   * been asked and has not answered, which is not the same as a queue position
   * we could invent.
   */
  const activeSegment = useMemo(() => {
    const generating = long.state.tracks.find((track) => track.status === "generating");
    if (!generating) return null;
    return { index: generating.index, status: long.state.engine ?? { kind: "running" as const } };
  }, [long.state.tracks, long.state.engine]);

  /**
   * What the status line says while a long script runs.
   *
   * The line beside the field has told the truth about the engine since Fase 1
   * and must not go quiet just because the work is now split in twelve. It
   * borrows the short path's own vocabulary — queued/running — and adds the
   * one thing a long run knows and a short one does not: which tramo.
   *
   * `null` means "no long run in progress", and the short path's own `phase`
   * and `detail` are shown untouched.
   */
  const longStatus = useMemo((): { phase: Phase; detail: string } | null => {
    const total = long.state.segments.length;
    switch (long.state.phase) {
      case "splitting":
        return { phase: "queued", detail: "Partiendo el guión" };
      case "confirming":
        return { phase: "idle", detail: `Listo para decir ${total} tramos` };
      case "generating": {
        const at = long.state.tracks.find((t) => t.status === "generating");
        const where = at ? `Tramo ${at.index + 1} de ${total}` : `Tramo · de ${total}`;
        if (long.state.engine?.kind === "queued") {
          const position = long.state.engine.position;
          return { phase: "queued", detail: position ? `${where} · en cola, posición ${position}` : `${where} · en cola` };
        }
        return { phase: "running", detail: `${where} · generando` };
      }
      case "joining":
        return { phase: "running", detail: "Uniendo los tramos" };
      case "done":
        return { phase: "done", detail: "Listo" };
      case "failed":
        return { phase: "failed", detail: long.state.error ?? "El guión se detuvo." };
      default:
        return null;
    }
  }, [long.state.phase, long.state.segments.length, long.state.tracks, long.state.engine, long.state.error]);

  /**
   * A finished long script becomes ONE take, exactly like a short one — the
   * decision the user made when this was designed. Its segments ride along in
   * the optional field so the piece can be deleted whole and one tramo redone
   * later; the history list itself shows no difference.
   *
   * The ref guard is not decorative: this effect watches an object that a
   * re-render can hand back unchanged, and adding the same take twice would
   * put two rows in the history for one piece.
   */
  const savedPiece = useRef<string | null>(null);
  useEffect(() => {
    const result = long.state.result;
    if (long.state.phase !== "done" || result?.kind !== "joined") return;
    if (savedPiece.current === result.result.id) return;
    savedPiece.current = result.result.id;

    const voice = voices.find((v) => v.id === voiceId);
    const hechos = long.state.tracks.filter((t) => t.filename !== null && t.seed !== null);

    /*
     * A stopped run produces a piece of only the segments that finished, so
     * the take records THEIR text — not the whole script. Storing the full
     * script here would file a partial piece under a text it does not say,
     * and the history would look complete while the audio was not. The text
     * is the honest description of what the file contains.
     */
    const take: Take = {
      id: result.result.id,
      text: long.state.partial ? hechos.map((t) => t.text).join("\n\n") : text,
      voiceId,
      voiceLabel: voice?.label ?? voiceId,
      seed: long.state.tracks[0]?.seed ?? 0,
      audioUrl: result.result.audioUrl,
      filename: result.result.filename,
      createdAt: Date.now(),
      segments: hechos.map((track) => ({
        index: track.index,
        filename: track.filename as string,
        subfolder: track.subfolder,
        boundary: track.boundary,
        seed: track.seed as number,
      })),
    };
    setCurrent(take);
    addTake(take);
  }, [long.state.phase, long.state.result, long.state.tracks, long.state.partial, text, voiceId, voices]);

  const generate = useCallback(async () => {
    const body = text.trim();
    if (!body || !voiceId || busy) return;

    // The fork, and the only line that decides it. Everything below this block
    // is the path that has run since Fase 1, byte for byte: a short line costs
    // exactly what it cost yesterday.
    if (needsSegmentation(body)) {
      setCurrent(null);
      setOpenSegment(null);
      long.begin(body, voiceId, advanced.seed, {
        language: advanced.language,
        maxNewTokens: advanced.maxNewTokens,
      });
      return;
    }

    setPhase("queued");
    setDetail("Enviando al motor");
    setCurrent(null);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: body,
        voiceId,
        kind: voiceKind,
        // A pinned seed is sent; null means "roll a fresh one", which the
        // server does rather than the client, so the take records what ran.
        seed: advanced.seed,
        language: advanced.language,
        maxNewTokens: advanced.maxNewTokens,
        // Only ever sent for a preset: the server rejects it otherwise, on
        // purpose, rather than accepting a lever it cannot pull.
        ...(voiceKind === "preset" && advanced.instruct?.trim()
          ? { instruct: advanced.instruct.trim() }
          : {}),
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
  }, [text, voiceId, busy, voices, advanced, long, voiceKind]);

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

  /**
   * Llevar al archivo en el disco.
   *
   * El fallo esperable no es que el explorador no abra: es que el archivo ya no
   * esté. El historial guarda el texto y un enlace, no el audio, así que vaciar
   * la carpeta de salida de ComfyUI deja tomas en la lista sin nada detrás. Por
   * eso el error del servidor se muestra tal cual, en el mismo sitio donde ya
   * se muestran los de borrar.
   */
  const revealTake = async (take: Take) => {
    setTakeError(null);
    try {
      const res = await fetch("/api/takes/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La carpeta viaja dentro de la URL de la toma; sin ella, el explorador
        // se abriría en la raíz de salida y no en donde está el archivo.
        body: JSON.stringify(audioRefOf(take)),
      });
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as { mensaje?: unknown } | null;
        setTakeError(
          typeof cuerpo?.mensaje === "string"
            ? cuerpo.mensaje
            : "No se pudo abrir la carpeta del archivo.",
        );
      }
    } catch {
      setTakeError("No se pudo abrir la carpeta del archivo.");
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
        <div className="flex items-center gap-3">
          <EngineHealth down={engineDown} />
          <SetupGate />
        </div>
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
              {/*
                * Header and field share ONE grid so they share ONE width.
                *
                * They used to be two siblings: a full-width header row, and
                * below it a flex row where the field gave up the rail's width
                * plus the gap. The header therefore ran ~50px wider than the
                * field under it, and the status ("tramo 2 de 3") hung past the
                * field's right edge — which reads as the text box being
                * shoved off-centre, because a box is judged against whatever
                * sits directly above it.
                *
                * A grid fixes it without a magic number: the header occupies
                * column 1 only, so it is exactly as wide as the field, and the
                * rail keeps its own column. Explicit row/column placement
                * rather than source order, so no empty spacer cell exists just
                * to hold a grid position.
                *
                * The rail still costs no vertical space — it stands in the
                * margin the text never used — where the same two controls as
                * rows underneath would cost the centred card a line each.
                */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
                <div className="col-start-1 row-start-1 mb-4 flex items-baseline justify-between gap-4">
                  <label htmlFor="script" className="eyebrow">
                    El texto
                  </label>
                  <StatusLine phase={longStatus?.phase ?? phase} detail={longStatus?.detail ?? detail} />
                </div>

                <div className="col-start-1 row-start-2 min-w-0">
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

                <div className="col-start-2 row-start-2">
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
                    voiceKind={voiceKind}
                    state={advanced}
                    onChange={setAdvanced}
                    lastSeed={current?.seed ?? null}
                    lastText={current?.text ?? ""}
                    lastVoiceLabel={current?.voiceLabel ?? ""}
                  />
                )}
              </PanelSlot>

              {/* The long-script strip. It lives BELOW the field and the field
                  never moves for it — the stage keeps its centre, which is the
                  whole point of the session-3 redesign. A short line never
                  renders any of this, because `long.state.phase` stays "idle".
                  See SegmentStrip and lib/long-script.ts. */}
              {long.state.phase !== "idle" && (
                <div className="mt-6">
                  {long.state.phase === "confirming" && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted">
                        Lo diré en{" "}
                        <span className="tabular-nums font-medium text-ink">
                          {long.state.segments.length}
                        </span>{" "}
                        tramos. Los cortes caen siempre al final de una frase.
                      </p>
                      <button
                        type="button"
                        onClick={() => long.confirm(voiceId, advanced.seed ?? randomSeed(), {
                          language: advanced.language,
                          maxNewTokens: advanced.maxNewTokens,
                        })}
                        style={{ transitionTimingFunction: "var(--ease-ui)" }}
                        className="rounded-full border border-accent bg-surface px-5 py-2 text-sm font-medium text-accent-text transition-[transform,background-color,border-color] duration-200 hover:bg-accent-soft hover:border-accent-text active:scale-[0.97]"
                      >
                        Generar los tramos
                      </button>
                    </div>
                  )}

                  <SegmentStrip
                    segments={segmentInfos}
                    active={activeSegment}
                    openIndex={openSegment}
                    onOpen={setOpenSegment}
                    onListen={(index) => {
                      const track = long.state.tracks.find((t) => t.index === index);
                      if (track?.audioUrl) setCurrent((prev) => (prev ? { ...prev, audioUrl: track.audioUrl! } : prev));
                    }}
                    onRedo={(index) =>
                      long.redo(index, voiceId, {
                        language: advanced.language,
                        maxNewTokens: advanced.maxNewTokens,
                      })
                    }
                  />

                  {long.state.phase === "failed" && long.state.error && (
                    <p className="mt-3 text-sm text-danger">
                      {long.state.failedIndex !== null
                        ? `Se detuvo en el tramo ${long.state.failedIndex + 1}: ${long.state.error}`
                        : long.state.error}
                    </p>
                  )}
                </div>
              )}

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

                {/* The label used to stay put on purpose: renaming a button
                    mid-action changes its width under the cursor for no
                    information gained. That held while the action was a
                    twenty-second generation with nothing to decide. A long run
                    is minutes of work the user may want to cut short, so there
                    IS a second action, and a button that hides it is the
                    reason the run could not be stopped at all. The width is
                    pinned instead, so nothing moves under the cursor. */}
                <button
                  type="button"
                  onClick={() => (canStop ? long.stop() : void generate())}
                  disabled={canStop ? false : stopping || !text.trim() || !voiceId || busy}
                  aria-label={canStop ? "Detener el guión y unir los tramos ya hechos" : undefined}
                  style={{ transitionTimingFunction: "var(--ease-ui)" }}
                  className="min-w-[9.5rem] rounded-full border border-accent bg-surface px-7 py-3 text-center text-sm font-medium text-accent-text transition-[transform,background-color,border-color] duration-200 hover:bg-accent-soft hover:border-accent-text active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {stopping ? "Deteniendo…" : canStop ? "Detener" : "Generar"}
                  {!canStop && !stopping && (
                    <span className="ml-2 font-mono text-[11px] opacity-60">Ctrl ↵</span>
                  )}
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
                      onReveal={() => void revealTake(t)}
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
  onReveal,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  take: Take;
  active: boolean;
  confirming: boolean;
  onRecall: () => void;
  onToggleGood: () => void;
  onReveal: () => void;
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
      {/* Llevar al archivo en el disco. Va aquí, y no en la tarjeta de arriba,
          porque es una acción SOBRE ESTA toma — el mismo sitio donde ya viven
          marcarla y borrarla. */}
      <button
        type="button"
        onClick={onReveal}
        aria-label="Ver el archivo en el disco"
        title="Ver el archivo en el disco"
        className="mt-3 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted opacity-0 transition-opacity duration-200 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1.6 11V3.6a.8.8 0 0 1 .8-.8h2.7l1.1 1.4h5.4a.8.8 0 0 1 .8.8V11a.8.8 0 0 1-.8.8H2.4a.8.8 0 0 1-.8-.8Z" />
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
