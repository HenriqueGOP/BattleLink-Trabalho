import { trainerById } from '../../../../../../server/src/contracts/trainers'
import { TrainerSprite } from '../../../../components/TrainerArt/TrainerArt'
import { MenuScenery, MenuEmblem } from '../../../../components/MenuArt/MenuArt'
import { useEffect, useId, useRef, useState } from 'react'
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
  onRematch: (keepTeam: boolean) => void
}

/** Cobertura de fim de partida: vitoria, derrota, empate ou saida do oponente. */
export function EndOverlay({ state, myId, totals, opponentLeft, onLeave, onRematch }: EndOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const detailId = useId()
  useModalDialog(dialogRef, true)
  const trainer = state.wire.trainerId ? trainerById(state.wire.trainerId) : undefined
  const mine = state.wire.viewer === 'p1' ? 0 : 1
  const rematch = state.wire.rematch
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    if (!rematch.available || !rematch.expiresAt) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [rematch.available, rematch.expiresAt])
  const seconds = rematch.expiresAt ? Math.max(0, Math.ceil((rematch.expiresAt - clock) / 1000)) : 0
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
        <MenuScenery menu="result" panel />
        <MenuEmblem menu="result" />
        {trainer && <><TrainerSprite id={trainer.id} pose={result === 'victory' ? 'defeated' : result === 'defeat' ? 'celebrate' : 'idle'} /><p>{trainer.farewell}</p></>}
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
        {!opponentLeft && rematch.available && seconds > 0 && !rematch.votes[mine] && <div className={styles.rematch}><p>Revanche disponível · {seconds} s. Como deseja jogar?</p><Button onClick={() => onRematch(true)}>Revanche com minha equipe</Button><Button variant="ghost" onClick={() => onRematch(false)}>Revanche montando outra equipe</Button></div>}
        {rematch.available && rematch.votes[mine] && <p role="status">Revanche aceita. Aguardando o adversário…</p>}
        <Button size="lg" onClick={onLeave}>
          Voltar ao lobby
        </Button>
      </div>
    </dialog>
  )
}
