import { formatSize } from '../../../../server/src/contracts/formats'
import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Sprite } from '../Sprite'
import { useBattleContext } from '../../context/BattleProvider'
import { formatPokemonName } from '../../lib/format'
import styles from './TeamEditor.module.css'

/** One accessible editor for selection and move setup; species IDs are stable. */
export function TeamEditor({ notebookCompact = false, actions }: { notebookCompact?: boolean; actions?: ReactNode }) {
  const { state, removePokemon, reorderTeam } = useBattleContext()
  const root = useRef<HTMLElement>(null)
  if (!state) return null
  const own = state.players[state.wire.viewer === 'p1' ? 0 : 1]
  const team = own?.team ?? []
  const TEAM_SIZE = formatSize(state.wire.format)
  const locked = state.phase !== 'setup' || Boolean(own?.ready)
  function move(index: number, offset: number) {
    const order = team.map(member => member.pokemon)
    const next = index + offset
    if (next < 0 || next >= order.length) return
    ;[order[index], order[next]] = [order[next], order[index]]
    reorderTeam(order)
  }
  function remove(id: string, index: number) {
    const nextId = team[index + 1]?.pokemon ?? team[index - 1]?.pokemon
    removePokemon(id)
    requestAnimationFrame(() => {
      const next = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-remove-pokemon]') ?? []).find(button => button.dataset.removePokemon === nextId)
      ;(next ?? root.current)?.focus()
    })
  }
  return <section className={styles.editor} data-notebook-compact={notebookCompact || undefined} ref={root} tabIndex={-1} aria-label="Ordem da equipe">
    <header className={styles.header}><div className={styles.heading}><strong>Sua equipe · {team.length}/{TEAM_SIZE}</strong><span>O primeiro Pokémon inicia a batalha</span></div>{actions && <div className={styles.actions}>{actions}</div>}</header>
    <ol className={styles.slots} style={{ '--team-slots': TEAM_SIZE } as CSSProperties}>
      {Array.from({ length: TEAM_SIZE }, (_, index) => {
        const member = team[index]
        const name = member ? formatPokemonName(member.pokemon) : ''
        return <li className={styles.slot} key={member?.pokemon ?? `empty-${index}`} data-filled={Boolean(member) || undefined}>
          <span className={styles.position}>{String(index + 1).padStart(2, '0')}{index === 0 && member && <b>Inicial</b>}</span>
          {member ? <>
            <span className={styles.memberArt}><Sprite src={member.image} name={member.pokemon} size={60} /></span>
            <strong className={styles.name}>{name}</strong>
            <div className={styles.controls}>
              <button disabled={locked || index === 0} onClick={() => move(index, -1)} aria-label={`Mover ${name} antes`} title="Mover antes"><span aria-hidden="true">←</span></button>
              <button disabled={locked || index === team.length - 1} onClick={() => move(index, 1)} aria-label={`Mover ${name} depois`} title="Mover depois"><span aria-hidden="true">→</span></button>
              <button className={styles.remove} data-remove-pokemon={member.pokemon} disabled={locked} onClick={() => remove(member.pokemon, index)} aria-label={`Remover ${name} da equipe`} title="Remover"><span aria-hidden="true">×</span></button>
            </div>
          </> : <span className={styles.empty}>Livre</span>}
        </li>
      })}
    </ol>
    <span className="sr-only" role="status" aria-live="polite">{team.length ? `Ordem atual: ${team.map((member, index) => `${index + 1}, ${formatPokemonName(member.pokemon)}`).join('; ')}` : 'Nenhum Pokémon escolhido'}</span>
  </section>
}
