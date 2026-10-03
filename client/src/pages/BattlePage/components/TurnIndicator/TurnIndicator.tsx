import styles from './TurnIndicator.module.css'

export interface TurnIndicatorProps {
  myTurn: boolean
  finished: boolean
}

/** Indicador derivado do estado apresentado, sem temporizador independente. */
export function TurnIndicator({ myTurn, finished }: TurnIndicatorProps) {
  return (
    <>
      <span
        className={`${styles.chip} ${myTurn ? styles.mine : styles.theirs}`}
        role="status"
        aria-label={
          finished ? 'Batalha encerrada' : myTurn ? 'Escolha sua ação' : 'Aguardando resolução'
        }
      >
        <i aria-hidden="true" />
        {finished ? 'FIM' : myTurn ? 'ESCOLHA' : 'AGUARDANDO'}
      </span>
    </>
  )
}
