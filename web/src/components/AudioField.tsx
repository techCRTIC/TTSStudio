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

const STEP = 10;      // px between curve samples — these curves are smooth enough
const MARGIN = 48;    // overdraw so the parallax never exposes an edge

export function AudioField({ energy = 0 }: { energy?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Read by the loop without re-binding it; playback lifts the field a little.
  // Written in an effect rather than during render: a render must not mutate
  // anything outside itself.
  const energyRef = useRef(energy);
  useEffect(() => {
    energyRef.current = energy;
  }, [energy]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let w = 0, h = 0;
    const pointer = { x: 0.5, y: 0.5, ex: 0.5, ey: 0.5 };

    /**
     * Animation time is ACCUMULATED, never read from the clock.
     *
     * Reading performance.now() directly looks correct until the loop pauses —
     * on a hidden tab, or whenever the browser throttles rAF. The clock keeps
     * running while the field does not, so the first frame after resuming jumps
     * to where the animation "should" be. That reads exactly like the backdrop
     * freezing and then snapping, which is what it was doing.
     */
    let clock = 0;
    let last = 0;

    // Gradients depend only on height and the layer, so they are built once per
    // resize instead of four times per frame.
    let fills: CanvasGradient[] = [];

    const buildFills = () => {
      fills = LAYERS.map((l) => {
        const g = ctx.createLinearGradient(0, l.base * h - 60, 0, h);
        g.addColorStop(0, `rgba(${l.color}, ${l.alpha * 0.42})`);
        g.addColorStop(0.55, `rgba(${l.color}, ${l.alpha * 0.10})`);
        g.addColorStop(1, `rgba(${l.color}, 0)`);
        return g;
      });
    };

    const resize = () => {
      // Capped at 1.5 rather than 2: this is a soft, low-contrast field, the
      // difference is invisible, and the fill cost scales with the square.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildFills();
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

    const drawLayer = (l: Layer, i: number, t: number, ox: number, oy: number) => {
      ctx.save();
      ctx.translate((pointer.ex - 0.5) * l.depth + ox, (pointer.ey - 0.5) * l.depth * 0.5 + oy);

      // Sample the curve ONCE and reuse the points for the fill and the stroke.
      // Walking it twice was doing the same trigonometry twice per frame.
      const pts: number[] = [];
      for (let x = -MARGIN; x <= w + MARGIN; x += STEP) pts.push(x, yAt(l, x, t));

      ctx.beginPath();
      ctx.moveTo(-MARGIN, h + MARGIN);
      for (let p = 0; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1]);
      ctx.lineTo(w + MARGIN, h + MARGIN);
      ctx.closePath();
      ctx.fillStyle = fills[i];
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1]);
      ctx.strokeStyle = `rgba(${l.color}, ${Math.min(l.alpha + 0.22, 0.6)})`;
      ctx.lineWidth = 1.25;
      ctx.stroke();

      // Data dots flowing along the curve; the lead one carries a halo.
      const spacing = 132;
      const offset = (t * l.flow) % spacing;
      for (let k = 0, x = -offset; x <= w + MARGIN; x += spacing, k++) {
        const y = yAt(l, x, t);
        const lead = k === 2;
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
      // The gradient reaches zero at `r`, so filling the whole canvas was
      // compositing a full screen of transparent pixels every frame for nothing.
      const r = Math.max(w, h) * 0.34;
      const cx = pointer.ex * w;
      const cy = pointer.ey * h;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${ACCENT}, 0.05)`);
      g.addColorStop(1, `rgba(${ACCENT}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    };

    const frame = (t: number) => {
      pointer.ex += (pointer.x - pointer.ex) * 0.05;
      pointer.ey += (pointer.y - pointer.ey) * 0.05;
      ctx.clearRect(0, 0, w, h);
      const ox = (pointer.ex - 0.5) * 14;
      const oy = (pointer.ey - 0.5) * 8;
      drawGrid(ox, oy);
      LAYERS.forEach((l, i) => drawLayer(l, i, t, ox, oy));
      drawSpotlight();
    };

    const loop = (now: number) => {
      // A capped delta: after a pause, a throttle, or a slow frame, time moves
      // by one ordinary step instead of leaping.
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      clock += delta;
      frame(clock);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf) return;
      last = 0; // the next frame contributes no delta, so nothing jumps
      raf = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
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

    /**
     * Pausing while the tab is hidden matters more here than it usually would:
     * the same GPU is running Qwen3-TTS inference, and a backdrop nobody is
     * looking at should not compete with the generation the user is waiting on.
     */
    const onVisibility = () => (document.hidden ? stop() : start());

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer);
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
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
