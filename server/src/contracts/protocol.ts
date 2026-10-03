import type {
  BattleChoice,
  BattleEvent,
  BattleView,
  CombatantId,
  SideId,
} from "../game/engine/battle-types";

export const PROTOCOL_VERSION = "pokemon-battle/3";
export const ARENA_IDS = [
  "forest",
  "stadium",
  "cave",
  "beach",
  "space",
  "night-city",
] as const;
export type ArenaId = (typeof ARENA_IDS)[number];
export type GamePhase = "setup" | "preparing" | "battle" | "finished";
export interface Selection {
  readonly id: CombatantId;
  readonly speciesId: string;
  readonly moves: readonly string[];
  readonly shiny: boolean;
}
export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
  readonly teamCount: number;
}
export interface RoomResult {
  readonly winner: SideId | null;
  readonly reason:
    "knockout" | "draw" | "disconnect" | "preparation_timeout" | "engine_error";
}
export interface RoomSnapshot {
  readonly roomId: string;
  readonly phase: GamePhase;
  readonly viewer: SideId;
  readonly players: readonly [Participant, Participant];
  readonly team: readonly Selection[];
  readonly arena: ArenaId;
  readonly battle: BattleView | null;
  readonly events: readonly BattleEvent[];
  /** Eventos com sequence <= eventFloor já saíram da janela de replay. */
  readonly eventFloor: number;
  readonly sequence: number;
  readonly revealedShiny: Readonly<Partial<Record<CombatantId, boolean>>>;
  readonly preparation: { readonly id: string; readonly ready: boolean } | null;
  readonly result: RoomResult | null;
  readonly log: readonly string[];
}
export type ClientMessage =
  | {
      type: "join";
      name: string;
      protocol: typeof PROTOCOL_VERSION;
      catalogVersion: string;
      token?: string;
    }
  | { type: "leave" }
  | { type: "choose_pokemon"; pokemon: string }
  | { type: "random_team"; count: number }
  | { type: "set_moves"; pokemon: string; moves: string[] }
  | { type: "reset_team" }
  | { type: "accept_team" }
  | { type: "battle_ready"; preparationId: string }
  | { type: "resync" }
  | {
      type: "action";
      requestId: number;
      actionId: string;
      choice: BattleChoice;
    };
export type ServerMessage =
  | {
      type: "welcome";
      playerId: string;
      protocol: string;
      catalogVersion: string;
    }
  | { type: "waiting"; message: string }
  | { type: "match_found"; roomId: string; state: RoomSnapshot }
  | { type: "state"; state: RoomSnapshot }
  | {
      type: "action_ack";
      requestId: number;
      actionId: string;
      duplicate: boolean;
      resolved: boolean;
    }
  | { type: "error"; code: string; message: string; actionId?: string }
  | { type: "opponent_left"; message: string };
