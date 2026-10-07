import { memo } from 'react'
import { moveTypeGlyph } from './moveTypeGlyphs'
import styles from './MoveIdentity.module.css'

export const MoveTypeIcon = memo(function MoveTypeIcon({
  type,
  size = 22,
  watermark = false,
}: {
  type: string
  size?: number
  watermark?: boolean
}) {
  return (
    <svg
      className={watermark ? styles.watermark : styles.icon}
      data-move-icon={type}
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
    >
      <path d={moveTypeGlyph(type)} />
    </svg>
  )
})
