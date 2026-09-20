import { useCallback, useEffect, useRef, useState } from 'react'
import { socketService } from '../services/socket'
import type { ServerMessage } from '../types/protocol'

export interface SocketHandlers {
  onMessage: (message: ServerMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (cause: unknown) => void
}

/** Ponte React ↔ SocketService. Callbacks ficam em refs para não religar listeners. */
export function useSocket(handlers: SocketHandlers) {
  const [connected, setConnected] = useState(socketService.isOpen)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const offMessage = socketService.onMessage(message => handlersRef.current.onMessage(message))
    const offOpen = socketService.onOpen(() => {
      setConnected(true)
      handlersRef.current.onOpen?.()
    })
    const offClose = socketService.onClose(() => {
      setConnected(false)
      handlersRef.current.onClose?.()
    })
    const offError = socketService.onError(cause => handlersRef.current.onError?.(cause))
    return () => {
      offMessage()
      offOpen()
      offClose()
      offError()
    }
  }, [])

  const connect = useCallback((url?: string) => socketService.connect(url), [])
  const send = useCallback((message: Parameters<typeof socketService.send>[0]) => {
    socketService.send(message)
  }, [])
  const close = useCallback(() => socketService.close(), [])

  return { connected, connect, send, close }
}
