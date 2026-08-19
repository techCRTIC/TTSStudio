"use client";

import { useEffect, useRef, useState } from "react";

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

  // Paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const bars = peaks?.length ? peaks : Array.from({ length: Math.floor(w / (BAR_W + BAR_GAP)) }, () => 0.06);
    const mid = h / 2;
    const played = Math.floor(bars.length * progress);

    bars.forEach((p, i) => {
      const x = i * (BAR_W + BAR_GAP);
      const barH = Math.max(2, p * (h - 8));
      ctx.fillStyle = i <= played && peaks?.length ? "rgb(250,69,21)" : "rgba(154,154,160,0.34)";
      ctx.fillRect(x, mid - barH / 2, BAR_W, barH);
    });
  }, [peaks, progress]);

  // Report loudness upward so the backdrop can lift while audio plays.
  useEffect(() => {
    if (!onEnergy) return;
    if (!playing || !peaks?.length) { onEnergy(0); return; }
    const idx = Math.min(peaks.length - 1, Math.floor(peaks.length * progress));
    onEnergy(peaks[idx] ?? 0);
  }, [playing, progress, peaks, onEnergy]);

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
          onEnded={() => { setPlaying(false); setProgress(0); }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (a.duration) setProgress(a.currentTime / a.duration);
          }}
          className="hidden"
        />
      )}
    </div>
  );
}
