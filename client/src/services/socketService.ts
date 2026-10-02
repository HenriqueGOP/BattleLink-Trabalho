import type { ClientMessage, ServerMessage } from '../types/protocol'
import { decodeServerMessage } from '../../../server/src/contracts/decode'

type Listener<T> = (payload: T) => void

export class SocketService {
  private ws: WebSocket | null = null
  private cancelPending: (() => void) | null = null
  private messageListeners = new Set<Listener<ServerMessage>>()
  private openListeners = new Set<Listener<void>>()
  private closeListeners = new Set<Listener<void>>()
  private errorListeners = new Set<Listener<void>>()

  private createSocket: (url: string) => WebSocket
  constructor(createSocket: (url: string) => WebSocket = (url) => new WebSocket(url)) {
    this.createSocket = createSocket
  }

  get isOpen(): boolean {
    return this.ws?.readyState === 1
  }

  connect(url: string, timeoutMs = 10000): Promise<void> {
    this.close()
    return new Promise((resolve, reject) => {
      let settled = false
      const ws = this.createSocket(url)
      this.ws = ws
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.cancelPending = null
        if (error) reject(error)
        else resolve()
      }
      const timer = setTimeout(() => {
        if (this.ws !== ws) return
        finish(new Error('Tempo de conexão esgotado.'))
        for (const listener of this.errorListeners) listener()
        this.close()
      }, timeoutMs)
      this.cancelPending = () => finish(new Error('Conexão cancelada.'))
      ws.onopen = () => {
        if (this.ws !== ws) return
        finish()
        for (const listener of this.openListeners) listener()
      }
      ws.onmessage = (event) => {
        if (this.ws !== ws) return
        let message: ServerMessage
        try {
          message = decodeServerMessage(JSON.parse(String(event.data)))
        } catch {
          for (const listener of this.errorListeners) listener()
          return
        }
        for (const listener of this.messageListeners) listener(message)
      }
      ws.onerror = () => {
        if (this.ws !== ws) return
        finish(new Error('Não foi possível conectar ao servidor.'))
        for (const listener of this.errorListeners) listener()
        this.close()
      }
      ws.onclose = () => {
        if (this.ws !== ws) return
        finish(new Error('Conexão encerrada antes de abrir.'))
        this.ws = null
        for (const listener of this.closeListeners) listener()
      }
    })
  }

  send(message: ClientMessage): boolean {
    if (!this.isOpen) return false
    try {
      this.ws!.send(JSON.stringify(message))
      return true
    } catch {
      this.close()
      return false
    }
  }

  close(): void {
    const ws = this.ws
    if (!ws) return
    this.ws = null
    this.cancelPending?.()
    this.cancelPending = null
    ws.onclose = null
    ws.onerror = null
    ws.onmessage = null
    ws.onopen = null
    ws.close()
    // Notifica imediatamente; callbacks do socket antigo não afetam a próxima conexão.
    for (const listener of this.closeListeners) listener()
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
