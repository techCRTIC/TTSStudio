import type { CSSProperties, ReactNode } from 'react'

interface SectionProps {
  children: ReactNode
  id?: string
  className?: string
  // 'default' = snow surface; 'inverse' = dark scrim stage (for full-bleed media)
  tone?: 'default' | 'inverse'
  // wrap children in the centered max-width container (default true)
  contained?: boolean
  style?: CSSProperties
}

const PAD = 'clamp(1.5rem, 5vw, 2.5rem)'

// Consistent section shell: surface tone + centered max-width container.
export function Section({ children, id, className = '', tone = 'default', contained = true, style }: SectionProps) {
  const toneStyle: CSSProperties =
    tone === 'inverse'
      ? { backgroundColor: 'var(--surface-inverse)', color: 'var(--text-on-inverse)' }
      : { backgroundColor: 'var(--surface)', color: 'var(--text)' }

  const inner = contained ? (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingInline: PAD }}>{children}</div>
  ) : (
    children
  )

  return (
    <section id={id} className={className} style={{ ...toneStyle, paddingBlock: 'clamp(5rem, 12vw, 10rem)', ...style }}>
      {inner}
    </section>
  )
}
