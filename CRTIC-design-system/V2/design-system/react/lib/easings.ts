// Custom easings — built-in CSS easings are too weak.
// Use EASE.* for GSAP/JS, EASE_CSS.* for inline CSS transitions.
export const EASE = {
  expo: [0.16, 1, 0.3, 1] as const, // ease-out-expo (snappy reveals)
  quart: [0.25, 1, 0.5, 1] as const, // ease-out-quart (default UI)
  inExpo: [0.7, 0, 0.84, 0] as const, // exits
} as const

export const EASE_CSS = {
  expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  quart: 'cubic-bezier(0.25, 1, 0.5, 1)',
  inExpo: 'cubic-bezier(0.7, 0, 0.84, 0)',
} as const

// Durations (ms) — mirror tokens/primitives.css.
export const DURATION = {
  press: 150,
  ui: 200,
  pop: 250,
  reveal: 700,
  rise: 750,
} as const
