import { useMemo } from 'react'
import { useBattleContext } from '../context/BattleProvider'

export interface BattleView {
  myIndex: number
  myPlayer: import('../types/player').Player | null
  opponent: import('../types/player').Player | null
  myTurn: boolean
  blocked: boolean
  canChoose: boolean
  canSetupMoves: boolean
}

/** Derivados memoizados do snapshot: meu lado, meu turno, bloqueios e fases. */
export function useBattle(): BattleView {
  const { state, playerId, teamAccepted, connected } = useBattleContext()

  return useMemo(() => {
    const myIndex = state?.players.findIndex((player) => player.id === playerId) ?? -1
    const myPlayer = state && myIndex >= 0 ? state.players[myIndex] : null
    const opponent = state && myIndex >= 0 ? state.players[1 - myIndex] : null
    const myTurn = connected && state !== null && state.phase === 'battle' && myIndex === state.turn
    const blocked = Boolean(
      connected &&
      state?.phase === 'battle' &&
      myIndex >= 0 &&
      state.pendingSwitch[myIndex as 0 | 1]
    )
    const canChoose = Boolean(state && state.phase === 'setup' && (myPlayer?.team.length ?? 0) < 6)
    const canSetupMoves = Boolean(
      state?.phase === 'setup' && myPlayer && myPlayer.team.length === 6 && !teamAccepted
    )
    return { myIndex, myPlayer, opponent, myTurn, blocked, canChoose, canSetupMoves }
  }, [state, playerId, teamAccepted, connected])
}
