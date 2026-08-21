"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The waveform of the actual generated audio, decoded from the file — not a
 * decorative stand-in. Peaks come from the real samples, so the shape is
 * evidence of what was produced.
 *
 * Doubles as the transport: click to seek, and the played portion is the one
 * carrying the accent.
 */

type Decoded = { src: string; peaks: number[]; duration: number };

const BAR_W = 3;
const BAR_GAP = 2;

export function Waveform({
  src,
  onEnergy,
}: {
  src: string | null;
  onEnergy?: (v: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Keyed by source, so a new src derives an empty shape instead of an effect
  // reaching in to reset it.
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [progress, setProgress] = useState(0);
  // The continuous position. `progress` state exists only to drive the text
  // readout, which changes once a second; the canvas follows this instead.
  const progressRef = useRef(0);
  const [playing, setPlaying] = useState(false);

  const fresh = decoded && decoded.src === src ? decoded : null;
  const peaks = fresh?.peaks ?? null;
  const duration = fresh?.duration ?? 0;

  // Decode once per source and reduce to peaks at the bar resolution.
  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    (async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const audio = await ctx.decodeAudioData(buf);
        if (cancelled) { void ctx.close(); return; }

        const width = canvasRef.current?.clientWidth ?? 720;
        const bars = Math.max(24, Math.floor(width / (BAR_W + BAR_GAP)));
        const data = audio.getChannelData(0);
        const block = Math.floor(data.length / bars);

        const out: number[] = [];
        for (let i = 0; i < bars; i++) {
          let peak = 0;
          for (let j = 0; j < block; j++) {
            const v = Math.abs(data[i * block + j]);
            if (v > peak) peak = v;
          }
          out.push(peak);
        }
        const max = Math.max(...out, 0.0001);
        setDecoded({ src, peaks: out.map((p) => p / max), duration: audio.duration });
        void ctx.close();
      } catch {
        // A file we cannot decode still plays; it just shows no shape.
        if (!cancelled) setDecoded({ src, peaks: [], duration: 0 });
      }
    })();

    return () => { cancelled = true; };
  }, [src]);

  /**
   * Repaint at `p` (0..1). Deliberately NOT driven by React state.
   *
   * The played portion has to move at sixty frames a second, and routing that
   * through setState would re-render this component that often for a value only
   * the canvas consumes. A canvas is a pixel buffer, not markup — writing to it
   * imperatively conflicts with nothing React is also rendering.
   */
  const paint = useCallback(
    (p: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const needW = Math.floor(w * dpr);
      const needH = Math.floor(h * dpr);

      // Resizing a canvas RESETS it, so it is done only when the size really
      // changed. Doing it per frame — which the previous version did, because
      // the paint was keyed on progress — threw away and rebuilt the backing
      // store sixty times a second.
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW;
        canvas.height = needH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.clearRect(0, 0, w, h);

      const mid = h / 2;
      const hasPeaks = !!peaks?.length;
      const count = hasPeaks ? peaks!.length : Math.floor(w / (BAR_W + BAR_GAP));
      const played = Math.floor(count * p);

      // No array is built here: the empty state draws flat bars from a
      // constant. Allocating per frame is what the canvas memory warns about.
      for (let i = 0; i < count; i += 1) {
        const value = hasPeaks ? peaks![i] : 0.06;
        const barH = Math.max(2, value * (h - 8));
        ctx.fillStyle = i <= played && hasPeaks ? "rgb(250,69,21)" : "rgba(154,154,160,0.34)";
        ctx.fillRect(i * (BAR_W + BAR_GAP), mid - barH / 2, BAR_W, barH);
      }
    },
    [peaks],
  );

  // Paint whenever something OTHER than playback changed it: a new shape, a
  // seek while paused, the first render.
  useEffect(() => {
    paint(progressRef.current);
  }, [paint, progress]);

  /**
   * Follow playback frame by frame.
   *
   * `timeupdate` is what this used to listen to, and browsers fire it about
   * four times a second — which is exactly what a cursor advancing in visible
   * one-second steps looks like. The element's clock is read every frame
   * instead.
   *
   * ⚠️ Reading the clock here is CORRECT, and is the documented exception to
   * [[canvas-loops-need-accumulated-time-and-zero-allocation]]. That memory says
   * to accumulate time rather than read it — true for a free-running animation,
   * wrong for a cursor tracking a medium that owns its own timeline. Accumulate
   * here and the cursor drifts away from the sound it is supposed to point at.
   * The other half of that memory — allocate nothing per frame — applies in
   * full, and `paint` honours it.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!playing || !audio) {
      onEnergy?.(0);
      return;
    }

    let frame = 0;
    let shownSecond = -1;

    const tick = () => {
      const p = audio.duration ? audio.currentTime / audio.duration : 0;
      progressRef.current = p;
      paint(p);

      if (peaks?.length && onEnergy) {
        onEnergy(peaks[Math.min(peaks.length - 1, Math.floor(peaks.length * p))] ?? 0);
      }

      // The readout only changes once a second, so React only hears about it
      // once a second. Sixty re-renders to redraw the same "0:07" is waste.
      const second = Math.floor(audio.currentTime);
      if (second !== shownSecond) {
        shownSecond = second;
        setProgress(p);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, peaks, onEnergy, paint]);

  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play(); else audio.pause();
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? "Pausar" : "Reproducir"}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline bg-surface-raised text-ink transition-colors duration-200 hover:border-accent hover:text-accent-text disabled:opacity-30"
      >
        {playing ? (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
            <rect x="0" y="0" width="4" height="14" rx="1" />
            <rect x="8" y="0" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="13" height="14" viewBox="0 0 13 14" fill="currentColor" aria-hidden="true">
            <path d="M1 1.2v11.6a1 1 0 0 0 1.53.85l9.1-5.8a1 1 0 0 0 0-1.7l-9.1-5.8A1 1 0 0 0 1 1.2Z" />
          </svg>
        )}
      </button>

      <canvas
        ref={canvasRef}
        onClick={seek}
        className={`h-16 flex-1 ${src ? "cursor-pointer" : ""}`}
        aria-hidden="true"
      />

      <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">
        {duration ? `${fmt(duration * progress)} / ${fmt(duration)}` : "--:-- / --:--"}
      </span>

      {src && (
        <audio
          ref={audioRef}
          src={src}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          // A different take starts at the beginning. Without this the cursor
          // keeps the previous one's position and paints it over the new shape
          // the moment its peaks arrive. Driven by the element rather than by
          // watching `src` in an effect: the audio knows when it has actually
          // swapped, and a handler can set state without fighting the linter.
          onLoadedMetadata={() => {
            progressRef.current = 0;
            setProgress(0);
          }}
          onEnded={() => {
            setPlaying(false);
            progressRef.current = 0;
            setProgress(0);
          }}
          onTimeUpdate={(e) => {
            // While playing, the frame loop owns this. This handler is what
            // keeps a seek visible when the audio is paused.
            if (playing) return;
            const a = e.currentTarget;
            if (!a.duration) return;
            progressRef.current = a.currentTime / a.duration;
            setProgress(progressRef.current);
          }}
          className="hidden"
        />
      )}
    </div>
  );
}
