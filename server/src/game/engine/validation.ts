import { BOOST_IDS, NATURE_IDS, STAT_IDS, TYPE_IDS } from "./types";
import type { Combatant, DamageContext, PokemonTypes, RngSeed, StatBuild, TypeId } from "./types";

export function integer(value: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} deve ser inteiro entre ${min} e ${max}.`);
  }
}

export function validateSeed(seed: RngSeed): void {
  if (!Array.isArray(seed) || seed.length !== 4) throw new RangeError("Seed deve conter quatro palavras de 16 bits.");
  for (let index = 0; index < 4; index++) integer(seed[index], 0, 65535, "Seed");
}

export function validateType(type: TypeId): void {
  if (!TYPE_IDS.includes(type)) throw new RangeError("Tipo de Pokémon desconhecido.");
}

export function validateTypes(types: PokemonTypes): void {
  if (!Array.isArray(types) || types.length < 1 || types.length > 2 || new Set(types).size !== types.length) {
    throw new RangeError("Informe um ou dois tipos distintos.");
  }
  for (const type of types) validateType(type);
}

export function validateBuild(build: StatBuild): void {
  integer(build.level ?? 50, 1, 100, "Nível");
  if (!NATURE_IDS.includes(build.nature ?? "hardy")) throw new RangeError("Natureza desconhecida.");
  let evTotal = 0;
  for (const stat of STAT_IDS) {
    integer(build.ivs?.[stat] ?? 31, 0, 31, "IV");
    const ev = build.evs?.[stat] ?? 0;
    integer(ev, 0, 252, "EV");
    evTotal += ev;
  }
  if (evTotal > 510) throw new RangeError("O total de EVs não pode exceder 510.");
}

function validateCombatant(pokemon: Combatant): void {
  integer(pokemon.level, 1, 100, "Nível");
  validateTypes(pokemon.types);
  for (const stat of STAT_IDS) integer(pokemon.stats[stat], 1, 65535, `Atributo ${stat}`);
  for (const stat of BOOST_IDS) integer(pokemon.boosts?.[stat] ?? 0, -6, 6, `Estágio ${stat}`);
  if (pokemon.ability !== undefined && pokemon.ability !== "none" && pokemon.ability !== "adaptability") {
    throw new RangeError("Habilidade fora do escopo.");
  }
  if (pokemon.status !== undefined && !["brn", "par", "psn", "tox", "slp", "frz"].includes(pokemon.status)) {
    throw new RangeError("Status desconhecido.");
  }
}

export function validateDamageContext(context: DamageContext): void {
  validateCombatant(context.attacker);
  validateCombatant(context.defender);
  validateType(context.move.type);
  if (!["Physical", "Special", "Status"].includes(context.move.category)) throw new RangeError("Categoria desconhecida.");
  integer(context.move.basePower, context.move.category === "Status" ? 0 : 1, 65535, "Poder base");
  if (context.critical !== undefined && typeof context.critical !== "boolean") throw new TypeError("Crítico deve ser booleano.");
}
