import type { BoostId, Boosts, MajorStatus, RNG, RngSeed, StatBuild, Stats, SupportedAbility, TypeId } from "./types";

export type SideId = "p1" | "p2";
export type CombatantId = `${SideId}s${number}`;
export type ExcludedMechanic = "items" | "abilities" | "weather" | "terrain" | "hazards" | "forms" | "zmove" | "dynamax" | "nonstandard" | "alias";
export type MoveSupport = { readonly supported: true } | { readonly supported: false; readonly reasons: readonly ExcludedMechanic[] };
export interface MoveEffect {
  readonly target: "self" | "target";
  readonly chance: number;
  readonly status?: MajorStatus;
  readonly volatile?: string;
  readonly boosts?: Boosts;
}
export interface MoveData {
  readonly id: string;
  readonly name: string;
  readonly type: TypeId;
  readonly category: "Physical" | "Special" | "Status";
  readonly basePower: number;
  readonly accuracy: number | true;
  readonly pp: number;
  readonly priority: number;
  /** Convenção upstream: 1 = estágio normal, 2 = crítico elevado. */
  readonly critRatio: number;
  readonly multihit?: readonly [number, number];
  readonly drain?: readonly [number, number];
  readonly recoil?: readonly [number, number];
  readonly heal?: readonly [number, number];
  readonly charge: boolean;
  readonly recharge: boolean;
  readonly secondaries: readonly MoveEffect[];
  /** Nomes informativos; funções permanecem no registro interno do simulador. */
  readonly hooks: readonly string[];
  readonly support: MoveSupport;
}

/** Extensão confiável de dados do servidor; nunca recebida por socket. */
export interface SimpleMoveDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: TypeId;
  readonly category: MoveData["category"];
  readonly basePower: number;
  readonly accuracy: number | true;
  readonly pp: number;
  readonly priority?: number;
  readonly critRatio?: number;
  readonly multihit?: readonly [number, number];
  readonly drain?: readonly [number, number];
  readonly recoil?: readonly [number, number];
  readonly heal?: readonly [number, number];
  readonly target?: "normal" | "self";
  readonly status?: MajorStatus;
  readonly boosts?: Boosts;
  readonly secondaries?: readonly MoveEffect[];
}

export interface TeamSet extends StatBuild {
  readonly speciesId: string;
  readonly moves: readonly string[];
}
export interface BattleSetup {
  readonly teams: readonly [readonly TeamSet[], readonly TeamSet[]];
  readonly seed: RngSeed;
}
export interface EngineOptions {
  /** Injeção para testes/servidor; precisa produzir palavras de 32 bits. */
  readonly rng?: RNG;
  readonly additionalMoves?: readonly SimpleMoveDefinition[];
}
export type BattleChoice = { readonly type: "move"; readonly moveId: string } | { readonly type: "switch"; readonly combatantId: CombatantId };
export interface ChoiceSubmission {
  readonly side: SideId;
  readonly requestId: number;
  readonly actionId: string;
  readonly choice: BattleChoice;
}
export interface LegalMove {
  readonly id: string;
  readonly pp: number;
  readonly maxPp: number;
  readonly disabled: boolean;
}
export interface ActionRequest {
  readonly id: number;
  readonly kind: "move" | "switch" | "revive";
  readonly moves: readonly LegalMove[];
  readonly switches: readonly CombatantId[];
  readonly submitted: boolean;
  /** Continuação de carga/recharge/efeito que não exige novo gasto de PP. */
  readonly lockedMoveId: string | null;
}
export interface PublicPokemon {
  readonly id: CombatantId;
  readonly speciesId: string;
  readonly level: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly status: MajorStatus | null;
  /** Até três tipos; vazio representa o estado temporário sem tipo. */
  readonly types: readonly TypeId[];
  readonly boosts: Boosts;
  readonly volatiles: readonly string[];
  readonly fainted: boolean;
}
export interface OwnPokemon extends PublicPokemon {
  readonly stats: Stats;
  readonly ability: SupportedAbility;
  readonly moves: readonly LegalMove[];
}
export type OpponentPokemon = PublicPokemon | { readonly id: CombatantId; readonly hidden: true };
export interface BattleView {
  readonly phase: "collecting" | "forced_switch" | "finished";
  readonly round: number;
  readonly sequence: number;
  readonly ownTeam: readonly OwnPokemon[];
  readonly opponentTeam: readonly OpponentPokemon[];
  readonly active: Readonly<Record<SideId, CombatantId | null>>;
  readonly request: ActionRequest | null;
  readonly result: BattleResult | null;
  readonly sideConditions: Readonly<Record<SideId, readonly string[]>>;
  readonly fieldConditions: readonly string[];
}
export interface BattleResult {
  readonly winner: SideId | null;
  readonly reason: "knockout" | "forfeit" | "draw";
}

interface EventEnvelope {
  readonly sequence: number;
  readonly round: number;
  readonly audience: "public" | SideId;
}
type CombatEvent =
  | { readonly type: "battle_start" }
  | { readonly type: "round_start"; readonly number: number }
  | { readonly type: "move"; readonly actor: CombatantId; readonly target: CombatantId | null; readonly moveId: string }
  | { readonly type: "damage" | "heal"; readonly target: CombatantId; readonly hpBefore: number; readonly hpAfter: number; readonly maxHp: number; readonly amount: number; readonly source: CombatantId | null; readonly cause: string | null }
  | { readonly type: "critical" | "super_effective" | "resisted" | "immune" | "faint"; readonly target: CombatantId }
  | { readonly type: "miss"; readonly actor: CombatantId; readonly target: CombatantId | null }
  | { readonly type: "hit_count"; readonly target: CombatantId; readonly hits: number }
  | { readonly type: "switch"; readonly target: CombatantId; readonly previous: CombatantId | null; readonly forced: boolean; readonly pokemon: PublicPokemon }
  | { readonly type: "status"; readonly target: CombatantId; readonly status: MajorStatus | null }
  | { readonly type: "boost"; readonly target: CombatantId; readonly stat: BoostId; readonly before: number; readonly after: number }
  | { readonly type: "unable"; readonly actor: CombatantId; readonly reason: string }
  | { readonly type: "effect"; readonly operation: string; readonly target: CombatantId | null; readonly side: SideId | null; readonly effectId: string | null }
  | { readonly type: "state_sync"; readonly active: readonly PublicPokemon[]; readonly sideConditions: Readonly<Record<SideId, readonly string[]>>; readonly fieldConditions: readonly string[] }
  | { readonly type: "battle_end"; readonly result: BattleResult };
export type BattleEvent = EventEnvelope & CombatEvent;
export type BattleEventData = CombatEvent;
export interface BattleUpdate {
  readonly resolved: boolean;
  readonly duplicate: boolean;
  readonly sequence: number;
}
export type BattleErrorCode = "INVALID_TEAM" | "INVALID_ACTION" | "STALE_REQUEST" | "ALREADY_SUBMITTED" | "FINISHED" | "ENGINE_CONTRACT";
export class BattleRuleError extends Error {
  constructor(readonly code: BattleErrorCode, message: string) { super(message); this.name = "BattleRuleError"; }
}
