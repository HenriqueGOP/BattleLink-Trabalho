/** Contrato único do servidor, navegador e terminal. Sem URLs ou objetos do simulador. */
export type {
  ClientMessage,
  ServerMessage,
  RoomSnapshot as GameState,
  GamePhase,
  Participant as PlayerState,
} from "../contracts/protocol";
export type PlayerId = string;
