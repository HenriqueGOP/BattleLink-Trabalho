import type { ClientMessage, ServerMessage } from '../types/protocol'

export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://127.0.0.1:3002'

type Listener<T> = (payload: T) => void

/**
 * Conexão WebSocket única e tipada. Componentes e hooks nunca falam com o
 * WebSocket bruto — passam por aqui (ou pelo BattleProvider).
 */
class SocketService {
  private ws: WebSocket | null = null
  private messageListeners = new Set<Listener<ServerMessage>>()
  private openListeners = new Set<Listener<void>>()
  private closeListeners = new Set<Listener<void>>()
  private errorListeners = new Set<Listener<void>>()

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** Encerra qualquer conexão anterior e abre nova. Resolve ao abrir; rejeita em erro antes disso. */
  connect(url: string = WS_URL): Promise<void> {
    this.close()
    return new Promise((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => {
        settled = true
        for (const listener of this.openListeners) listener()
        resolve()
      }
      ws.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage
          for (const listener of this.messageListeners) listener(message)
        } catch {
          // JSON malformado vindo do servidor não deve derrubar a UI
        }
      }
      ws.onerror = () => {
        for (const listener of this.errorListeners) listener()
        if (!settled) {
          settled = true
          reject(new Error('Não foi possível conectar ao servidor.'))
        }
      }
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null
        for (const listener of this.closeListeners) listener()
        if (!settled) {
          settled = true
          reject(new Error('Conexão encerrada antes de abrir.'))
        }
      }
    })
  }

  send(message: ClientMessage): void {
    if (this.isOpen) this.ws?.send(JSON.stringify(message))
  }

  close(): void {
    if (this.ws) {
      const ws = this.ws
      this.ws = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.onopen = null
      ws.close()
    }
  }

  onMessage(listener: Listener<ServerMessage>): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onOpen(listener: Listener<void>): () => void {
    this.openListeners.add(listener)
    return () => this.openListeners.delete(listener)
  }

  onClose(listener: Listener<void>): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  onError(listener: Listener<void>): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }
}

export const socketService = new SocketService()
