import type { SVGProps } from 'react'

export type GameIconName = 'dice' | 'check' | 'arrow' | 'ball'

/** Ícones originais locais: decoração sem nome duplicado para leitores de tela. */
export function GameIcon({
  name,
  size = 22,
  ...props
}: SVGProps<SVGSVGElement> & { name: GameIconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {name === 'dice' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="8" cy="8" r="1" fill="currentColor" />
          <circle cx="16" cy="8" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="8" cy="16" r="1" fill="currentColor" />
          <circle cx="16" cy="16" r="1" fill="currentColor" />
        </>
      )}
      {name === 'check' && <path d="m5 12 4 4 10-10" />}
      {name === 'arrow' && <path d="M4 12h16m-6-6 6 6-6 6" />}
      {name === 'ball' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h6m6 0h6" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}
