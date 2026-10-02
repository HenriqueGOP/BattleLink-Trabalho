import { SocketService } from './socketService'

export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://127.0.0.1:3002'
export const socketService = new SocketService()
