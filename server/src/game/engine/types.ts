/** Contratos do domínio; nenhum tipo mutável do simulador atravessa esta fronteira. */
export const TYPE_IDS = Object.freeze([
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const);
export type TypeId = typeof TYPE_IDS[number];
export type PokemonTypes = readonly [TypeId] | readonly [TypeId, TypeId];
export const STAT_IDS = Object.freeze(["hp", "atk", "def", "spa", "spd", "spe"] as const);
export type StatId = typeof STAT_IDS[number];
export type Stats = Readonly<Record<StatId, number>>;
export const BOOST_IDS = Object.freeze(["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"] as const);
export type BoostId = typeof BOOST_IDS[number];
export type Boosts = Readonly<Partial<Record<BoostId, number>>>;
export type MajorStatus = "brn" | "par" | "psn" | "tox" | "slp" | "frz";
export type SupportedAbility = "none" | "adaptability";
export const NATURE_IDS = Object.freeze([
  "hardy", "lonely", "brave", "adamant", "naughty", "bold", "docile", "relaxed", "impish",
  "lax", "timid", "hasty", "serious", "jolly", "naive", "modest", "mild", "quiet",
  "bashful", "rash", "calm", "gentle", "sassy", "careful", "quirky",
] as const);
export type NatureId = typeof NATURE_IDS[number];

export interface StatBuild {
  readonly level?: number;
  readonly ivs?: Readonly<Partial<Record<StatId, number>>>;
  readonly evs?: Readonly<Partial<Record<StatId, number>>>;
  readonly nature?: NatureId;
}

export interface Combatant {
  readonly level: number;
  readonly types: PokemonTypes;
  /** Atributos finais antes dos estágios, calculados por calculateStats. */
  readonly stats: Stats;
  readonly boosts?: Boosts;
  readonly status?: MajorStatus;
  readonly ability?: SupportedAbility;
}

/** Consulta matemática de um hit com poder já resolvido, sem executar o golpe. */
export interface DamageMove {
  readonly type: TypeId;
  readonly category: "Physical" | "Special" | "Status";
  readonly basePower: number;
}
export const DAMAGE_ROLLS = Object.freeze([85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100] as const);
export type DamageRoll = typeof DAMAGE_ROLLS[number];
export interface DamageContext {
  readonly attacker: Combatant;
  readonly defender: Combatant;
  readonly move: DamageMove;
  readonly critical?: boolean;
}
export interface DamageRequest extends DamageContext {
  readonly roll: DamageRoll;
}
export interface DamageResult {
  readonly damage: number;
  readonly roll: DamageRoll;
  readonly critical: boolean;
  readonly effectiveness: number;
}

export type RngSeed = readonly [number, number, number, number];
export interface RngSnapshot {
  readonly algorithm: "showdown-gen5";
  readonly seed: RngSeed;
}
/** Seed obrigatória; geração de entropia pertence à orquestração. */
export interface RNG {
  nextUint32(): number;
  snapshot(): RngSnapshot;
}
