import type { ElementType, ReactNode } from 'react'

interface EyebrowProps {
  children: ReactNode
  as?: ElementType
  className?: string
}

// Mono uppercase kicker. Uses the `.eyebrow` class from css/base.css.
export function Eyebrow({ children, as: Tag = 'p', className = '' }: EyebrowProps) {
  return <Tag className={`eyebrow${className ? ` ${className}` : ''}`}>{children}</Tag>
}
