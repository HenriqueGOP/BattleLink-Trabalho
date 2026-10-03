import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSocket } from '../hooks/useSocket'
import { socketService } from '../services/socket'
import { useToast } from '../components/Toast'
import { audio } from '../lib/audio'
import { catalog } from '../lib/catalog'
import { presentSnapshot } from '../lib/battleView'
import { preloadBattle } from '../lib/preloadBattle'
import { PROTOCOL_VERSION } from '../types/protocol'
import type { BattleChoice, ClientMessage, RoomSnapshot, ServerMessage } from '../types/protocol'
import type { GameState } from '../types/battle'

export interface BattleContextValue {
  connected: boolean
  playerId: string
  status: string
  state: GameState | null
  roomId: string | null
  teamAccepted: boolean
  opponentLeft: boolean
  actionPending: boolean
  connect: (name: string, token?: string) => void
  leave: () => void
  choosePokemon: (name: string) => void
  randomTeam: (count: number) => void
  setMoves: (pokemon: string, moves: string[]) => void
  acceptTeam: () => void
  resetTeam: () => void
  attack: (move: string) => void
  switchTo: (pokemon: string) => void
}
const BattleContext = createContext<BattleContextValue | null>(null)
type Action = Extract<ClientMessage, { type: 'action' }>

/** Snapshot autoritativo separado do modelo de apresentação e das intenções locais. */
export function BattleProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [playerId, setPlayerId] = useState('')
  const [status, setStatus] = useState('Digite seu nome para entrar na fila.')
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const [opponentLeft, setOpponentLeft] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const pending = useRef<Action | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameRef = useRef(''),
    tokenRef = useRef(''),
    attemptRef = useRef(0)
  const updateSnapshot = useCallback((next: RoomSnapshot | null) => {
    snapshotRef.current = next
    setSnapshot(next)
  }, [])
  const clearAction = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
    retryTimer.current = null
    pending.current = null
    setActionPending(false)
  }, [])
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
          if (message.protocol !== PROTOCOL_VERSION || message.catalogVersion !== catalog.version) {
            toast.toast('Atualize o servidor e o cliente para a mesma versão.', 'error')
            socketService.close()
            break
          }
          setPlayerId(message.playerId)
          sendMessage({
            type: 'join',
            name: nameRef.current.trim() || 'Jogador',
            protocol: PROTOCOL_VERSION,
            catalogVersion: catalog.version,
            ...(tokenRef.current ? { token: tokenRef.current } : {}),
          })
          break
        case 'waiting':
          setStatus(message.message)
          break
        case 'match_found':
          clearAction()
          updateSnapshot(message.state)
          setOpponentLeft(false)
          setStatus(`Partida ${message.roomId}`)
          break
        case 'state': {
          const previous = snapshotRef.current
          if (
            !previous ||
            previous.roomId !== message.state.roomId ||
            message.state.sequence < previous.sequence
          )
            break
          const request = message.state.battle?.request
          if (
            pending.current &&
            (!request || request.id !== pending.current.requestId || request.submitted)
          )
            clearAction()
          updateSnapshot(message.state)
          setStatus(
            message.state.phase === 'finished'
              ? 'Batalha encerrada'
              : message.state.phase === 'preparing'
                ? 'Preparando recursos locais…'
                : 'Sincronizado'
          )
          break
        }
        // A confirmação do snapshot libera os controles. O ACK sozinho não pode
        // reabrir a escolha enquanto a solicitação antiga ainda está na tela.
        case 'action_ack':
          break
        case 'error':
          if (message.actionId === pending.current?.actionId) {
            clearAction()
            sendMessage({ type: 'resync' })
          }
          audio.play('error')
          toast.toast(message.message, 'error')
          break
        case 'opponent_left':
          clearAction()
          setOpponentLeft(true)
          setStatus(message.message)
          toast.toast(message.message, 'error')
          break
      }
    },
    [clearAction, sendMessage, toast, updateSnapshot]
  )

  const {
    connected,
    connect: openSocket,
    send,
    close,
  } = useSocket({
    onMessage: handleMessage,
    onError: () => setStatus('Sem conexão com o servidor.'),
    onClose: () => {
      clearAction()
      setStatus('Conexão encerrada. Entre novamente para jogar.')
      if (snapshotRef.current?.phase !== 'finished') updateSnapshot(null)
    },
  })
  const connect = useCallback(
    (name: string, token = '') => {
      const attempt = ++attemptRef.current
      nameRef.current = name
      tokenRef.current = token.trim()
      clearAction()
      setPlayerId('')
      updateSnapshot(null)
      setOpponentLeft(false)
      setStatus('Conectando ao servidor…')
      void openSocket().catch(() => {
        if (attemptRef.current !== attempt) return
        setStatus('Sem conexão.')
        toast.toast('Não foi possível conectar. Inicie o servidor primeiro.', 'error')
      })
    },
    [clearAction, openSocket, toast, updateSnapshot]
  )
  const leave = useCallback(() => {
    attemptRef.current++
    clearAction()
    send({ type: 'leave' })
    close()
    setPlayerId('')
    updateSnapshot(null)
    setOpponentLeft(false)
    setStatus('Digite seu nome para entrar na fila.')
  }, [clearAction, close, send, updateSnapshot])

  const chooseAction = useCallback(
    (choice: BattleChoice) => {
      const current = snapshotRef.current,
        request = current?.battle?.request
      if (current?.phase !== 'battle' || !request || request.submitted || pending.current) return
      const message: Action = {
        type: 'action',
        requestId: request.id,
        actionId: crypto.randomUUID(),
        choice,
      }
      pending.current = message
      setActionPending(true)
      let attempts = 0
      const deliver = () => {
        if (pending.current !== message) return
        if (attempts++ >= 3) {
          clearAction()
          sendMessage({ type: 'resync' })
          toast.toast('Atualizando a confirmação da ação…', 'info')
          return
        }
        if (!socketService.send(message)) {
          clearAction()
          return
        }
        retryTimer.current = setTimeout(deliver, 1500)
      }
      deliver()
    },
    [clearAction, sendMessage, toast]
  )

  const preparationId = snapshot?.preparation?.id
  useEffect(() => {
    const current = snapshotRef.current
    if (!preparationId || !current || current.preparation?.ready) return
    const controller = new AbortController()
    void preloadBattle(current, controller.signal).then(() => {
      if (!controller.signal.aborted && snapshotRef.current?.preparation?.id === preparationId)
        sendMessage({ type: 'battle_ready', preparationId })
    })
    return () => controller.abort()
  }, [preparationId, sendMessage])
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      pending.current = null
    },
    []
  )

  const state = useMemo(() => (snapshot ? presentSnapshot(snapshot) : null), [snapshot])
  const value = useMemo<BattleContextValue>(
    () => ({
      connected,
      playerId,
      status,
      state,
      roomId: snapshot?.roomId ?? null,
      teamAccepted: snapshot?.players[snapshot.viewer === 'p1' ? 0 : 1].ready ?? false,
      opponentLeft,
      actionPending,
      connect,
      leave,
      choosePokemon: (pokemon) => sendMessage({ type: 'choose_pokemon', pokemon }),
      randomTeam: (count) => sendMessage({ type: 'random_team', count }),
      setMoves: (pokemon, moves) => sendMessage({ type: 'set_moves', pokemon, moves }),
      acceptTeam: () => sendMessage({ type: 'accept_team' }),
      resetTeam: () => sendMessage({ type: 'reset_team' }),
      attack: (moveId) => chooseAction({ type: 'move', moveId }),
      switchTo: (speciesId) => {
        const member = snapshotRef.current?.team.find((member) => member.speciesId === speciesId)
        if (member) chooseAction({ type: 'switch', combatantId: member.id })
      },
    }),
    [
      connected,
      playerId,
      status,
      state,
      snapshot,
      opponentLeft,
      actionPending,
      connect,
      leave,
      sendMessage,
      chooseAction,
    ]
  )
  return <BattleContext.Provider value={value}>{children}</BattleContext.Provider>
}
export function useBattleContext(): BattleContextValue {
  const context = useContext(BattleContext)
  if (!context) throw new Error('useBattleContext precisa estar dentro de <BattleProvider>.')
  return context
}
