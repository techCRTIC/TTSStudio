import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost'

type ButtonAsButton = { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>
type ButtonAsAnchor = { href: string } & AnchorHTMLAttributes<HTMLAnchorElement>

type BaseProps = { children: ReactNode; variant?: Variant; className?: string }

// Pressable button/anchor. Renders <a> when `href` is given, else <button>.
// Token-driven via the `.crtic-btn` classes in css/base.css (no Tailwind required).
export function Button({ children, variant = 'primary', className = '', ...rest }: BaseProps & (ButtonAsButton | ButtonAsAnchor)) {
  const cls = `crtic-btn crtic-btn--${variant}${className ? ` ${className}` : ''}`
  if ('href' in rest && rest.href !== undefined) {
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    )
  }
  return (
    <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  )
}
