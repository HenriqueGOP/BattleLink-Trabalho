import { memo } from 'react'
import { audio } from '../../../../lib/audio'
import { Sprite } from '../../../../components/Sprite'
import { STATUS_SHORT } from '../shared'
import styles from './BattleControls.module.css'
import type { Player } from '../../../../types/player'

export interface BattleControlsProps {
  player: Player | null
  myTurn: boolean
  blocked: boolean
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
  onSwitch,
}: BattleControlsProps) {
  const team = player?.team ?? []
  const canSwitch = myTurn || blocked

  return (
    <section className={styles.controls} aria-label="Equipe">
      {blocked && (
        <p className={styles.urgent} role="alert">
          Seu Pokémon caiu — escolha um substituto!
        </p>
      )}

      <div className={styles.roster} data-urgent={blocked ? 'true' : undefined}>
        {team.map(member => {
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
              disabled={!canSwitch || active || fainted}
              onClick={() => {
                audio.play('switch')
                onSwitch(member.pokemon)
              }}
              onMouseEnter={() => {
                if (canSwitch && !active && !fainted) audio.play('hover')
              }}
              aria-label={`Trocar para ${member.pokemon}, ${member.hp} de ${member.maxHp} HP`}
            >
              <span className={styles.portrait}>
                <Sprite src={member.image} name={member.pokemon} size={40} />
                {active && <i className={styles.activeFlag}>EM CAMPO</i>}
              </span>

              <span className={styles.info}>
                <span className={styles.nameRow}>
                  <b className={styles.name}>{member.pokemon}</b>
                  {member.status && <i className={`${styles.status} ${styles[member.status]}`}>{STATUS_SHORT[member.status]}</i>}
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
