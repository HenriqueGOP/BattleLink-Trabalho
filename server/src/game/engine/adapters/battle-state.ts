import type { Battle, Pokemon } from "@pkmn/sim";
import type { CombatantId, LegalMove, OwnPokemon, PublicPokemon, SideId } from "../battle-types";
import { BattleRuleError } from "../battle-types";
import { immutable } from "../immutable";
import { BOOST_IDS, TYPE_IDS } from "../types";
import type { MajorStatus, TypeId } from "../types";

export function pokemonId(pokemon: Pokemon): CombatantId {
  if (!/^p[12]s[0-5]$/.test(pokemon.name)) throw new BattleRuleError("ENGINE_CONTRACT", "Identidade interna inválida.");
  return pokemon.name as CombatantId;
}
export function owner(id: CombatantId): SideId { return id.startsWith("p1") ? "p1" : "p2"; }
export function other(side: SideId): SideId { return side === "p1" ? "p2" : "p1"; }
export function roster(battle: Battle, side: SideId): Pokemon[] {
  return [...battle.getSide(side).pokemon].sort((a, b) => a.name.localeCompare(b.name));
}
export function statusOf(pokemon: Pokemon): MajorStatus | null {
  if (!pokemon.status || pokemon.status === "fnt") return null;
  if (!["brn", "par", "psn", "tox", "slp", "frz"].includes(pokemon.status)) throw new BattleRuleError("ENGINE_CONTRACT", "Status desconhecido.");
  return pokemon.status as MajorStatus;
}
export function publicPokemon(pokemon: Pokemon): PublicPokemon {
  const types = pokemon.getTypes().filter(type => type !== "???").map(type => type.toLowerCase());
  if (types.some(type => !TYPE_IDS.includes(type as TypeId))) throw new BattleRuleError("ENGINE_CONTRACT", "Tipo fora do contrato.");
  const boosts: Record<string, number> = {};
  for (const stat of BOOST_IDS) boosts[stat] = pokemon.boosts[stat];
  return immutable({
    id: pokemonId(pokemon), speciesId: pokemon.baseSpecies.id, level: pokemon.level,
    hp: pokemon.hp, maxHp: pokemon.maxhp, status: statusOf(pokemon), types: types as TypeId[],
    boosts, volatiles: Object.keys(pokemon.volatiles).filter(id => /^[a-z0-9]+$/.test(id)).sort(),
    fainted: pokemon.fainted || pokemon.hp === 0,
  });
}
export function ownMoves(pokemon: Pokemon): readonly LegalMove[] {
  return pokemon.moveSlots.map(move => ({ id: move.id, pp: move.pp, maxPp: move.maxpp, disabled: !!move.disabled }));
}
export function ownPokemon(pokemon: Pokemon): OwnPokemon {
  return immutable({
    ...publicPokemon(pokemon), stats: { ...pokemon.storedStats, hp: pokemon.maxhp },
    ability: pokemon.ability === "adaptability" ? "adaptability" : "none", moves: ownMoves(pokemon),
  });
}
export function fieldState(battle: Battle) {
  return {
    sideConditions: { p1: Object.keys(battle.p1.sideConditions).sort(), p2: Object.keys(battle.p2.sideConditions).sort() },
    fieldConditions: Object.keys(battle.field.pseudoWeather).sort(),
  };
}
