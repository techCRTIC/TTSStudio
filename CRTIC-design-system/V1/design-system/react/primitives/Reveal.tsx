import { type ElementType, type ReactNode, useEffect, useRef, useState } from 'react'
import { EASE_CSS } from '../lib/easings'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface RevealProps {
  children: ReactNode
  as?: ElementType
  delay?: number // seconds
  y?: number // px translate start
  className?: string
  once?: boolean
}

// IntersectionObserver reveal. Animates transform + opacity only.
// Reduced motion => shown immediately, no movement. No window scroll listener.
export function Reveal({ children, as: Tag = 'div', delay = 0, y = 18, className, once = true }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      setShown(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true)
            if (once) io.unobserve(e.target)
          } else if (!once) {
            setShown(false)
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -10% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once, reduced])

  const translate = reduced ? 0 : y

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : `translateY(${translate}px)`,
        transition: `opacity 0.7s ${EASE_CSS.expo} ${delay}s, transform 0.7s ${EASE_CSS.expo} ${delay}s`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </Tag>
  )
}
