import { useId, useRef } from 'react'
import { Button } from '../../../../components/Button'
import { useModalDialog } from '../../../../hooks/useModalDialog'
import styles from './EndOverlay.module.css'
import type { GameState } from '../../../../types/battle'
import type { DamageTotals } from '../../../../hooks/useBattleEvents'

export interface EndOverlayProps {
  state: GameState
  myId: string
  totals: DamageTotals
  opponentLeft: boolean
  onLeave: () => void
}

/** Cobertura de fim de partida: vitoria, derrota, empate ou saida do oponente. */
export function EndOverlay({ state, myId, totals, opponentLeft, onLeave }: EndOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const detailId = useId()
  useModalDialog(dialogRef, true)
  const winner = state.winner
  const result =
    winner === myId
      ? 'victory'
      : winner
        ? 'defeat'
        : opponentLeft ||
            state.finishReason === 'engine_error' ||
            state.finishReason === 'preparation_timeout'
          ? 'interrupted'
          : 'draw'
  const title =
    result === 'victory'
      ? state.finishReason === 'disconnect'
        ? 'VITÓRIA POR DESISTÊNCIA!'
        : 'VOCÊ VENCEU!'
      : result === 'defeat'
        ? 'VOCÊ FOI DERROTADO…'
        : result === 'interrupted'
          ? 'PARTIDA INTERROMPIDA'
          : 'EMPATE!'
  const detail =
    state.finishReason === 'engine_error'
      ? 'Não foi possível concluir a partida. Volte ao lobby para tentar novamente.'
      : state.finishReason === 'preparation_timeout'
        ? 'O tempo de preparação terminou antes de os dois jogadores ficarem prontos.'
        : result === 'defeat' && winner
          ? `${state.players.find((player) => player.id === winner)?.name ?? 'O oponente'} venceu a batalha.`
          : result === 'interrupted'
            ? 'O oponente desconectou da partida.'
            : result === 'victory'
              ? state.finishReason === 'disconnect'
                ? 'O oponente desconectou. A partida foi encerrada.'
                : 'A arena é sua, treinador!'
              : 'Nenhum lado prevaleceu.'

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.overlay} ${styles[result]}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={detailId}
      onCancel={(event) => {
        event.preventDefault()
        onLeave()
      }}
    >
      <div className={styles.card}>
        <span className={styles.ball} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p id={detailId} className={styles.detail}>
          {detail}
        </p>
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Dano causado</dt>
            <dd>{totals.dealt}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Dano recebido</dt>
            <dd>{totals.received}</dd>
          </div>
        </dl>
        <Button size="lg" onClick={onLeave}>
          Voltar ao lobby
        </Button>
      </div>
    </dialog>
  )
}
