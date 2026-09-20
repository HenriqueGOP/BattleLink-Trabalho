// server/src/game/types.ts
import { MoveData } from "./pokeapi";

export type PlayerId = string;
export type ActionType = "attack" | "defend" | "special";

export interface PlayerAction { type: ActionType; move?: string }
export type GamePhase = "battle" | "finished";
export type BattleEventType =
  | "battle_start" | "turn_change" | "damage" | "miss" | "immune" | "effective" | "resisted"
  | "heal" | "stat_up" | "stat_down" | "status_apply" | "status_cure" | "flinch"
  | "residual" | "faint" | "switch_in" | "tera" | "substitute_needed" | "victory" | "defeat" | "draw";

/** Evento público e ordenado. IDs de jogadores, e não lados visuais, evitam
 * que os dois clientes tenham de adivinhar alvo e ordem a partir do texto. */
export interface BattleEvent {
  id: number; type: BattleEventType; message: string;
  actorId?: PlayerId; targetId?: PlayerId; pokemon?: string;
  amount?: number; move?: string; crit?: boolean; hits?: number;
  status?: string; stat?: string;
}

export interface TeamMemberState {
  pokemon: string; types: string[]; image: string | null; abilities: string[];
  moves: MoveData[]; selectedMoves: string[]; maxHp: number; hp: number; status: string | null;
  isShiny: boolean;
  isTerastallized: boolean;
  sleepTurns: number;
  pp: Record<string, number>;
  stats: Record<string, number>;
  sprites: { front: string | null; back: string | null; shinyFront: string | null; shinyBack: string | null };
  cries: { latest: string | null; legacy: string | null };
}

export interface StatStages {
  [key: string]: number;
  attack: number; defense: number; specialAttack: number; specialDefense: number;
  speed: number; accuracy: number; evasion: number;
}

export interface ActivePokemonData {
  moves: MoveData[]; selectedMoves: string[]; types: string[];
  teraType: string; isTerastallized: boolean; status: string | null;
  isShiny: boolean;
  statStages: StatStages; sleepTurns: number;
  poisonCounter: number; flinched: boolean;
  confusionTurns: number; // volátil: > 0 = confuso; trocar de Pokémon cura
  pp: Record<string, number>;
  cries: { latest: string | null; legacy: string | null };
  sprites: { front: string | null; back: string | null; shinyFront: string | null; shinyBack: string | null };
  stats: Record<string, number>;
}

export interface PlayerState {
  id: PlayerId; name: string; pokemon: string | null;
  hp: number; maxHp: number;
  team: TeamMemberState[];
  pokemonData?: ActivePokemonData;
}

export interface FieldState {
  weather: string | null; terrain: string | null;
  /** Cenário do campo (id do registro de backgrounds) - sorteado no início, igual para os dois. */
  background: string | null;
  hazards: [{ stealthRock: boolean; spikes: number }, { stealthRock: boolean; spikes: number }];
}

export interface GameState {
  phase: GamePhase; players: [PlayerState, PlayerState]; turn: 0 | 1;
  pendingSwitch: [boolean, boolean]; field: FieldState; log: string[]; logOffset: number;
  events: BattleEvent[]; winner: PlayerId | null;
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "leave" }
  | { type: "choose_pokemon"; pokemon: string }
  | { type: "set_moves"; pokemon: string; moves: string[] }
  | { type: "reset_team" }                          // ⬅ adicione
  | { type: "terastallize" }
  | { type: "switch_pokemon"; pokemon: string }
  | { type: "action"; action: PlayerAction };

export type ServerMessage =
  | { type: "welcome"; playerId: PlayerId; protocol: string }
  | { type: "waiting"; message: string }
  | { type: "match_found"; roomId: string; state: GameState }
  | { type: "state"; state: GameState }
  | { type: "error"; code: string; message: string }
  | { type: "opponent_left"; message: string };
