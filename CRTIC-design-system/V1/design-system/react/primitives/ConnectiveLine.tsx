import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface ConnectiveLineProps {
  className?: string
  // 'open' draws line then ring; 'close' draws ring then line back up
  mode?: 'open' | 'close'
}

// The accent connective thread: a vertical line that resolves into a ring.
// Drawn via stroke-dashoffset on viewport entry. Reduced motion = drawn. Stroke = --accent.
export function ConnectiveLine({ className = '', mode = 'open' }: ConnectiveLineProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [drawn, setDrawn] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      setDrawn(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setDrawn(true), { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  const lineLen = 120
  const ringLen = 2 * Math.PI * 13
  const dur = reduced ? 0 : 0.9
  const lineDelay = mode === 'open' ? 0 : 0.55
  const ringDelay = mode === 'open' ? 0.5 : 0

  return (
    <svg ref={ref} className={className} width="40" height="170" viewBox="0 0 40 170" fill="none" aria-hidden="true">
      <line
        x1="20"
        y1="6"
        x2="20"
        y2="126"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{
          strokeDasharray: lineLen,
          strokeDashoffset: drawn ? 0 : lineLen,
          transition: `stroke-dashoffset ${dur}s cubic-bezier(0.16,1,0.3,1) ${lineDelay}s`,
        }}
      />
      <circle
        cx="20"
        cy="143"
        r="13"
        stroke="var(--accent)"
        strokeWidth="1.5"
        style={{
          strokeDasharray: ringLen,
          strokeDashoffset: drawn ? 0 : ringLen,
          transition: `stroke-dashoffset ${dur}s cubic-bezier(0.16,1,0.3,1) ${ringDelay}s`,
        }}
      />
    </svg>
  )
}
