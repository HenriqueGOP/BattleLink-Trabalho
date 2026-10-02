import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSocket } from '../hooks/useSocket'
import { socketService } from '../services/socket'
import { useToast } from '../components/Toast'
import { audio } from '../lib/audio'
import type { ServerMessage } from '../types/protocol'
import type { GameState } from '../types/battle'
import type { ClientMessage } from '../types/protocol'

export interface BattleContextValue {
  connected: boolean
  playerId: string
  status: string
  state: GameState | null
  roomId: string | null
  teamAccepted: boolean
  opponentLeft: boolean
  connect: (name: string, token?: string) => void
  leave: () => void
  choosePokemon: (name: string) => void
  setMoves: (pokemon: string, moves: string[]) => void
  acceptTeam: () => void
  resetTeam: () => void
  attack: (move: string) => void
  terastallize: () => void
  switchTo: (pokemon: string) => void
}

const BattleContext = createContext<BattleContextValue | null>(null)

/**
 * Estado global da partida: conexão, snapshot atual e ações do protocolo.
 * Montado ACIMA das rotas para sobreviver à navegação. Nenhuma regra de jogo
 * mora aqui — o cliente só envia intenções e guarda snapshots.
 */
/** Normalização defensiva do snapshot: garante campos estruturais mínimos. */
function normalizeState(raw: GameState): GameState {
  return {
    ...raw,
    phase: raw.phase ?? 'setup',
    finishReason: raw.finishReason ?? null,
    turn: raw.turn ?? 0,
    pendingSwitch: Array.isArray(raw.pendingSwitch) ? raw.pendingSwitch : [false, false],
    log: Array.isArray(raw.log) ? raw.log : [],
    logOffset: Number.isSafeInteger(raw.logOffset) ? raw.logOffset : 0,
    events: Array.isArray(raw.events) ? raw.events : [],
    field: {
      weather: raw.field?.weather ?? null,
      terrain: raw.field?.terrain ?? null,
      background: raw.field?.background ?? null,
      hazards: raw.field?.hazards ?? [
        { stealthRock: false, spikes: 0 },
        { stealthRock: false, spikes: 0 },
      ],
    },
    players: Array.isArray(raw.players)
      ? ([raw.players[0], raw.players[1]].map((player) => ({
          ...player,
          team: Array.isArray(player?.team) ? player.team : [],
        })) as GameState['players'])
      : raw.players,
  }
}

export function BattleProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [playerId, setPlayerId] = useState('')
  const [status, setStatus] = useState('Digite seu nome para entrar na fila.')
  const [state, setState] = useState<GameState | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [opponentLeft, setOpponentLeft] = useState(false)
  const nameRef = useRef('')
  const tokenRef = useRef('')
  const attemptRef = useRef(0)
  const teamAccepted = Boolean(state?.players.find((player) => player.id === playerId)?.ready)

  const sendMessage = useCallback(
    (message: ClientMessage) => {
      if (!socketService.send(message))
        toast.toast('Sem conexão. Entre novamente para jogar.', 'error')
    },
    [toast]
  )

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'welcome':
          if (message.protocol !== 'pokemon-battle/2') {
            toast.toast('Atualize o servidor e o cliente para a mesma versão.', 'error')
            socketService.close()
            break
          }
          setPlayerId(message.playerId)
          sendMessage({
            type: 'join',
            name: nameRef.current.trim() || 'Jogador',
            ...(tokenRef.current ? { token: tokenRef.current } : {}),
          })
          break
        case 'waiting':
          setStatus(message.message)
          break
        case 'match_found':
          setRoomId(message.roomId)
          // passa pela mesma normalizacao de 'state': antes o primeiro snapshot
          // entrava cru e podia chegar sem os campos estruturais minimos
          setState(normalizeState(message.state))
          setStatus(`Partida ${message.roomId}`)
          setOpponentLeft(false)
          break
        case 'state':
          setState(normalizeState(message.state))
          setStatus(message.state.phase === 'finished' ? 'Batalha encerrada' : 'Sincronizado')
          break
        case 'error':
          audio.play('error')
          toast.toast(message.message, 'error')
          break
        case 'opponent_left':
          setOpponentLeft(true)
          setStatus(message.message)
          audio.play('error')
          toast.toast(message.message, 'error')
          break
      }
    },
    [sendMessage, toast]
  )

  const {
    connected,
    connect: openSocket,
    send,
    close,
  } = useSocket({
    onMessage: handleMessage,
    onError: () => {
      setStatus('Sem conexão com o servidor.')
    },
    onClose: () => {
      setStatus('Conexão encerrada. Entre novamente para jogar.')
      setState((current) => (current?.phase === 'finished' ? current : null))
    },
  })

  const connect = useCallback(
    (name: string, token = '') => {
      const attempt = ++attemptRef.current
      nameRef.current = name
      tokenRef.current = token.trim()
      setPlayerId('')
      setState(null)
      setRoomId(null)
      setOpponentLeft(false)
      const opening = openSocket()
      setStatus('Conectando ao servidor…')
      opening.then(
        () => {
          if (attemptRef.current !== attempt) return
          setStatus('Conectado. Procurando um oponente…')
        },
        () => {
          if (attemptRef.current !== attempt) return
          setStatus('Sem conexão.')
          audio.play('error')
          toast.toast('Não foi possível conectar. Inicie o servidor primeiro.', 'error')
        }
      )
    },
    [openSocket, toast]
  )

  const leave = useCallback(() => {
    attemptRef.current++
    send({ type: 'leave' })
    close()
    setPlayerId('')
    setState(null)
    setRoomId(null)
    setOpponentLeft(false)
    setStatus('Digite seu nome para entrar na fila.')
  }, [close, send])

  const value = useMemo<BattleContextValue>(
    () => ({
      connected,
      playerId,
      status,
      state,
      roomId,
      teamAccepted,
      opponentLeft,
      connect,
      leave,
      choosePokemon: (name) => sendMessage({ type: 'choose_pokemon', pokemon: name }),
      setMoves: (pokemon, moves) => sendMessage({ type: 'set_moves', pokemon, moves }),
      acceptTeam: () => sendMessage({ type: 'accept_team' }),
      resetTeam: () => {
        sendMessage({ type: 'reset_team' })
      },
      attack: (move) => {
        sendMessage({ type: 'action', action: { type: 'attack', move } })
      },
      terastallize: () => sendMessage({ type: 'terastallize' }),
      switchTo: (pokemon) => sendMessage({ type: 'switch_pokemon', pokemon }),
    }),
    [
      connected,
      playerId,
      status,
      state,
      roomId,
      teamAccepted,
      opponentLeft,
      connect,
      leave,
      sendMessage,
    ]
  )

  return <BattleContext.Provider value={value}>{children}</BattleContext.Provider>
}

export function useBattleContext(): BattleContextValue {
  const context = useContext(BattleContext)
  if (!context) throw new Error('useBattleContext precisa estar dentro de <BattleProvider>.')
  return context
}
