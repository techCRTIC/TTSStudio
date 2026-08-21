"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Voice } from "./VoiceSelect";
import { VoiceRecorder } from "./VoiceRecorder";

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
 */

type Stage =
  | { kind: "idle" }
  | { kind: "transcribing"; filename: string; startedAt: number }
  | {
      kind: "review";
      audioFilename: string;
      text: string;
      name: string;
      transcribedSeconds: number;
      decodedSeconds: number;
      maxSeconds: number;
    }
  | { kind: "creating"; name: string }
  | { kind: "created"; name: string }
  | { kind: "error"; message: string; retryable: boolean };

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
  confirming,
  onSelect,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  voice: Voice;
  active: boolean;
  confirming: boolean;
  onSelect: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="border-b border-hairline px-5 py-4">
        <p className="mb-3 text-[13px] leading-relaxed text-ink">
          ¿Borrar <span className="text-accent-text">{voice.label}</span>? No se
          puede recuperar sin el audio original.
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
      className="group flex items-center border-b border-hairline transition-colors duration-200 hover:bg-surface-raised"
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 px-5 py-4 text-left"
      >
        <span className={active ? "text-accent-text" : "text-ink-muted"}>
          <WaveIcon />
        </span>
        <span className="text-sm text-ink">{voice.label}</span>
        {active && (
          <span className="ml-auto font-mono text-[11px] text-ink-muted">en uso</span>
        )}
      </button>
      <button
        type="button"
        onClick={onAskDelete}
        aria-label={`Borrar la voz ${voice.label}`}
        className="mr-3 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted opacity-0 transition-opacity duration-200 hover:text-accent-text focus-visible:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon />
      </button>
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
}: {
  voices: Voice[];
  selectedId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoicesChanged: () => void;
  onSelect: (id: string) => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  // Which row is asking "are you sure?". Confirmation happens in place rather
  // than through window.confirm: this surface replaced the native select to
  // keep the OS's chrome out, and a browser modal is the same borrowed chrome.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const removeVoice = async (voice: Voice) => {
    setDeleteError(null);
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
      setConfirmingDelete(null);
    }
  };

  const busy = stage.kind === "transcribing" || stage.kind === "creating";

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  // Escape closes the drawer — but never mid-work, where it would abandon a
  // running job without saying so.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && !busy) onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onOpenChange]);

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

  const startTranscription = useCallback(async (file: File) => {
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
  }, []);

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
    if (file) void startTranscription(file);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="fixed left-0 top-1/2 z-20 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-hairline bg-surface px-3 py-7 text-ink-muted transition-colors duration-200 hover:text-accent-text"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] [writing-mode:vertical-rl] rotate-180">
          Voces{voices.length > 0 ? " · " + voices.length : ""}
        </span>
      </button>

      <aside
        aria-label="Biblioteca de voces"
        inert={!open}
        style={{
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transitionDuration: "var(--dur-glide)",
          transitionTimingFunction: "var(--ease-wave)",
        }}
        className="fixed left-0 top-0 z-30 flex h-dvh w-[400px] max-w-[88vw] flex-col border-r border-hairline bg-surface transition-transform"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-5">
          <span className="eyebrow">Voces</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            aria-label="Cerrar biblioteca de voces"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-surface-raised hover:text-ink disabled:opacity-30"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
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
                    confirming={confirmingDelete === v.id}
                    onSelect={() => onSelect(v.id)}
                    onAskDelete={() => setConfirmingDelete(v.id)}
                    onCancelDelete={() => setConfirmingDelete(null)}
                    onConfirmDelete={() => void removeVoice(v)}
                  />
                </li>
              ))}
            </ul>
          )}

          {deleteError && (
            <p
              role="alert"
              className="mx-5 mt-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink"
            >
              {deleteError}
            </p>
          )}

          <div className="border-t border-hairline p-5">
            <RegistrationPanel
              stage={stage}
              dragging={dragging}
              setDragging={setDragging}
              fileRef={fileRef}
              onFiles={onFiles}
              onRecordedFile={(file) => void startTranscription(file)}
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
            onChange={(e) => onChangeStage({ ...stage, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) onCreate();
            }}
            placeholder="Andrés Bobe"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>

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
