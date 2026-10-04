import type { FormatChoice } from "../../../server/src/contracts/formats";
import type { Difficulty } from "../../../server/src/contracts/trainers";
import type { PrivateLobbySnapshot } from "../../../server/src/contracts/protocol";
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
import type { SetupMessage } from '../../../server/src/contracts/protocol'
import { previewTeamEdit } from '../lib/teamEditing'

export type PlayIntent =
  | { mode: 'automatic'; format: FormatChoice }
  | { mode: 'create'; format: FormatChoice }
  | { mode: 'invite'; code: string }
  | { mode: 'pve'; format: FormatChoice; trainerId: string; difficulty: Difficulty }
export interface BattleContextValue {
  lobby: PrivateLobbySnapshot | null
  waiting: boolean
  modePending: boolean
  cancelQueue: () => void
  rematch: (keepTeam: boolean) => void
  connected: boolean
  playerId: string
  sessionName: string
  status: string
  state: GameState | null
  roomId: string | null
  teamAccepted: boolean
  opponentLeft: boolean
  actionPending: boolean
  setupPending: boolean
  moveDrafts: Record<string, string[]>
  draftMoves: (pokemon: string, moves: string[]) => void
  connect: (name: string, token?: string, intent?: PlayIntent) => void
  leave: () => void
  choosePokemon: (name: string) => void
  randomTeam: (count: number) => void
  removePokemon: (pokemon: string) => void
  reorderTeam: (pokemon: string[]) => void
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
  const [lobby, setLobby] = useState<PrivateLobbySnapshot | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [modePending, setModePending] = useState(false)
  const intentRef = useRef<PlayIntent | null>(null)
  const registeredRef = useRef(false)
  const [playerId, setPlayerId] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [status, setStatus] = useState('Digite seu nome para entrar na fila.')
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const [setupPreview, setSetupPreview] = useState<RoomSnapshot | null>(null)
  const previewRef = useRef<RoomSnapshot | null>(null)
  const [setupPending, setSetupPending] = useState(false)
  const [moveDrafts, setMoveDrafts] = useState<Record<string, string[]>>({})
  const edits = useRef<SetupMessage[]>([])
  const activeEdit = useRef<SetupMessage | null>(null)
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      const bound = ["choose_pokemon", "remove_pokemon", "reorder_team", "random_team", "set_moves", "reset_team", "accept_team", "battle_ready", "action", "resync"].includes(message.type)
      const outbound = bound ? { ...message, matchId: snapshotRef.current?.matchId } : message
      if (!socketService.send(outbound as ClientMessage))
        toast.toast('Sem conexão. Entre novamente para jogar.', 'error')
    },
    [toast]
  )

  const clearSetup = useCallback(() => {
    if (editTimer.current) clearTimeout(editTimer.current)
    editTimer.current = null
    edits.current = []
    activeEdit.current = null
    previewRef.current = null
    setSetupPreview(null)
    setSetupPending(false)
  }, [])
  const pumpSetup = useCallback(() => {
    if (activeEdit.current || !edits.current.length) return
    const edit = edits.current[0]
    activeEdit.current = edit
    if (!socketService.send(edit)) { clearSetup(); return }
    editTimer.current = setTimeout(() => {
      clearSetup()
      sendMessage({ type: 'resync' })
      toast.toast('A confirmação da equipe demorou. Confira a equipe atualizada antes de continuar.', 'info')
    }, 5000)
  }, [clearSetup, sendMessage, toast])
  const enqueueSetup = useCallback((command: SetupMessage) => {
    const current = previewRef.current ?? snapshotRef.current
    if (!current || current.phase !== 'setup' || current.players[current.viewer === 'p1' ? 0 : 1].ready || edits.current.some(edit => edit.type === 'accept_team') || edits.current.length >= 16) return
    const edit = { ...command, matchId: current.matchId, editId: crypto.randomUUID() }
    edits.current.push(edit)
    const preview = previewTeamEdit(current, edit)
    previewRef.current = preview
    setSetupPreview(preview)
    setSetupPending(true)
    pumpSetup()
  }, [pumpSetup])

  const enterMode = useCallback((intent: PlayIntent) => {
    setModePending(true)
    const commandId = crypto.randomUUID()
    if (intent.mode === 'automatic') sendMessage({ type: 'queue_join', format: intent.format, commandId })
    else if (intent.mode === 'create') sendMessage({ type: 'private_create', format: intent.format, commandId })
    else if (intent.mode === 'invite') sendMessage({ type: 'private_join', code: intent.code, commandId })
    else sendMessage({ type: 'pve_start', format: intent.format, trainerId: intent.trainerId, difficulty: intent.difficulty, commandId })
  }, [sendMessage])
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
        case 'lobby': {
          registeredRef.current = true
          setLobby(message.lobby)
          setWaiting(false)
          setModePending(false)
          clearAction()
          clearSetup()
          updateSnapshot(null)
          setStatus(message.message)
          const intent = intentRef.current
          intentRef.current = null
          if (intent) enterMode(intent)
          break
        }
        case 'waiting':
          setWaiting(true)
          setModePending(false)
          setStatus(message.message)
          break
        case 'match_found':
          if (snapshotRef.current?.matchId === message.state.matchId) { updateSnapshot(message.state); setModePending(false); break }
          setModePending(false)
          setWaiting(false)
          setLobby(null)
          clearAction()
          clearSetup()
          setMoveDrafts({})
          updateSnapshot(message.state)
          setOpponentLeft(false)
          setStatus(`Partida ${message.roomId}`)
          break
        case 'state': {
          const previous = snapshotRef.current
          if (!previous || previous.roomId !== message.state.roomId || previous.matchId !== message.state.matchId || message.state.sequence < previous.sequence) break
          const request = message.state.battle?.request
          if (pending.current && (!request || request.id !== pending.current.requestId || request.submitted)) clearAction()
          updateSnapshot(message.state)
          if (message.editId && message.editId === activeEdit.current?.editId) {
            if (editTimer.current) clearTimeout(editTimer.current)
            editTimer.current = null
            const completed = edits.current.shift()
            activeEdit.current = null
            if (completed?.type === 'remove_pokemon') setMoveDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== completed.pokemon)))
            if (completed?.type === 'reset_team') setMoveDrafts({})
            if (edits.current.length && message.state.phase === 'setup') {
              const preview = edits.current.reduce(previewTeamEdit, message.state)
              previewRef.current = preview
              setSetupPreview(preview)
              pumpSetup()
            } else clearSetup()
          } else if (activeEdit.current) {
            const preview = edits.current.reduce(previewTeamEdit, message.state)
            previewRef.current = preview
            setSetupPreview(preview)
          }
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
          setModePending(false)
          if (message.editId && message.editId === activeEdit.current?.editId) {
            clearSetup()
            sendMessage({ type: 'resync' })
          }
          if (message.actionId === pending.current?.actionId) {
            clearAction()
            sendMessage({ type: 'resync' })
          }
          audio.play('error')
          toast.toast(message.message, 'error')
          break
        case 'opponent_left':
          clearAction()
          clearSetup()
          setOpponentLeft(true)
          setStatus(message.message)
          toast.toast(message.message, 'error')
          break
      }
    },
    [clearAction, clearSetup, enterMode, pumpSetup, sendMessage, toast, updateSnapshot]
  )

  const {
    connected,
    connect: openSocket,
    send,
  } = useSocket({
    onMessage: handleMessage,
    onError: () => setStatus('Sem conexão com o servidor.'),
    onClose: () => {
      clearAction()
      clearSetup()
      registeredRef.current = false
      setWaiting(false)
      setModePending(false)
      setStatus('Conexão encerrada. Entre novamente para jogar.')
      if (snapshotRef.current?.phase !== 'finished') updateSnapshot(null)
    },
  })
  const connect = useCallback(
    (name: string, token = '', intent: PlayIntent = { mode: 'automatic', format: { id: 'classic' } }) => {
      if (registeredRef.current && connected) { enterMode(intent); return }
      intentRef.current = intent
      setModePending(true)
      const attempt = ++attemptRef.current
      nameRef.current = name
        setSessionName(name)
      tokenRef.current = token.trim()
      clearAction()
      clearSetup()
      setMoveDrafts({})
      setPlayerId('')
      updateSnapshot(null)
      setOpponentLeft(false)
      setStatus('Conectando ao servidor…')
      void openSocket().catch(() => {
        if (attemptRef.current !== attempt) return
        intentRef.current = null
        setModePending(false)
        setStatus('Sem conexão.')
        toast.toast('Não foi possível conectar. Inicie o servidor primeiro.', 'error')
      })
    },
    [clearAction, clearSetup, connected, enterMode, openSocket, toast, updateSnapshot]
  )
  const leave = useCallback(() => {
    attemptRef.current++
    clearAction()
    clearSetup()
    setMoveDrafts({})
    send({ type: 'room_leave' })
    setWaiting(false)
    updateSnapshot(null)
    setOpponentLeft(false)
    setStatus('Escolha seu próximo desafio.')
  }, [clearAction, clearSetup, send, updateSnapshot])

  const chooseAction = useCallback(
    (choice: BattleChoice) => {
      const current = snapshotRef.current,
        request = current?.battle?.request
      if (current?.phase !== 'battle' || !request || request.submitted || pending.current) return
      const message: Action = {
        type: 'action',
        matchId: current.matchId,
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
        sendMessage({ type: 'battle_ready', preparationId, matchId: current.matchId })
    })
    return () => controller.abort()
  }, [preparationId, sendMessage])
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (editTimer.current) clearTimeout(editTimer.current)
      pending.current = null
    },
    []
  )

  const visibleSnapshot = setupPreview ?? snapshot
  const state = useMemo(() => (visibleSnapshot ? presentSnapshot(visibleSnapshot) : null), [visibleSnapshot])
  const value = useMemo<BattleContextValue>(
    () => ({
      lobby, waiting, modePending,
      cancelQueue: () => sendMessage({ type: 'queue_cancel' }),
      rematch: keepTeam => { const current = snapshotRef.current; if (current) sendMessage({ type: 'rematch', matchId: current.matchId, accept: true, keepTeam }) },
      connected,
      playerId,
      sessionName,
      status,
      state,
      roomId: snapshot?.roomId ?? null,
      teamAccepted: snapshot?.players[snapshot.viewer === 'p1' ? 0 : 1].ready ?? false,
      opponentLeft,
      actionPending,
      setupPending,
      moveDrafts,
      draftMoves: (pokemon, moves) => setMoveDrafts(current => ({ ...current, [pokemon]: moves })),
      connect,
      leave,
      choosePokemon: (pokemon) => enqueueSetup({ type: 'choose_pokemon', pokemon }),
      randomTeam: (count) => enqueueSetup({ type: 'random_team', count }),
      removePokemon: (pokemon) => enqueueSetup({ type: 'remove_pokemon', pokemon }),
      reorderTeam: (pokemon) => enqueueSetup({ type: 'reorder_team', pokemon }),
      setMoves: (pokemon, moves) => enqueueSetup({ type: 'set_moves', pokemon, moves }),
      acceptTeam: () => enqueueSetup({ type: 'accept_team' }),
      resetTeam: () => enqueueSetup({ type: 'reset_team' }),
      attack: (moveId) => chooseAction({ type: 'move', moveId }),
      switchTo: (speciesId) => {
        const member = snapshotRef.current?.team.find((member) => member.speciesId === speciesId)
        if (member) chooseAction({ type: 'switch', combatantId: member.id })
      },
    }),
    [
      connected,
      lobby, waiting, modePending, sendMessage,
      playerId,
      sessionName,
      status,
      state,
      snapshot,
      opponentLeft,
      actionPending,
      setupPending,
      moveDrafts,
      connect,
      leave,
      enqueueSetup,
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
