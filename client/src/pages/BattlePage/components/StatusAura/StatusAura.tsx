import { memo, useMemo } from 'react'
import styles from './StatusAura.module.css'
import type { StatusName } from '../../../../types/player'

export interface StatusAuraProps {
  status: StatusName | null | undefined
  confused?: boolean
  side: 'me' | 'opponent'
}

let seed = 0

/**
 * Aura contínua de status ancorada AO WRAPPER do Pokémon (position:absolute
 * relativa ao holder do sprite). Aparece quando o status é aplicado e some
 * sozinha quando o snapshot deixa de ter o status (render condicional).
 * Nenhum efeito usa coordenadas de tela — tudo % relativa ao Pokémon.
 */
export const StatusAura = memo(function StatusAura({ status, confused = false, side }: StatusAuraProps) {
  const particles = useMemo(() => {
    if (!status) return []
    const count = status === 'burn' ? 4 : status === 'poison' || status === 'bad_poison' ? 4 : 0
    return Array.from({ length: count }, (_, index) => {
      seed += 1
      return {
        id: seed,
        left: 12 + ((seed * 37) % 70),
        delay: (index * 0.42) % 1.6,
        drift: side === 'me' ? 4 + (seed % 8) : -(4 + (seed % 8)),
      }
    })
  }, [status, side])

  if (!status && !confused) return null

  return (
    <span className={styles.auraLayer} aria-hidden="true">
      {(status === 'poison' || status === 'bad_poison') && (
        <>
          <span className={styles.poisonAura} />
          {particles.map(p => (
            <i
              key={p.id}
              className={styles.poisonBubble}
              style={{ left: `${p.left}%`, bottom: '18%', animationDelay: `${p.delay}s` }}
            />
          ))}
        </>
      )}
      {status === 'burn' && (
        <>
          <span className={styles.burnAura} />
          {particles.map(p => (
            <i
              key={p.id}
              className={styles.ember}
              style={{ left: `${p.left}%`, bottom: '22%', animationDelay: `${p.delay}s`, '--drift': `${p.drift}px` } as React.CSSProperties}
            />
          ))}
        </>
      )}
      {status === 'paralysis' && <span className={styles.paralysisAura} />}
      {status === 'freeze' && <span className={styles.freezeAura} />}
      {status === 'sleep' && <span className={styles.sleepZ}>Z</span>}
      {confused && <span className={styles.confusionAura}>✦</span>}
    </span>
  )
})
