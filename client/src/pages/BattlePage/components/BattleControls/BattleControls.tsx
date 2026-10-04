import { memo } from 'react'
import { audio } from '../../../../lib/audio'
import { Sprite } from '../../../../components/Sprite'
import { formatPokemonName } from '../../../../lib/format'
import { STATUS_SHORT } from '../shared'
import styles from './BattleControls.module.css'
import { MenuEmblem, MenuScenery } from '../../../../components/MenuArt/MenuArt'
import type { Player } from '../../../../types/player'
import type { ActionRequest } from '../../../../types/protocol'

export interface BattleControlsProps {
  player: Player | null
  myTurn: boolean
  blocked: boolean
  request: ActionRequest | null
  onSwitch: (pokemon: string) => void
}

/**
 * Tela de equipe no formato da série: um cartão por Pokémon com sprite,
 * nome, condição de status e barra de HP. O que está em campo fica marcado,
 * o nocauteado fica apagado.
 */
export const BattleControls = memo(function BattleControls({
  player,
  myTurn,
  blocked,
  request,
  onSwitch,
}: BattleControlsProps) {
  const team = player?.team ?? []
  const canSwitch = myTurn && !request?.submitted

  return (
    <section className={styles.controls} aria-label="Equipe">
      <MenuScenery menu="party" panel />
      <MenuEmblem menu="party" />
      {blocked && (
        <p className={styles.urgent} role="alert">
          {request?.kind === 'revive'
            ? 'Escolha um Pokémon para reviver!'
            : 'Escolha o próximo Pokémon!'}
        </p>
      )}

      <div className={styles.roster} data-urgent={blocked ? 'true' : undefined}>
        {team.map((member) => {
          const active = member.pokemon === player?.pokemon
          const fainted = member.hp <= 0
          const ratio = member.maxHp > 0 ? Math.max(0, member.hp / member.maxHp) : 0
          const tone = ratio > 0.5 ? styles.green : ratio > 0.2 ? styles.yellow : styles.red

          return (
            <button
              key={member.pokemon}
              className={[styles.slot, active ? styles.active : '', fainted ? styles.fainted : '']
                .filter(Boolean)
                .join(' ')}
              disabled={!canSwitch || !request?.switches.includes(member.id)}
              onClick={() => {
                audio.play('switch')
                onSwitch(member.pokemon)
              }}
              onMouseEnter={() => {
                if (canSwitch && !active && !fainted) audio.play('hover')
              }}
              aria-label={`${request?.kind === 'revive' ? 'Reviver' : 'Trocar para'} ${member.pokemon}, ${member.hp} de ${member.maxHp} HP`}
            >
              <span className={styles.portrait}>
                <Sprite src={member.image} name={member.pokemon} size={40} />
                {active && <i className={styles.activeFlag}>EM CAMPO</i>}
              </span>

              <span className={styles.info}>
                <span className={styles.nameRow}>
                  <b className={styles.name}>{formatPokemonName(member.pokemon)}</b>
                  {member.status && (
                    <i className={`${styles.status} ${styles[member.status]}`}>
                      {STATUS_SHORT[member.status]}
                    </i>
                  )}
                </span>

                <span className={styles.hpRow}>
                  <i className={styles.hpTag}>HP</i>
                  <span className={styles.track}>
                    <i className={`${styles.fill} ${tone}`} style={{ width: `${ratio * 100}%` }} />
                  </span>
                </span>

                <span className={styles.hpText}>
                  {fainted ? 'nocauteado' : `${member.hp}/${member.maxHp}`}
                </span>
              </span>
            </button>
          )
        })}
        {team.length === 0 && <p className={styles.empty}>Equipe vazia.</p>}
      </div>
    </section>
  )
})
