"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  blobToWav,
  closeMicrophone,
  HARD_LIMIT_SECONDS,
  MicrophoneError,
  openMicrophone,
  recordingFile,
  SCRIPTS,
  USED_SECONDS,
  type Recording,
} from "@/lib/recording";

/**
 * Recording a reference clip, with something to read.
 *
 * The script is the point, not decoration. Handed a bare record button, a
 * person says "hola, probando, uno dos tres" and stops — which is four seconds
 * of unrepresentative audio, and the voice cloned from it sounds like someone
 * testing a microphone. A prepared paragraph produces half a minute of ordinary
 * speech with real intonation, which is what the engine actually needs.
 *
 * It also makes the transcript nearly free: the reader is saying a text we
 * already know, so the ASR draft afterwards has almost nothing to get wrong.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "recording"; startedAt: number }
  | { kind: "encoding" }
  | { kind: "review"; recording: Recording }
  | { kind: "error"; message: string; fatal: boolean };

function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.6" y="1.4" width="4.8" height="8" rx="2.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3.3 7.2a4.7 4.7 0 0 0 9.4 0M8 11.9v2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.6" fill="currentColor" />
    </svg>
  );
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The elapsed clock, plus how far through the used window we are.
 *
 * The bar is real: it measures time against a bound that genuinely exists
 * (the engine's 30 s). It is not a progress guess — the distinction this
 * project keeps insisting on.
 */
function RecordingClock({ startedAt, onLimit }: { startedAt: number; onLimit: () => void }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= HARD_LIMIT_SECONDS) onLimit();
    }, 250);
    return () => window.clearInterval(id);
  }, [startedAt, onLimit]);

  const filled = Math.min(1, seconds / USED_SECONDS);
  const enough = seconds >= USED_SECONDS;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm text-ink">{formatClock(seconds)}</span>
        <span className="text-[12px] text-ink-muted">
          {enough ? "Ya hay de sobra" : `Se usan los primeros ${USED_SECONDS}s`}
        </span>
      </div>
      <div
        className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-hairline"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={USED_SECONDS}
        aria-valuenow={Math.min(seconds, USED_SECONDS)}
        aria-label="Segundos grabados de los que se usan"
      >
        {/* scaleX rather than width: this bar moves every 250ms while
            recording, and animating a layout property at that cadence is
            thrash for nothing. The two documented width/height exceptions in
            this project exist where no equivalent transform was available —
            here there is one, so it is used. */}
        <div
          className="h-full w-full origin-left rounded-full bg-accent"
          style={{
            transform: `scaleX(${filled})`,
            transition: "transform 250ms linear",
          }}
        />
      </div>
    </div>
  );
}

export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  /** Hands the finished clip to the same path a picked file takes. */
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [scriptIndex, setScriptIndex] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // The object URL of whatever is on screen, so it can be revoked without
  // reading it back out of state during cleanup.
  const urlRef = useRef<string | null>(null);

  const releaseUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  // Leaving with the microphone open would keep the recording indicator lit.
  useEffect(
    () => () => {
      closeMicrophone(streamRef.current);
      releaseUrl();
    },
    [],
  );

  const stop = useCallback(() => {
    // Guarded: the hard-limit timer and the button can both land here, and
    // stopping an already-stopped recorder throws.
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setPhase({ kind: "opening" });
    releaseUrl();

    let stream: MediaStream;
    try {
      stream = await openMicrophone();
    } catch (cause) {
      const error = cause as MicrophoneError;
      setPhase({
        kind: "error",
        message: error.message,
        fatal: error instanceof MicrophoneError ? error.denied : false,
      });
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      closeMicrophone(streamRef.current);
      streamRef.current = null;
      setPhase({ kind: "encoding" });
      try {
        const recording = await blobToWav(new Blob(chunksRef.current));
        urlRef.current = recording.url;
        setPhase({ kind: "review", recording });
      } catch {
        setPhase({
          kind: "error",
          message: "No se pudo procesar la grabación. Prueba otra vez.",
          fatal: false,
        });
      }
    };

    recorder.start();
    setPhase({ kind: "recording", startedAt: Date.now() });
  }, []);

  const discard = () => {
    releaseUrl();
    setPhase({ kind: "idle" });
  };

  const script = SCRIPTS[scriptIndex];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => {
          if (open && phase.kind === "recording") return;
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-hairline py-2.5 text-sm text-ink transition-colors duration-200 hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-35"
      >
        <MicIcon />
        Grabar con el micrófono
      </button>

      <div
        className="grid"
        inert={!open}
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transitionProperty: "grid-template-rows, opacity",
          transitionDuration: "var(--dur-glide)",
          transitionTimingFunction: "var(--ease-wave)",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="mt-4">
            {phase.kind === "error" && (
              <div role="alert" className="mb-4">
                <p className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink">
                  {phase.message}
                </p>
                {!phase.fatal && (
                  <button
                    type="button"
                    onClick={() => setPhase({ kind: "idle" })}
                    className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm text-ink-muted transition-colors duration-200 hover:border-accent hover:text-accent-text"
                  >
                    Probar otra vez
                  </button>
                )}
              </div>
            )}

            {phase.kind === "review" ? (
              <div>
                <p className="eyebrow mb-3">Escúchalo antes de seguir</p>
                <audio
                  src={phase.recording.url}
                  controls
                  className="mb-4 w-full"
                  aria-label="La grabación que acabas de hacer"
                />
                <p className="mb-4 font-mono text-[11px] text-ink-muted">
                  {phase.recording.seconds.toFixed(1)}s grabados
                  {phase.recording.seconds < USED_SECONDS
                    ? ` · menos de ${USED_SECONDS}s: se usará todo`
                    : ` · se usan los primeros ${USED_SECONDS}s`}
                </p>

                {phase.recording.seconds < 8 && (
                  <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
                    Es una grabación muy corta. Con tan poco audio la voz sale
                    pobre; lee el guión completo si puedes.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onRecorded(recordingFile(phase.recording));
                      // The upload owns the bytes now; the preview url does not
                      // survive this component collapsing.
                      releaseUrl();
                      setOpen(false);
                      setPhase({ kind: "idle" });
                    }}
                    style={{ transitionTimingFunction: "var(--ease-ui)" }}
                    className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-ink transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.97]"
                  >
                    Usar esta grabación
                  </button>
                  <button
                    type="button"
                    onClick={() => void start()}
                    className="rounded-full border border-hairline px-4 py-2 text-sm text-ink-muted transition-colors duration-200 hover:border-accent hover:text-accent-text"
                  >
                    Repetir
                  </button>
                  <button
                    type="button"
                    onClick={discard}
                    className="text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="eyebrow">Lee esto en voz alta</p>
                  {phase.kind !== "recording" && (
                    <button
                      type="button"
                      onClick={() => setScriptIndex((i) => (i + 1) % SCRIPTS.length)}
                      className="text-[12px] text-ink-muted transition-colors duration-200 hover:text-accent-text"
                    >
                      Otro guión
                    </button>
                  )}
                </div>

                <p className="mb-2 text-[12px] text-ink-muted">{script.tone}</p>

                <div className="field mb-4 px-4 py-4">
                  <p className="text-[15px] leading-[1.7] text-ink">{script.text}</p>
                </div>

                <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
                  Lee a tu ritmo normal, sin actuar. El tono con el que leas es
                  el que va a tener la voz clonada.
                </p>

                {phase.kind === "recording" ? (
                  <div>
                    <div className="mb-4">
                      <RecordingClock startedAt={phase.startedAt} onLimit={stop} />
                    </div>
                    <button
                      type="button"
                      onClick={stop}
                      className="flex items-center gap-2 rounded-full border border-accent px-5 py-2.5 text-sm text-accent-text transition-colors duration-200 hover:bg-accent hover:text-accent-ink"
                    >
                      <StopIcon />
                      Terminar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void start()}
                    disabled={phase.kind === "opening" || phase.kind === "encoding"}
                    style={{ transitionTimingFunction: "var(--ease-ui)" }}
                    className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-ink transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <MicIcon />
                    {phase.kind === "opening"
                      ? "Pidiendo permiso…"
                      : phase.kind === "encoding"
                        ? "Preparando…"
                        : "Empezar a grabar"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
