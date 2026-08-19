"use client";

import { useEffect, useRef } from "react";

/**
 * The living audio field — the dark descendant of CRTIC clean's PlotFieldBg.
 *
 * The parent system's field plots data curves; here the same machinery plots
 * what the product actually makes. Each layer is a sum of two sine waves,
 * which is what an audio waveform is, so the backdrop is the subject rather
 * than decoration.
 *
 * Rules carried over from the parent, unchanged:
 *  - a faint hairline grid, drifting with a slow pointer parallax
 *  - curves on a monochrome orange ramp — a scale, never a second accent
 *  - dots flowing along each curve, the lead dot carrying a soft halo
 *  - decorative, so aria-hidden
 *  - prefers-reduced-motion renders ONE static frame and binds no listeners
 */

type Layer = {
  base: number; a1: number; a2: number;
  f1: number; f2: number; s1: number; s2: number;
  phase: number; depth: number; color: string; alpha: number; flow: number;
};

// The orange ramp: one hue family, varied in lightness. Not a palette.
const LAYERS: Layer[] = [
  { base: 0.34, a1: 26, a2: 10, f1: 0.0016, f2: 0.0051, s1: 0.10, s2: 0.24, phase: 0.0, depth: 10, color: "255,138,92", alpha: 0.16, flow: 34 },
  { base: 0.48, a1: 38, a2: 14, f1: 0.0011, f2: 0.0037, s1: 0.07, s2: 0.17, phase: 1.7, depth: 20, color: "250,69,21", alpha: 0.22, flow: 26 },
  { base: 0.63, a1: 30, a2: 18, f1: 0.0014, f2: 0.0044, s1: 0.13, s2: 0.21, phase: 3.1, depth: 32, color: "196,52,16", alpha: 0.18, flow: 44 },
  { base: 0.76, a1: 22, a2: 9, f1: 0.0019, f2: 0.0062, s1: 0.09, s2: 0.28, phase: 4.6, depth: 46, color: "255,90,43", alpha: 0.12, flow: 20 },
];

const GRID = "154,154,160"; // ink-2, the same hairline the parent uses
const ACCENT = "250,69,21";

export function AudioField({ energy = 0 }: { energy?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Read by the loop without re-binding it; generation lifts the field a little.
  const energyRef = useRef(energy);
  energyRef.current = energy;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0, h = 0, dpr = 1;
    const pointer = { x: 0.5, y: 0.5, ex: 0.5, ey: 0.5 };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const yAt = (l: Layer, x: number, t: number) =>
      l.base * h +
      Math.sin(x * l.f1 + t * l.s1 + l.phase) * l.a1 * (1 + energyRef.current * 0.6) +
      Math.sin(x * l.f2 + t * l.s2 + l.phase * 1.7) * l.a2 * (1 + energyRef.current);

    const drawGrid = (ox: number, oy: number) => {
      ctx.strokeStyle = `rgba(${GRID}, 0.055)`;
      ctx.lineWidth = 1;
      const step = 64;
      ctx.beginPath();
      for (let x = (ox % step) - step; x < w + step; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = (oy % step) - step; y < h + step; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    };

    const drawLayer = (l: Layer, t: number, ox: number, oy: number) => {
      const dx = (pointer.ex - 0.5) * l.depth + ox;
      const dy = (pointer.ey - 0.5) * l.depth * 0.5 + oy;

      ctx.save();
      ctx.translate(dx, dy);

      // The area under the curve, fading down — depth without a shadow.
      const grad = ctx.createLinearGradient(0, l.base * h - 60, 0, h);
      grad.addColorStop(0, `rgba(${l.color}, ${l.alpha * 0.42})`);
      grad.addColorStop(0.55, `rgba(${l.color}, ${l.alpha * 0.10})`);
      grad.addColorStop(1, `rgba(${l.color}, 0)`);

      ctx.beginPath();
      ctx.moveTo(-40, h + 40);
      for (let x = -40; x <= w + 40; x += 6) ctx.lineTo(x, yAt(l, x, t));
      ctx.lineTo(w + 40, h + 40);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      for (let x = -40; x <= w + 40; x += 6) {
        const y = yAt(l, x, t);
        if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${l.color}, ${Math.min(l.alpha + 0.22, 0.6)})`;
      ctx.lineWidth = 1.25;
      ctx.stroke();

      // Data dots flowing along the curve; the lead one carries a halo.
      const spacing = 132;
      const offset = (t * l.flow) % spacing;
      for (let i = 0, x = -offset; x <= w + 40; x += spacing, i++) {
        const y = yAt(l, x, t);
        const lead = i === 2;
        if (lead) {
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${l.color}, 0.13)`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, lead ? 2.6 : 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${l.color}, ${lead ? 0.9 : 0.42})`;
        ctx.fill();
      }
      ctx.restore();
    };

    const drawSpotlight = () => {
      const g = ctx.createRadialGradient(
        pointer.ex * w, pointer.ey * h, 0,
        pointer.ex * w, pointer.ey * h, Math.max(w, h) * 0.34,
      );
      g.addColorStop(0, `rgba(${ACCENT}, 0.05)`);
      g.addColorStop(1, `rgba(${ACCENT}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    const frame = (t: number) => {
      pointer.ex += (pointer.x - pointer.ex) * 0.05;
      pointer.ey += (pointer.y - pointer.ey) * 0.05;
      ctx.clearRect(0, 0, w, h);
      const ox = (pointer.ex - 0.5) * 14;
      const oy = (pointer.ey - 0.5) * 8;
      drawGrid(ox, oy);
      for (const l of LAYERS) drawLayer(l, t, ox, oy);
      drawSpotlight();
    };

    const loop = () => {
      frame(performance.now() / 1000);
      raf = requestAnimationFrame(loop);
    };

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX / window.innerWidth;
      pointer.y = e.clientY / window.innerHeight;
    };

    resize();

    if (reduce) {
      // One static frame, no listeners, no loop.
      frame(0);
      const onResize = () => { resize(); frame(0); };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer);
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
    />
  );
}
