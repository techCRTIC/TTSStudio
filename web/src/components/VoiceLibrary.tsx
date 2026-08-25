"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceRecorder } from "./VoiceRecorder";
import { clipFor } from "@/lib/reveal";
import {
  NAME_MAX,
  NOTE_MAX,
  SOURCE_LABELS,
  UNDOCUMENTED,
  type Provenance,
} from "@/lib/provenance";

/**
 * The voice library: a drawer that mirrors the takes tray on the other edge.
 *
 * Left is what goes IN (the voices), right is what comes OUT (the takes). A
 * drawer rather than a modal on purpose — registering a voice interrupts
 * nothing and protects no focus, so it has no business stopping the screen.
 *
 * Registration is two server steps, and they are two steps because the middle
 * of them belongs to the user: the engine needs a transcript of the reference
 * clip, an ASR draft is wrong often enough to matter (it turned "Andrés" into
 * "Andrea" on the very first real clip), and a transcript that does not match
 * the audio makes a worse voice. So the draft is shown, and it is editable,
 * before anything is computed. See ADR-003.
 *
 * Each voice also carries PROVENANCE and can be HEARD (ADR-005). Both exist for
 * the same reason: a voice here is a clone of a real person, so who it is has
 * to be visible, and what it sounds like has to be checkable without committing
 * to a take.
 */

export type Voice = {
  id: string;
  label: string;
  /**
   * "cloned" is somebody's voice, computed from their recording. "preset" is
   * one of the speakers inside the model's own weights — nothing was recorded
   * and nobody has to consent to it, which is why it carries no provenance.
   */
  kind: "cloned" | "preset";
  provenance: Provenance | null;
  sampleUrl: string | null;
};

type Stage =
  | { kind: "idle" }
  | { kind: "transcribing"; filename: string; startedAt: number }
  | {
      kind: "review";
      audioFilename: string;
      text: string;
      name: string;
      note: string;
      source: "upload" | "microphone";
      transcribedSeconds: number;
      decodedSeconds: number;
      maxSeconds: number;
    }
  | { kind: "creating"; name: string }
  | { kind: "created"; name: string }
  | { kind: "error"; message: string; retryable: boolean };

/** What a row is doing, beyond just sitting there. */
type RowMode =
  | { kind: "resting" }
  | { kind: "confirming-delete" }
  | { kind: "editing"; name: string; note: string; saving: boolean; error: string | null };

/**
 * When the wait stops being ordinary and starts needing an explanation.
 *
 * Measured: a warm model transcribes 30 s of audio in ~27 s. The FIRST run on a
 * machine also downloads 2.9 GB and took ~10 minutes. Past this threshold the
 * ordinary case is over, so saying why is information rather than noise.
 */
const LONG_WAIT_SECONDS = 45;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** "21 ago 2026". Short because it sits in a subline, not in a report. */
function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(epochMs));
}

/**
 * The one-line provenance summary under a voice's name.
 *
 * Returns null when there is genuinely nothing recorded, so the caller can say
 * so plainly instead of printing an empty line. "Sin procedencia registrada" is
 * the honest state of every voice that predates ADR-005, and hiding it would
 * make an undocumented voice look documented.
 */
function describeProvenance(p: Provenance | null): string | null {
  if (!p) return null;
  const parts: string[] = [SOURCE_LABELS[p.source]];
  if (p.registeredAt > 0) parts.push(formatDate(p.registeredAt));
  if (p.refSeconds > 0) parts.push(`${p.refSeconds}s de audio`);
  return parts.join(" · ");
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
      {[
        [1, 4.5, 3],
        [4.5, 1.5, 9],
        [8, 3, 6],
        [11.5, 0.5, 11],
        [15, 4, 4],
      ].map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width="1.4" height={h} rx="0.7" fill="currentColor" />
      ))}
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
      <path d="M2.5 1.8 10 6.5l-7.5 4.7V1.8Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1.2" fill="currentColor" />
    </svg>
  );
}

/** Three dots that breathe while the engine is speaking for the first time. */
function ThinkingIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true">
      {[2, 7, 12].map((cx, i) => (
        <circle key={cx} cx={cx} cy="6" r="1.4" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.25;1;0.25"
            dur="1.2s"
            begin={`${i * 0.16}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.4 2.3 11.7 4.6M2.5 11.5l.6-2.3 6-6a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-6 6-2.3.6a.4.4 0 0 1-.5-.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5h9M5.5 3.5V2.4h3v1.1M3.6 3.5l.5 7.4a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-7.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One voice in the list.
 *
 * Deleting takes two clicks and the second one says what it destroys. A voice
 * embedding is NOT regenerable without the original reference audio, and that
 * audio is somebody's recording that may not exist anywhere else.
 */
function VoiceRow({
  voice,
  active,
  mode,
  preview,
  onSelect,
  onPlay,
  onStop,
  onAskDelete,
  onCancel,
  onConfirmDelete,
  onEdit,
  onChangeEdit,
  onSaveEdit,
}: {
  voice: Voice;
  active: boolean;
  mode: RowMode;
  preview: "idle" | "loading" | "playing";
  onSelect: () => void;
  onPlay: () => void;
  onStop: () => void;
  onAskDelete: () => void;
  onCancel: () => void;
  onConfirmDelete: () => void;
  onEdit: () => void;
  onChangeEdit: (patch: { name?: string; note?: string }) => void;
  onSaveEdit: () => void;
}) {
  if (mode.kind === "confirming-delete") {
    return (
      <div className="border-b border-hairline px-5 py-4">
        <p className="mb-3 text-[13px] leading-relaxed text-ink">
          ¿Borrar <span className="text-accent-text">{voice.label}</span>? No se
          puede recuperar sin el audio original.
        </p>
        {voice.provenance?.note && (
          <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">
            También se borra lo que anotaste sobre su procedencia.
          </p>
        )}
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
            onClick={onCancel}
            autoFocus
            className="rounded-full px-3 py-1.5 text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (mode.kind === "editing") {
    return (
      <div className="border-b border-hairline px-5 py-4">
        <p className="eyebrow mb-3">Procedencia</p>

        <label htmlFor={`name-${voice.id}`} className="mb-2 block text-[13px] text-ink-muted">
          Cómo se llama
        </label>
        <div className="field mb-4 px-4 py-2.5">
          <input
            id={`name-${voice.id}`}
            value={mode.name}
            maxLength={NAME_MAX}
            autoFocus
            onChange={(e) => onChangeEdit({ name: e.target.value })}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>

        <label htmlFor={`note-${voice.id}`} className="mb-2 block text-[13px] text-ink-muted">
          De quién es y con qué permiso
        </label>
        <div className="field mb-2 px-4 py-2.5">
          <textarea
            id={`note-${voice.id}`}
            value={mode.note}
            maxLength={NOTE_MAX}
            rows={3}
            onChange={(e) => onChangeEdit({ note: e.target.value })}
            placeholder="Andrés, grabado el 12 de agosto con su permiso para el proyecto."
            className="script-area w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
          Esta voz es de una persona real. Lo que escribas aquí se guarda junto
          a la voz, y es lo único que recordará de quién es.
        </p>

        {mode.error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink"
          >
            {mode.error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveEdit}
            disabled={mode.saving || !mode.name.trim()}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {mode.saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  const provenanceLine = describeProvenance(voice.provenance);

  return (
    <div
      style={{ boxShadow: active ? "inset 2px 0 0 var(--accent)" : "none" }}
      className="group flex items-start border-b border-hairline transition-colors duration-200 hover:bg-surface-raised"
    >
      {/* Hearing a voice is not selecting it, so it is its own control. It
          carries the wave mark the row used to show, because it is the same
          idea made actionable: this is what this voice sounds like. */}
      <button
        type="button"
        onClick={preview === "playing" ? onStop : onPlay}
        disabled={preview === "loading"}
        aria-label={
          preview === "playing"
            ? `Parar la muestra de ${voice.label}`
            : `Escuchar ${voice.label}`
        }
        className="mt-3 ml-4 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-surface hover:text-accent-text disabled:hover:bg-transparent"
      >
        {preview === "loading" ? (
          <ThinkingIcon />
        ) : preview === "playing" ? (
          <StopIcon />
        ) : (
          <PlayIcon />
        )}
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="flex-1 py-3.5 pl-2 pr-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm text-ink">{voice.label}</span>
          {active && (
            <span className="font-mono text-[11px] text-ink-muted">en uso</span>
          )}
        </span>
        <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted">
          {provenanceLine ?? UNDOCUMENTED}
        </span>
        {voice.provenance?.note && (
          <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted">
            {voice.provenance.note}
          </span>
        )}
        {preview === "loading" && (
          <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted">
            Generando la muestra. La primera vez hay que esperar; después suena
            al instante.
          </span>
        )}
      </button>

      <span className="mt-2.5 mr-3 flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar la procedencia de ${voice.label}`}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:text-accent-text"
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          onClick={onAskDelete}
          aria-label={`Borrar la voz ${voice.label}`}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:text-accent-text"
        >
          <TrashIcon />
        </button>
      </span>
    </div>
  );
}

/** A live count of how long we have been waiting. Reports; never predicts. */
function Elapsed({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return (
    <>
      <p className="font-mono text-[11px] text-ink-muted" aria-hidden="true">
        {formatElapsed(seconds)}
      </p>
      {seconds >= LONG_WAIT_SECONDS && (
        <p className="status-in mt-3 text-[13px] leading-relaxed text-ink-muted">
          Está tardando más de lo normal. La primera vez hay que descargar el
          modelo que escucha el audio —son 2,9 GB— y eso puede llevar varios
          minutos. Solo ocurre una vez.
        </p>
      )}
    </>
  );
}

export function VoiceLibrary({
  voices,
  selectedId,
  open,
  onOpenChange,
  onVoicesChanged,
  onSelect,
  revealAt,
}: {
  voices: Voice[];
  selectedId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoicesChanged: () => void;
  onSelect: (id: string) => void;
  /**
   * Where the reveal starts, in this panel's own box.
   *
   * It is the centre of the round handle beside the stage, so the panel appears
   * to grow out of the control that was pressed. See lib/reveal.
   */
  revealAt: string;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  // What each row is doing. Confirmation and editing happen in place rather
  // than through window.confirm/prompt: this surface replaced the native select
  // to keep the OS's chrome out, and a browser modal is the same borrowed
  // chrome wearing a different hat.
  const [rowModes, setRowModes] = useState<Record<string, RowMode>>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The playing state carries its own url so the <audio> element can be
  // RENDERED rather than constructed. An imperative `new Audio()` whose
  // handlers get assigned after the fact is a second, invisible source of
  // truth about what is playing; mounting and unmounting an element makes
  // "this voice is playing" and "this audio exists" the same fact.
  const [preview, setPreview] = useState<
    { id: string; state: "loading" } | { id: string; state: "playing"; url: string } | null
  >(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const previewPollRef = useRef<number | null>(null);

  const modeOf = (id: string): RowMode => rowModes[id] ?? { kind: "resting" };
  const setMode = (id: string, mode: RowMode) =>
    setRowModes((prev) => ({ ...prev, [id]: mode }));

  const busy = stage.kind === "transcribing" || stage.kind === "creating";

  /** Stop whatever is playing. Unmounting the element IS the stop. */
  const stopPreview = useCallback(() => {
    if (previewPollRef.current) {
      window.clearInterval(previewPollRef.current);
      previewPollRef.current = null;
    }
    setPreview(null);
  }, []);

  const play = useCallback((url: string, voiceId: string) => {
    setPreview({ id: voiceId, state: "playing", url });
  }, []);

  /**
   * Open or close the drawer.
   *
   * A closed drawer must not keep talking: hearing a sample from a panel that
   * is no longer on screen reads as a bug. Every close goes through here — the
   * edge tab, the close button and Escape are the only ways in, and the parent
   * never closes it on its own — so this is the whole surface, with no effect
   * needed to watch a prop change after the fact.
   */
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) stopPreview();
      onOpenChange(next);
    },
    [onOpenChange, stopPreview],
  );

  /**
   * Hear a voice.
   *
   * Cached samples play immediately. The first time, the engine has to say the
   * sentence, so this submits a generation, polls it like every other job in
   * this app, and then asks the server to remember the result — by prompt id,
   * never by filename: the server reads what that job produced from the engine
   * itself rather than believing the browser.
   */
  const playVoice = useCallback(
    async (voice: Voice) => {
      setPreviewError(null);
      stopPreview();

      if (voice.sampleUrl) {
        play(voice.sampleUrl, voice.id);
        return;
      }

      setPreview({ id: voice.id, state: "loading" });

      let promptId: string;
      try {
        const res = await fetch("/api/voices/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ voiceId: voice.id }),
        });
        const payload = await res.json();
        if (!res.ok) {
          setPreview(null);
          setPreviewError(payload.message ?? "No se pudo generar la muestra.");
          return;
        }
        promptId = payload.promptId;
      } catch {
        setPreview(null);
        setPreviewError("Se perdió la conexión con la app.");
        return;
      }

      previewPollRef.current = window.setInterval(async () => {
        const s = await fetch(`/api/status/${promptId}`)
          .then((r) => r.json())
          .catch(() => null);
        if (!s) return;

        if (s.state === "done") {
          if (previewPollRef.current) window.clearInterval(previewPollRef.current);
          previewPollRef.current = null;

          // Remember it before playing: if this fails the sample still plays,
          // it just costs the wait again next time. Losing the audio to a
          // bookkeeping error would be the worse trade.
          const saved = await fetch("/api/voices/preview", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ voiceId: voice.id, promptId }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);

          play(saved?.sampleUrl ?? s.audioUrl, voice.id);
          onVoicesChanged();
        } else if (s.state === "failed" || s.state === "finished") {
          if (previewPollRef.current) window.clearInterval(previewPollRef.current);
          previewPollRef.current = null;
          setPreview(null);
          setPreviewError(s.message ?? "El motor no pudo generar la muestra.");
        }
      }, 700);
    },
    [onVoicesChanged, play, stopPreview],
  );

  const saveProvenance = async (voice: Voice) => {
    const mode = modeOf(voice.id);
    if (mode.kind !== "editing") return;

    setMode(voice.id, { ...mode, saving: true, error: null });
    try {
      const res = await fetch("/api/voices/provenance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voiceId: voice.id,
          displayName: mode.name,
          note: mode.note,
          // The facts of registration are not the user's to rewrite: they say
          // how the audio actually arrived and when. Sending the existing
          // values back keeps an edit of the note from erasing them.
          source: voice.provenance?.source,
          registeredAt: voice.provenance?.registeredAt,
          refSeconds: voice.provenance?.refSeconds,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMode(voice.id, {
          ...mode,
          saving: false,
          error: payload?.message ?? "No se pudo guardar.",
        });
        return;
      }
      setMode(voice.id, { kind: "resting" });
      onVoicesChanged();
    } catch {
      setMode(voice.id, { ...mode, saving: false, error: "Se perdió la conexión con la app." });
    }
  };

  const removeVoice = async (voice: Voice) => {
    setDeleteError(null);
    if (preview?.id === voice.id) stopPreview();
    try {
      const res = await fetch(`/api/voices?id=${encodeURIComponent(voice.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setDeleteError(payload?.message ?? `No se pudo borrar «${voice.label}».`);
        return;
      }
      onVoicesChanged();
    } catch {
      setDeleteError("Se perdió la conexión con la app.");
    } finally {
      setMode(voice.id, { kind: "resting" });
    }
  };

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (previewPollRef.current) window.clearInterval(previewPollRef.current);
    },
    [],
  );

  // Escape closes the drawer — but never mid-work, where it would abandon a
  // running job without saying so.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, setOpen]);

  /**
   * Suggest a name from the file, so the common case needs no typing.
   * "andres_bobe_ref_v3.wav" -> "Andres Bobe Ref V3" is close enough to edit.
   */
  const nameFromFile = (filename: string) =>
    filename
      .replace(/\.[^.]+$/, "")
      .split(/[_\-.\s]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ")
      .slice(0, 60);

  const startTranscription = useCallback(
    async (file: File, source: "upload" | "microphone") => {
      setStage({ kind: "transcribing", filename: file.name, startedAt: Date.now() });

      const form = new FormData();
      form.append("audio", file);

      try {
        const res = await fetch("/api/voices/transcribe", { method: "POST", body: form });
        const payload = await res.json();

        if (!res.ok) {
          setStage({
            kind: "error",
            message: payload.message ?? "No se pudo leer el audio.",
            retryable: true,
          });
          return;
        }

        setStage({
          kind: "review",
          audioFilename: payload.audioFilename,
          text: payload.text,
          name: nameFromFile(file.name),
          note: "",
          source,
          transcribedSeconds: payload.transcribedSeconds,
          decodedSeconds: payload.decodedSeconds,
          maxSeconds: payload.maxSeconds,
        });
      } catch {
        setStage({
          kind: "error",
          message: "Se perdió la conexión con la app mientras se leía el audio.",
          retryable: true,
        });
      }
    },
    [],
  );

  const create = useCallback(async () => {
    if (stage.kind !== "review") return;
    const name = stage.name.trim();
    if (!name || !stage.text.trim()) return;

    // Held before the stage changes: once the voice exists, this clip is a
    // recording of a real person that no longer serves any purpose.
    const referenceFile = stage.audioFilename;

    setStage({ kind: "creating", name });

    let promptId: string;
    try {
      const res = await fetch("/api/voices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audioFilename: stage.audioFilename,
          refText: stage.text,
          displayName: name,
          // The same bound the transcript was produced under. Sending it back
          // rather than letting the server default is what keeps the two halves
          // of the trim contract together. See ADR-003.
          maxSeconds: stage.maxSeconds,
          // Provenance, captured at the only moment these facts are known for
          // free: how the audio arrived, and what the user wants remembered
          // about whose voice this is. See ADR-005.
          source: stage.source,
          note: stage.note,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setStage({ kind: "error", message: payload.message ?? "No se pudo crear la voz.", retryable: false });
        return;
      }
      promptId = payload.promptId;
    } catch {
      setStage({ kind: "error", message: "Se perdió la conexión con la app.", retryable: false });
      return;
    }

    pollRef.current = window.setInterval(async () => {
      const s = await fetch(`/api/status/${promptId}`)
        .then((r) => r.json())
        .catch(() => null);
      if (!s) return;

      // A registration graph ends in Qwen3SavePrompt, which writes a file and
      // returns no audio — so "finished", not "done". Waiting for "done" here
      // would wait forever.
      if (s.state === "finished" || s.state === "done") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStage({ kind: "created", name });
        onVoicesChanged();

        // The embedding exists now, so the recording it came from is personal
        // data with no remaining purpose. Best-effort on purpose: the voice is
        // already created, and a failure here must not read as a failed
        // registration. It is not awaited for the same reason.
        void fetch(`/api/voices/reference?filename=${encodeURIComponent(referenceFile)}`, {
          method: "DELETE",
        }).catch(() => {});
      } else if (s.state === "failed") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStage({ kind: "error", message: s.message ?? "El motor no pudo crear la voz.", retryable: false });
      }
    }, 700);
  }, [stage, onVoicesChanged]);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void startTranscription(file, "upload");
  };

  return (
    <>
      <aside
        aria-label="Biblioteca de voces"
        inert={!open}
        // It no longer slides in from off-screen: it sits where it belongs and
        // is clipped to nothing until it opens, then the clip grows from the
        // handle's exact position. See lib/reveal and .panel-reveal.
        style={{ clipPath: clipFor(open, revealAt) }}
        className="panel-reveal fixed left-0 top-0 z-30 h-dvh w-[380px] max-w-[86vw] border-r border-hairline bg-surface"
      >
        {/* The contents arrive after the panel. See .drawer-reveal. */}
        <div
          data-open={open}
          className="drawer-reveal drawer-reveal--left flex h-full flex-col"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-hairline px-5 py-5">
            <span className="eyebrow">Voces</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              aria-label="Cerrar biblioteca de voces"
              className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-surface-raised hover:text-ink disabled:opacity-30"
            >
              <CloseIcon />
            </button>
          </div>

          {/* The list takes what is left and scrolls on its own. `min-h-0` is
              load-bearing: without it a flex child refuses to shrink below its
              content, the column grows past the drawer, and the footer below is
              pushed off the bottom of the screen. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {voices.length === 0 ? (
              <p className="px-5 py-8 text-sm leading-relaxed text-ink-muted">
                No hay ninguna voz todavía. Sube un audio de alguien hablando y
                quedará disponible para siempre.
              </p>
            ) : (
              <ul>
                {voices.map((v) => (
                  <li key={v.id}>
                    <VoiceRow
                      voice={v}
                      active={v.id === selectedId}
                      mode={modeOf(v.id)}
                      preview={preview?.id === v.id ? preview.state : "idle"}
                      onSelect={() => onSelect(v.id)}
                      onPlay={() => void playVoice(v)}
                      onStop={stopPreview}
                      onAskDelete={() => setMode(v.id, { kind: "confirming-delete" })}
                      onCancel={() => setMode(v.id, { kind: "resting" })}
                      onConfirmDelete={() => void removeVoice(v)}
                      onEdit={() =>
                        setMode(v.id, {
                          kind: "editing",
                          name: v.provenance?.displayName ?? v.label,
                          note: v.provenance?.note ?? "",
                          saving: false,
                          error: null,
                        })
                      }
                      onChangeEdit={(patch) => {
                        const mode = modeOf(v.id);
                        if (mode.kind !== "editing") return;
                        setMode(v.id, { ...mode, ...patch });
                      }}
                      onSaveEdit={() => void saveProvenance(v)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {(deleteError || previewError) && (
              <p
                role="alert"
                className="mx-5 mt-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink"
              >
                {deleteError ?? previewError}
              </p>
            )}

            {/* The sample, mounted only while something is playing. Its presence
                IS the playing state — there is no second flag to keep in sync,
                and closing the drawer unmounts it, which is the stop. */}
            {preview?.state === "playing" && (
              <audio
                src={preview.url}
                autoPlay
                onEnded={() => setPreview(null)}
                onError={() => {
                  setPreview(null);
                  setPreviewError("El navegador no pudo reproducir la muestra.");
                }}
                className="sr-only"
              />
            )}

          </div>

          {/* Adding a voice is the way INTO this drawer, so it holds a fixed place
              at the bottom instead of drifting down as the library grows. It is
              capped rather than fixed because it is small at rest and tall while
              registering — the transcript and the two fields — and at that point
              it should be allowed to take most of the drawer and scroll itself. */}
          <div className="max-h-[58%] shrink-0 overflow-y-auto border-t border-hairline p-5">
            <RegistrationPanel
              stage={stage}
              dragging={dragging}
              setDragging={setDragging}
              fileRef={fileRef}
              onFiles={onFiles}
              onRecordedFile={(file) => void startTranscription(file, "microphone")}
              onChangeStage={setStage}
              onCreate={create}
            />
          </div>
        </div>
      </aside>
    </>
  );
}

function RegistrationPanel({
  stage,
  dragging,
  setDragging,
  fileRef,
  onFiles,
  onRecordedFile,
  onChangeStage,
  onCreate,
}: {
  stage: Stage;
  dragging: boolean;
  setDragging: (d: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | null) => void;
  onRecordedFile: (file: File) => void;
  onChangeStage: (s: Stage) => void;
  onCreate: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const reviewing = stage.kind === "review";

  // Focus the name once the draft is on screen: the transcript is usually
  // right, and the name is the field that actually needs attention.
  useEffect(() => {
    if (reviewing) nameRef.current?.focus();
  }, [reviewing]);

  if (stage.kind === "transcribing") {
    return (
      <div role="status" aria-live="polite">
        <p className="eyebrow mb-3">Escuchando</p>
        <p className="mb-2 truncate text-sm text-ink" title={stage.filename}>
          {stage.filename}
        </p>
        <Elapsed startedAt={stage.startedAt} />
      </div>
    );
  }

  if (stage.kind === "creating") {
    return (
      <div role="status" aria-live="polite">
        <p className="eyebrow mb-3">Creando la voz</p>
        <p className="text-sm leading-relaxed text-ink-muted">
          El motor está extrayendo la huella de <span className="text-ink">{stage.name}</span>.
        </p>
      </div>
    );
  }

  if (stage.kind === "created") {
    return (
      <div role="status" aria-live="polite">
        <p className="eyebrow mb-3">Lista</p>
        <p className="mb-3 text-sm leading-relaxed text-ink">
          <span className="text-accent-text">{stage.name}</span> ya está en la
          lista y se puede usar para generar.
        </p>
        {/* Said out loud: deleting something from disk should never be a
            surprise, even when it is the right thing to do. */}
        <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
          El audio de referencia ya no hace falta —la voz vive en su propia
          huella— así que se borró. Es la grabación de una persona y no tiene
          por qué quedarse ahí.
        </p>
        <button
          type="button"
          onClick={() => onChangeStage({ kind: "idle" })}
          className="rounded-full border border-hairline px-4 py-2 text-sm text-ink-muted transition-colors duration-200 hover:border-accent hover:text-accent-text"
        >
          Añadir otra
        </button>
      </div>
    );
  }

  if (stage.kind === "error") {
    return (
      <div role="alert">
        <p className="eyebrow mb-3">No se pudo</p>
        <p className="mb-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink">
          {stage.message}
        </p>
        <button
          type="button"
          onClick={() => onChangeStage({ kind: "idle" })}
          className="rounded-full border border-hairline px-4 py-2 text-sm text-ink-muted transition-colors duration-200 hover:border-accent hover:text-accent-text"
        >
          {stage.retryable ? "Probar con otro audio" : "Empezar de nuevo"}
        </button>
      </div>
    );
  }

  if (stage.kind === "review") {
    const trimmed = stage.decodedSeconds > stage.transcribedSeconds;
    const canCreate = stage.name.trim() !== "" && stage.text.trim() !== "";

    return (
      <div>
        <p className="eyebrow mb-3">Revisa lo que dice</p>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
          Corrige lo que esté mal, sobre todo los nombres propios. El motor
          aprende la voz emparejando este texto con el audio, así que un texto
          que no coincide da una voz peor.
        </p>

        <div className="field mb-2 px-4 py-3">
          <label htmlFor="ref-text" className="sr-only">
            Transcripción del audio de referencia
          </label>
          <textarea
            id="ref-text"
            value={stage.text}
            onChange={(e) => onChangeStage({ ...stage, text: e.target.value })}
            rows={6}
            className="script-area w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted"
          />
        </div>

        <p className="mb-6 font-mono text-[11px] text-ink-muted">
          {trimmed
            ? `Se usan los primeros ${stage.transcribedSeconds}s de ${Math.round(stage.decodedSeconds)}s`
            : `${stage.transcribedSeconds}s de audio`}
        </p>

        <label htmlFor="voice-name" className="eyebrow mb-3 block">
          Cómo se llama
        </label>
        <div className="field mb-6 px-4 py-3">
          <input
            id="voice-name"
            ref={nameRef}
            value={stage.name}
            maxLength={NAME_MAX}
            onChange={(e) => onChangeStage({ ...stage, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) onCreate();
            }}
            placeholder="Andrés Bobe"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>

        {/* Provenance, asked for at the only moment it is cheap to ask: the
            user is looking at this person's voice right now. It is optional
            because a blocked registration helps nobody, but it is on the main
            path because a field hidden behind a disclosure gets filled in
            never. See ADR-005. */}
        <label htmlFor="voice-note" className="eyebrow mb-3 block">
          De quién es
        </label>
        <div className="field mb-2 px-4 py-3">
          <textarea
            id="voice-note"
            value={stage.note}
            maxLength={NOTE_MAX}
            onChange={(e) => onChangeStage({ ...stage, note: e.target.value })}
            rows={2}
            placeholder="Andrés, grabado con su permiso para este proyecto."
            className="script-area w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <p className="mb-6 text-[13px] leading-relaxed text-ink-muted">
          Opcional, pero es lo único que recordará de quién es esta voz. Se
          guarda junto a ella y se puede cambiar después.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCreate}
            disabled={!canCreate}
            style={{ transitionTimingFunction: "var(--ease-ui)" }}
            className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-ink transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Crear voz
          </button>
          <button
            type="button"
            onClick={() => onChangeStage({ kind: "idle" })}
            className="text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
          >
            Descartar
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div>
      <p className="eyebrow mb-3">Añadir una voz</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        style={{
          borderColor: dragging ? "var(--accent)" : undefined,
          transitionTimingFunction: "var(--ease-ui)",
        }}
        className="field flex flex-col items-center gap-3 px-5 py-8 text-center transition-colors duration-200"
      >
        <span className="text-ink-muted">
          <WaveIcon />
        </span>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Suelta aquí un audio de alguien hablando, o
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-full border border-hairline px-4 py-2 text-sm text-ink transition-colors duration-200 hover:border-accent hover:text-accent-text"
        >
          elige un archivo
        </button>
        <p className="font-mono text-[11px] text-ink-muted">wav · mp3 · flac · ogg · m4a</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".wav,.mp3,.flac,.ogg,.m4a,audio/*"
        onChange={(e) => onFiles(e.target.files)}
        className="sr-only"
      />

      {/* The other way in: no file to hunt for, and a script to read so the
          clip is half a minute of real speech instead of "hola, probando". */}
      <VoiceRecorder onRecorded={onRecordedFile} />

      <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
        Se usan los primeros 30 segundos. Con medio minuto de alguien hablando
        con claridad basta.
      </p>
    </div>
  );
}
