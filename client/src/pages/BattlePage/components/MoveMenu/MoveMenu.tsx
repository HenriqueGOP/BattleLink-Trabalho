import { memo } from 'react'
import type { CSSProperties } from 'react'
import { audio } from '../../../../lib/audio'
import { categoryLabel, typeLabel } from '../../../../lib/format'
import styles from './MoveMenu.module.css'
import moveIdentity from '../../../../components/MoveIdentity/MoveIdentity.module.css'
import { MenuEmblem, MenuScenery } from '../../../../components/MenuArt/MenuArt'
import type { Player } from '../../../../types/player'
import type { PokemonMove } from '../../../../types/pokemon'
import type { ActionRequest } from '../../../../types/protocol'

export interface MoveMenuProps {
  player: Player | null
  myTurn: boolean
  blocked: boolean
  request: ActionRequest | null
  onAttack: (move: string) => void
  /** Sem moldura própria: quando vive dentro da caixa de comandos. */
  bare?: boolean
  /**
   * Golpe sob o cursor/foco. Como nos jogos, os detalhes (poder, precisão,
   * efeitos, descrição) aparecem na caixa de mensagem ao lado, e não dentro do
   * quadrante — que fica compacto: nome, PP e tipo.
   */
  onPreview?: (move: PokemonMove | null) => void
}

/**
 * Menu de golpes no formato da série: grade 2×2, um golpe por quadrante,
 * cada quadrante tingido pelo tipo, com "PP atual/máximo" embaixo à esquerda
 * e o tipo embaixo à direita.
 */
export const MoveMenu = memo(function MoveMenu({
  player,
  myTurn,
  blocked,
  request,
  onAttack,
  bare = false,
  onPreview,
}: MoveMenuProps) {
  const data = player?.pokemonData
  const moves = data?.selectedMoves ?? []
  const disabled = !myTurn || blocked

  return (
    <section
      className={bare ? styles.bare : styles.menu}
      aria-label="Golpes disponíveis"
      onMouseLeave={() => onPreview?.(null)}
    >
      <MenuScenery menu="combat" panel />
      <MenuEmblem menu="combat" />
      <div className={styles.grid}>
        {moves.map((moveName) => {
          const move = data?.moves.find((item) => item.name === moveName)
          const current = data?.pp?.[moveName]
          const legal = request?.moves.find((move) => move.id === moveName)
          const total = legal?.maxPp ?? move?.pp ?? null
          const outOfPp =
            !legal ||
            legal.disabled ||
            (legal.pp <= 0 && moveName !== 'struggle' && request?.lockedMoveId !== moveName)
          const type = move?.type ?? 'normal'
          const low =
            typeof current === 'number' && total != null && current > 0 && current / total <= 0.25

          return (
            <button
              key={moveName}
              className={`${styles.move} ${moveIdentity.surface}`}
              data-move-type={type}
              style={{ '--type-color': `var(--type-${type}, var(--type-normal))`, '--move-type': `var(--type-${type}, var(--type-normal))` } as CSSProperties}
              disabled={disabled || outOfPp}
              onClick={() => {
                audio.play('select')
                onAttack(moveName)
              }}
              onMouseEnter={() => {
                onPreview?.(move ?? null)
                if (!disabled && !outOfPp) audio.play('hover')
              }}
              onFocus={() => onPreview?.(move ?? null)}
              onBlur={() => onPreview?.(null)}
            >
              <span className={styles.name}>{move?.displayName ?? moveName}</span>
              <span className={styles.stats}>
                <span>
                  Poder <b>{move?.power || '—'}</b>
                </span>
                <span>
                  Precisão <b>{move?.accuracy != null ? `${move.accuracy}%` : '—'}</b>
                </span>
                <span>{categoryLabel(move?.category ?? 'Status')}</span>
              </span>
              <span className={styles.foot}>
                <b className={low ? `${styles.pp} ${styles.ppLow}` : styles.pp}>
                  PP {current ?? '-'}/{total ?? '-'}
                </b>
                <b className={styles.type}>{typeLabel(type)}</b>
              </span>
            </button>
          )
        })}

        {/* mantém a grade 2×2 mesmo com menos de 4 golpes equipados */}
        {moves.length > 0 &&
          Array.from({ length: Math.max(0, 4 - moves.length) }, (_, index) => (
            <span key={`empty-${index}`} className={styles.slotEmpty} aria-hidden="true">
              —
            </span>
          ))}

        {moves.length === 0 && (
          <p className={styles.empty}>
            {disabled ? 'Preparando os golpes deste Pokémon…' : 'Nenhum golpe equipado.'}
          </p>
        )}
      </div>

      {disabled && (
        <p className={styles.hint}>
          {blocked
            ? 'Escolha um Pokémon em POKÉMON.'
            : request?.submitted
              ? 'Ação confirmada. Aguardando o oponente…'
              : 'Aguarde o seu turno…'}
        </p>
      )}
    </section>
  )
})
