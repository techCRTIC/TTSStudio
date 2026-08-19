// CRTIC Design System — React barrel.
// Peer deps: react. Motion/scroll primitives also need gsap, @gsap/react, lenis.
// Remember to import the CSS once in your app:
//   import 'crtic-design-system/tokens/index.css'
//   import 'crtic-design-system/css/base.css'

export { Button } from './primitives/Button'
export { Reveal } from './primitives/Reveal'
export { ConnectiveLine } from './primitives/ConnectiveLine'
export { Eyebrow } from './primitives/Eyebrow'
export { Section } from './primitives/Section'

export { useReducedMotion } from './hooks/useReducedMotion'
export { useSmoothScroll } from './hooks/useSmoothScroll'

export { EASE, EASE_CSS, DURATION } from './lib/easings'
export { gsap, ScrollTrigger } from './lib/gsap'
