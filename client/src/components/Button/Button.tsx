import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { audio } from '../../lib/audio'
import styles from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'fight' | 'bag' | 'party' | 'run'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      className={classes}
      onClick={event => {
        if (!rest.disabled) audio.play('click')
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
