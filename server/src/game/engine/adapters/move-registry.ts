import { Dex, toID } from "@pkmn/sim";
import type { ModdedDex, Move } from "@pkmn/sim";
import type { ExcludedMechanic, MoveData, MoveEffect, SimpleMoveDefinition } from "../battle-types";
import { immutable } from "../immutable";
import { BOOST_IDS, TYPE_IDS } from "../types";
import type { MajorStatus, TypeId } from "../types";
import { integer, validateType } from "../validation";

const base = Dex.forGen(9);
export const HAZARDS = new Set(["spikes", "stealthrock", "toxicspikes", "stickyweb"]);
const exclusions: Readonly<Partial<Record<ExcludedMechanic, readonly string[]>>> = {
  items: ["bestow", "corrosivegas", "fling", "recycle", "belch", "stuffcheeks", "teatime", "trick", "switcheroo", "embargo", "magicroom", "naturalgift", "poltergeist"],
  abilities: ["doodle", "entrainment", "gastroacid", "roleplay", "simplebeam", "skillswap", "worryseed", "coreenforcer"],
  weather: ["auroraveil"],
  terrain: ["steelroller"],
  hazards: ["stoneaxe", "ceaselessedge"],
  forms: ["transform", "relicsong", "hyperspacefury"],
};

function ratio(value: readonly number[] | undefined): readonly [number, number] | undefined {
  return value && value.length === 2 ? [value[0], value[1]] : undefined;
}

function support(id: string, move: Move): MoveData["support"] {
  const reasons = new Set<ExcludedMechanic>();
  for (const [reason, ids] of Object.entries(exclusions)) {
    if (ids?.includes(id)) reasons.add(reason as ExcludedMechanic);
  }
  if (move.isZ) reasons.add("zmove");
  if (move.isMax) reasons.add("dynamax");
  if (move.weather) reasons.add("weather");
  if (move.terrain) reasons.add("terrain");
  if (move.sideCondition && HAZARDS.has(move.sideCondition)) reasons.add("hazards");
  if (move.gen > 9 || ["Future", "CAP", "LGPE"].includes(move.isNonstandard ?? "") || !move.exists) reasons.add("nonstandard");
  if (move.id !== id) reasons.add("alias");
  return reasons.size ? { supported: false, reasons: [...reasons].sort() } : { supported: true };
}

function secondaryEffects(move: Move): MoveEffect[] {
  const effects: MoveEffect[] = [];
  for (const effect of move.secondaries ?? []) {
    const chance = effect.chance ?? 100;
    if (effect.status || effect.volatileStatus || effect.boosts) effects.push({
      target: "target", chance, status: effect.status as MajorStatus | undefined,
      volatile: effect.volatileStatus, boosts: effect.boosts && { ...effect.boosts },
    });
    if (effect.self) effects.push({ target: "self", chance, status: effect.self.status as MajorStatus | undefined,
      volatile: effect.self.volatileStatus, boosts: effect.self.boosts && { ...effect.self.boosts } });
  }
  return effects;
}

function describe(id: string, move: Move): MoveData {
  const type = move.type.toLowerCase();
  if (!TYPE_IDS.includes(type as TypeId)) throw new Error(`Tipo inesperado no registro: ${id}`);
  return immutable<MoveData>({
    id, name: move.name, type: type as TypeId, category: move.category, basePower: move.basePower,
    accuracy: move.accuracy, pp: move.pp, priority: move.priority, critRatio: move.critRatio ?? 1,
    multihit: typeof move.multihit === "number" ? [move.multihit, move.multihit] : ratio(move.multihit),
    drain: ratio(move.drain), recoil: ratio(move.recoil), heal: ratio(move.heal) ?? (id === "rest" ? [1, 1] : undefined),
    charge: !!move.flags.charge, recharge: !!move.flags.recharge, secondaries: secondaryEffects(move),
    hooks: [
      ...Object.entries(move).filter(([, value]) => typeof value === "function").map(([name]) => name),
      ...Object.entries(move.condition ?? {}).filter(([, value]) => typeof value === "function").map(([name]) => `condition.${name}`),
    ].sort(),
    support: support(id, move),
  });
}

function validateSimple(move: SimpleMoveDefinition): void {
  if (!/^[a-z][a-z0-9]{0,63}$/.test(move.id) || base.moves.get(move.id).exists) throw new RangeError("ID de extensão inválido ou já existente.");
  if (toID(move.name) !== move.id) throw new RangeError("Nome da extensão deve corresponder ao seu ID.");
  validateType(move.type);
  if (!["Physical", "Special", "Status"].includes(move.category)) throw new RangeError("Categoria de extensão inválida.");
  if (move.target !== undefined && !["normal", "self"].includes(move.target)) throw new RangeError("Alvo de extensão inválido.");
  const validateStatus = (status: string | undefined) => {
    if (status !== undefined && !["brn", "par", "psn", "tox", "slp", "frz"].includes(status)) throw new RangeError("Status de extensão inválido.");
  };
  validateStatus(move.status);
  for (const stat of BOOST_IDS) integer(move.boosts?.[stat] ?? 0, -6, 6, "Estágio");
  integer(move.basePower, move.category === "Status" ? 0 : 1, 1000, "Poder base");
  if (move.accuracy !== true) integer(move.accuracy, 1, 100, "Precisão");
  integer(move.pp, 1, 64, "PP");
  integer(move.priority ?? 0, -7, 5, "Prioridade");
  integer(move.critRatio ?? 1, 1, 4, "Crítico");
  for (const values of [move.drain, move.recoil, move.heal]) {
    if (values) { integer(values[0], 1, values[1], "Numerador"); integer(values[1], 1, 100, "Denominador"); }
  }
  if (move.multihit) { integer(move.multihit[0], 1, 10, "Hits mínimos"); integer(move.multihit[1], move.multihit[0], 10, "Hits máximos"); }
  for (const effect of move.secondaries ?? []) {
    if (!["self", "target"].includes(effect.target)) throw new RangeError("Alvo secundário inválido.");
    validateStatus(effect.status);
    integer(effect.chance, 0, 100, "Chance secundária");
    if (effect.volatile && !["confusion", "flinch"].includes(effect.volatile)) throw new RangeError("Volátil de extensão fora do contrato simples.");
    for (const stat of BOOST_IDS) integer(effect.boosts?.[stat] ?? 0, -6, 6, "Estágio");
  }
}

/** Dex isolado por registro: extensões nunca alteram o singleton upstream. */
export class MoveRegistry {
  readonly dex: ModdedDex;
  private readonly catalog: ReadonlyMap<string, MoveData>;
  readonly addedIds: ReadonlySet<string>;

  constructor(additional: readonly SimpleMoveDefinition[] = []) {
    const local = new Dex.ModdedDex("gen9");
    const moves = { ...base.data.Moves };
    const added = new Set<string>();
    for (const move of additional) {
      validateSimple(move);
      if (added.has(move.id)) throw new RangeError("Extensão duplicada.");
      added.add(move.id);
      moves[move.id] = {
        name: move.name, type: base.types.get(move.type).name, category: move.category,
        basePower: move.basePower, accuracy: move.accuracy, pp: move.pp, priority: move.priority ?? 0,
        critRatio: move.critRatio ?? 1, target: move.target ?? "normal", flags: { protect: 1, mirror: 1 },
        multihit: move.multihit && [...move.multihit], drain: move.drain && [...move.drain],
        recoil: move.recoil && [...move.recoil], heal: move.heal && [...move.heal],
        status: move.status, boosts: move.boosts && { ...move.boosts },
        secondaries: move.secondaries?.map(effect => {
          const data = { status: effect.status, volatileStatus: effect.volatile, boosts: effect.boosts && { ...effect.boosts } };
          return effect.target === "self" ? { chance: effect.chance, self: data } : { chance: effect.chance, ...data };
        }),
      };
    }
    local.dataCache = { ...base.data, Moves: moves };
    local.gen = 9;
    local.forFormat = () => local;
    this.dex = local;
    this.addedIds = added;
    this.catalog = new Map(Object.keys(moves).sort().map(id => [id, describe(id, local.moves.get(id))]));
    // Metronome consulta moves.all(): seu sorteio fica restrito ao formato.
    local.moves.allCache = [...this.catalog.values()].filter(move => move.support.supported).map(move => local.moves.get(move.id));
  }

  get(id: string): MoveData | undefined { return this.catalog.get(id); }
  all(): readonly MoveData[] { return Object.freeze([...this.catalog.values()]); }
  allowed(id: string): boolean { return id === "recharge" || id === "struggle" || this.catalog.get(id)?.support.supported === true; }
}

const registry = new MoveRegistry();
export function defaultMoveRegistry(): MoveRegistry { return registry; }
export function getMove(id: string): MoveData | undefined { return registry.get(id); }
export function listMoves(): readonly MoveData[] { return registry.all(); }
