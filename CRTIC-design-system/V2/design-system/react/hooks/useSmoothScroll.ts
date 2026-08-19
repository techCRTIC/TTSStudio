import { useEffect } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger } from '../lib/gsap'
import { useReducedMotion } from './useReducedMotion'

// Lenis smooth-scroll wired to GSAP's ticker + ScrollTrigger — the sanctioned way to
// satisfy "no window scroll listener" while keeping pin/scrub smooth.
// Call ONCE at the app root. Skips entirely under prefers-reduced-motion (native scroll).
// Peer deps: lenis, gsap.
export function useSmoothScroll() {
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return

    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
    lenis.on('scroll', ScrollTrigger.update)

    const onTick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(onTick)
      lenis.destroy()
    }
  }, [reduced])
}
