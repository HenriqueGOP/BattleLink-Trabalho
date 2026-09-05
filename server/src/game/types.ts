export type PlayerId = string;

export interface PlayerState {
  id: PlayerId;
  name: string;
  pokemon: string | null;
  hp: number;
  maxHp: number;
  energy: number;
}

export type ActionType = "attack" | "defend" | "special";

export interface PlayerAction {
  type: ActionType;
  move?: string;
}

export type GamePhase = "waiting" | "battle" | "finished";

export interface GameState {
  phase: GamePhase;
  players: [PlayerState, PlayerState];
  turn: 0 | 1;
  log: string[];
  winner: PlayerId | null;
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "choose_pokemon"; pokemon: string }
  | { type: "action"; action: PlayerAction }
  | { type: "leave" };

export type ServerMessage =
  | { type: "welcome"; playerId: PlayerId; protocol: string }
  | { type: "waiting"; message: string }
  | { type: "match_found"; roomId: string; state: GameState }
  | { type: "state"; state: GameState }
  | { type: "error"; code: string; message: string }
  | { type: "opponent_left"; message: string };

export const LOCAL_POKEMON: Record<string, { maxHp: number }> = {
  charizard: { maxHp: 100 },
  blastoise: { maxHp: 110 },
  venusaur: { maxHp: 105 },
};