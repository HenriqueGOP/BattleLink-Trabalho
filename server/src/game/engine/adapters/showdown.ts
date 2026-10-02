import { Battle, Dex, toID } from "@pkmn/sim";
import type { Pokemon, PokemonSet } from "@pkmn/sim";
import type { Combatant, DamageContext, DamageResult, DamageRoll, PokemonTypes, StatBuild, Stats, TypeId } from "../types";
import { STAT_IDS } from "../types";
import { ShowdownRng, simulatorPrng } from "./showdown-rng";

const dex = Dex.forGen(9);
// Custom Game substitui trunc por Math.trunc e remove overflows de cartucho.
// Um formato próprio preserva a aritmética oficial e os limites deste projeto.
const format = new Dex.Format({
  name: "[Gen 9] Pokemon Battle", mod: "gen9", gameType: "singles",
  ruleset: ["Max Team Size = 6", "Max Move Count = 4", "Max Level = 100", "Default Level = 50"],
});

function isolatedBattle(): Battle {
  // Sempre explícita: a consulta nunca gera entropia nem usa o RNG de uma sala.
  const battle = new Battle({
    formatid: format.id, format,
    prng: simulatorPrng(new ShowdownRng([0, 0, 0, 1])),
    strictChoices: true,
  });
  // O construtor upstream escreve um timestamp privado. Não o expomos nem usamos
  // como entrada de regra; consultas e snapshots públicos nunca retornam esse log.
  battle.log.length = 0;
  return battle;
}

function pokemonSet(species: string, build: StatBuild): PokemonSet {
  const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const stat of STAT_IDS) {
    ivs[stat] = build.ivs?.[stat] ?? 31;
    evs[stat] = build.evs?.[stat] ?? 0;
  }
  return {
    name: species, species, level: build.level ?? 50,
    nature: dex.natures.get(build.nature ?? "hardy").name,
    ivs, evs, ability: "No Ability", item: "", moves: ["Tackle"],
    gender: "N", happiness: 255, shiny: false,
  };
}

export function simulatorStats(speciesId: string, build: StatBuild): Stats {
  if (!/^[a-z0-9]{1,64}$/.test(speciesId)) throw new RangeError("ID de espécie inválido.");
  const species = dex.species.get(speciesId);
  if (!species.exists || species.id !== speciesId || species.gen > 9 || species.num < 1 || species.num > 1025 || species.forme) {
    throw new RangeError("Espécie inexistente ou forma fora do escopo.");
  }
  const battle = isolatedBattle();
  try {
    battle.setPlayer("p1", { name: "p1", team: [pokemonSet(species.name, build)] });
    const pokemon = battle.p1.pokemon[0];
    // maxhp também preserva exceções oficiais como Shedinja (HP = 1).
    return Object.freeze({ ...pokemon.storedStats, hp: pokemon.maxhp });
  } finally {
    battle.destroy();
  }
}

function typeName(type: TypeId): string {
  return dex.types.get(type).name;
}

export function simulatorEffectiveness(type: TypeId, defenderTypes: PokemonTypes): number {
  const attack = typeName(type);
  const defenses = defenderTypes.map(typeName);
  return dex.getImmunity(attack, defenses) ? 2 ** dex.getEffectiveness(attack, defenses) : 0;
}

function applyContext(pokemon: Pokemon, input: Combatant): void {
  pokemon.types = input.types.map(typeName);
  pokemon.storedStats = {
    atk: input.stats.atk, def: input.stats.def, spa: input.stats.spa,
    spd: input.stats.spd, spe: input.stats.spe,
  };
  pokemon.baseStoredStats = { ...input.stats };
  pokemon.hp = pokemon.maxhp = pokemon.baseMaxhp = input.stats.hp;
  pokemon.boosts = {
    atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, ...input.boosts,
  };
  pokemon.status = toID(input.status ?? "");
  pokemon.ability = pokemon.baseAbility = toID(input.ability === "adaptability" ? "adaptability" : "noability");
}

/** Um único contexto descartável atende um ou vários rolls, sem executar ações. */
export function simulatorDamage(context: DamageContext, rolls: readonly DamageRoll[]): readonly DamageResult[] {
  const effectiveness = simulatorEffectiveness(context.move.type, context.defender.types);
  const result = (roll: DamageRoll, damage: number): DamageResult => Object.freeze({
    damage, roll, critical: context.move.category !== "Status" && effectiveness !== 0 && (context.critical ?? false),
    effectiveness,
  });
  if (context.move.category === "Status" || effectiveness === 0) {
    return Object.freeze(rolls.map(roll => result(roll, 0)));
  }
  const battle = isolatedBattle();
  try {
    battle.setPlayer("p1", { name: "p1", team: [pokemonSet("Mew", { level: context.attacker.level })] });
    battle.setPlayer("p2", { name: "p2", team: [pokemonSet("Mew", { level: context.defender.level })] });
    if (battle.requestState === "teampreview") battle.makeChoices("team 1", "team 1");
    const attacker = battle.p1.pokemon[0];
    const defender = battle.p2.pokemon[0];
    applyContext(attacker, context.attacker);
    applyContext(defender, context.defender);

    return Object.freeze(rolls.map(roll => {
      const move = dex.getActiveMove(new Dex.Move({
        name: "Damage query", type: typeName(context.move.type), category: context.move.category,
        basePower: context.move.basePower, accuracy: true, pp: 1, priority: 0,
        target: "normal", flags: {}, willCrit: context.critical ?? false,
      }));
      // randomizer upstream calcula 100 - random(16). Injetar esta palavra de
      // 32 bits seleciona exatamente o roll solicitado, sem copiar sua fórmula.
      // Este contexto de consulta nunca é serializado nem reutilizado em partidas.
      battle.prng.rng.next = () => (100 - roll) * 0x10000000;
      battle.setActiveMove(move, attacker, defender);
      const damage = battle.actions.getDamage(attacker, defender, move, true);
      battle.clearActiveMove(true);
      if (typeof damage !== "number" || !Number.isFinite(damage)) {
        throw new Error("O simulador não retornou dano numérico para a consulta.");
      }
      return result(roll, damage);
    }));
  } finally {
    battle.destroy();
  }
}
