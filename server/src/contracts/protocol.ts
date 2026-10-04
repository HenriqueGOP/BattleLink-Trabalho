import type { FormatChoice } from "./formats";
import type { Difficulty } from "./trainers";
import type {
  BattleChoice,
  BattleEvent,
  BattleView,
  CombatantId,
  SideId,
} from "../game/engine/battle-types";

export const PROTOCOL_VERSION = "pokemon-battle/4";
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
export interface PrivateLobbySnapshot {
  readonly roomId: string; readonly code: string; readonly hostId: string;
  readonly format: FormatChoice; readonly players: readonly { readonly id: string; readonly name: string }[];
}
export interface RoomSnapshot {
  readonly matchId: string;
  readonly format: FormatChoice;
  readonly mode: "automatic" | "private" | "pve";
  readonly inviteCode: string | null;
  readonly trainerId: string | null;
  readonly difficulty: Difficulty | null;
  readonly rematch: { readonly expiresAt: number | null; readonly votes: readonly [boolean, boolean]; readonly available: boolean };
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
  | { type: "queue_join"; format: FormatChoice; commandId: string }
  | { type: "queue_cancel" }
  | { type: "private_create"; format: FormatChoice; commandId: string }
  | { type: "private_join"; code: string; commandId: string }
  | { type: "room_leave" }
  | { type: "pve_start"; trainerId: string; difficulty: Difficulty; format: FormatChoice; commandId: string }
  | { type: "rematch"; matchId: string; accept: boolean; keepTeam: boolean }
  | SetupMessage
  | { type: "battle_ready"; preparationId: string; matchId?: string }
  | { type: "resync"; matchId?: string }
  | {
      type: "action";
      matchId?: string;
      requestId: number;
      actionId: string;
      choice: BattleChoice;
    };
/** The wire decoder requires matchId; optional only for trusted in-process fixtures. */
export type SetupMessage = (
  | { type: "choose_pokemon"; pokemon: string }
  | { type: "remove_pokemon"; pokemon: string }
  | { type: "reorder_team"; pokemon: string[] }
  | { type: "random_team"; count: number }
  | { type: "set_moves"; pokemon: string; moves: string[] }
  | { type: "reset_team" }
  | { type: "accept_team" }
) & { editId?: string; matchId?: string };
export type ServerMessage =
  | { type: "lobby"; lobby: PrivateLobbySnapshot | null; message: string; commandId?: string }
  | {
      type: "welcome";
      playerId: string;
      protocol: string;
      catalogVersion: string;
    }
  | { type: "waiting"; message: string; commandId?: string }
  | { type: "match_found"; roomId: string; state: RoomSnapshot; commandId?: string }
  | { type: "state"; state: RoomSnapshot; editId?: string }
  | {
      type: "action_ack";
      matchId: string;
      requestId: number;
      actionId: string;
      duplicate: boolean;
      resolved: boolean;
    }
  | { type: "error"; code: string; message: string; actionId?: string; editId?: string; commandId?: string }
  | { type: "opponent_left"; message: string };
