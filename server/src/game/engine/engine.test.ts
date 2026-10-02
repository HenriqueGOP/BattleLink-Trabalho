import assert from "node:assert/strict";
import { calculate, Generations, Move as CalcMove, Pokemon as CalcPokemon, toID } from "@smogon/calc";
import {
  accuracyMultiplier, calculateDamage, calculateDamageRange, calculateStats, createBattleRngs,
  createRng, DAMAGE_ROLLS, effectiveness, NATURE_IDS, randomChance, randomInt, restoreRng,
  stageMultiplier, STAT_IDS, TYPE_IDS,
} from "./index";
import type { Combatant, DamageContext, DamageRoll, NatureId, PokemonTypes, RNG, RngSeed, Stats, TypeId } from "./index";
import { simulatorPrng } from "./adapters/showdown-rng";
import { runBattleTests } from "./battle.test";

const gen = Generations.get(9);
const seed: RngSeed = [1, 2, 3, 4];
const stats: Stats = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
const normal: Combatant = { level: 50, types: ["normal"], stats };
const neutral: DamageContext = {
  attacker: normal, defender: normal,
  move: { type: "water", category: "Physical", basePower: 80 },
};

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Somente fixtures de teste; palavras forçadas não são snapshots de uma partida. */
function forcedRng(word: number): RNG {
  return { nextUint32: () => word, snapshot: () => ({ algorithm: "showdown-gen5", seed }) };
}

function testRng(): void {
  const first = createRng(seed);
  const second = createRng(seed);
  let reference = seed.reduce((state, word) => (state << 16n) | BigInt(word), 0n);
  for (let i = 0; i < 1000; i++) {
    reference = BigInt.asUintN(64, reference * 0x5D588B656C078965n + 0x269EC3n);
    const expected = Number(reference >> 32n);
    assert.equal(first.nextUint32(), expected, "Gen5 deve seguir a sequência de referência de 64 bits");
    assert.equal(second.nextUint32(), expected);
  }
  const snapshot = first.snapshot();
  const restored = restoreRng(snapshot);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.seed));
  for (let i = 0; i < 100; i++) assert.equal(first.nextUint32(), restored.nextUint32());
  const streams = createBattleRngs(seed);
  const independent = createBattleRngs(seed);
  const combatBefore = streams.combat.snapshot();
  for (let i = 0; i < 500; i++) {
    streams.presentation.nextUint32();
    streams.teams.nextUint32();
  }
  assert.deepEqual(streams.combat.snapshot(), combatBefore);
  assert.equal(streams.combat.nextUint32(), independent.combat.nextUint32());
  assert.notDeepEqual(independent.combat.snapshot(), independent.teams.snapshot());
  assert.notDeepEqual(independent.teams.snapshot(), independent.presentation.snapshot());
  const sim = simulatorPrng(second);
  const expected = restoreRng(second.snapshot());
  for (let i = 0; i < 100; i++) assert.equal(sim.random(16), randomInt(expected, 0, 16));
  assert.deepEqual(second.snapshot(), expected.snapshot(), "O adapter deve avançar o RNG injetado");
  assert.equal(randomInt(forcedRng(0), 85, 101), 85);
  assert.equal(randomInt(forcedRng(0xffffffff), 85, 101), 100);
  assert.equal(randomInt(forcedRng(0), -6, 1), -6);
  assert.equal(randomInt(forcedRng(0xffffffff), -6, 1), 0);
  assert.equal(randomChance(forcedRng(0), 10, 100), true);
  assert.equal(randomChance(forcedRng(0xffffffff), 10, 100), false);
  assert.equal(randomChance(forcedRng(0), 0, 100), false);
  assert.equal(randomChance(forcedRng(0xffffffff), 100, 100), true);
  assert.throws(() => createRng([1, 2, 3, -1]), RangeError);
  assert.throws(() => createRng([1, 2, 3, 65536]), RangeError);
  assert.throws(() => createRng([1, 2, 3, NaN]), RangeError);
  assert.throws(() => randomInt(first, 5, 5), RangeError);
  assert.throws(() => randomInt(first, -1, 0x100000000), RangeError);
  assert.throws(() => randomChance(first, 101, 100), RangeError);
  assert.throws(() => randomChance(first, 1, 0), RangeError);
  assert.throws(() => randomInt(forcedRng(-1), 0, 16), RangeError);
}

function testStats(): number {
  assert.deepEqual(calculateStats("pikachu"), { hp: 110, atk: 75, def: 60, spa: 70, spd: 70, spe: 110 });
  assert.equal(calculateStats("shedinja").hp, 1);
  let samples = 0;
  for (const id of ["pikachu", "charizard", "blastoise", "blissey", "deoxys", "shedinja"]) {
    const species = gen.species.get(toID(id));
    assert.ok(species);
    for (const nature of NATURE_IDS) {
      const oracleNature = gen.natures.get(toID(nature));
      assert.ok(oracleNature);
      for (const level of [1, 50, 100]) {
        for (const trained of [false, true]) {
          const build = freeze({
            level, nature,
            ivs: { hp: 0, atk: 1, def: 15, spa: 30, spd: 31, spe: 31 },
            evs: trained ? { hp: 4, atk: 252, def: 1, spa: 0, spd: 1, spe: 252 } : {},
          });
          const oracle = new CalcPokemon(gen, species.name, { ...build, nature: oracleNature.name });
          assert.deepEqual(calculateStats(id, build), oracle.rawStats, `${id}/${nature}/${level}/${trained}`);
          samples++;
        }
      }
    }
  }
  for (let stage = -6; stage <= 6; stage++) {
    assert.equal(stageMultiplier(stage), stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
    assert.equal(accuracyMultiplier(stage), stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage));
  }
  assert.throws(() => stageMultiplier(7), RangeError);
  assert.throws(() => accuracyMultiplier(-7), RangeError);
  assert.throws(() => calculateStats("pikachu", { level: 0 }), RangeError);
  assert.throws(() => calculateStats("pikachu", { ivs: { hp: 32 } }), RangeError);
  assert.throws(() => calculateStats("pikachu", { evs: { hp: 252, atk: 252, def: 7 } }), RangeError);
  assert.throws(() => calculateStats("pikachu", { evs: { hp: 253 } }), RangeError);
  assert.throws(() => calculateStats("pikachu", { nature: "unknown" as NatureId }), RangeError);
  assert.throws(() => calculateStats("unknown"), RangeError);
  assert.throws(() => calculateStats("charizardmegax"), RangeError);
  assert.throws(() => calculateStats("../../pikachu"), RangeError);
  return samples;
}

function oracleType(id: TypeId) {
  const type = gen.types.get(toID(id));
  assert.ok(type);
  return type;
}

function testTypes(): void {
  assert.equal(TYPE_IDS.length, 18);
  for (const attack of TYPE_IDS) {
    for (const defense of TYPE_IDS) {
      assert.equal(effectiveness(attack, [defense]), oracleType(attack).effectiveness[oracleType(defense).name], `${attack}/${defense}`);
    }
  }
  assert.equal(effectiveness("ice", ["dragon", "flying"]), 4);
  assert.equal(effectiveness("fire", ["water", "dragon"]), 0.25);
  assert.equal(effectiveness("electric", ["water", "ground"]), 0);
  assert.throws(() => effectiveness("stellar" as TypeId, ["normal"]), RangeError);
  assert.throws(() => effectiveness("fire", ["water", "water"]), RangeError);
}

function testDamageExamples(): void {
  const range = calculateDamageRange(freeze(neutral));
  assert.equal(range.length, 16);
  assert.deepEqual(range.map(value => value.roll), DAMAGE_ROLLS);
  assert.equal(range[0].damage, 31);
  assert.equal(range[15].damage, 37);
  assert.ok(Object.isFrozen(range) && range.every(Object.isFrozen));
  for (const result of range) assert.deepEqual(calculateDamage({ ...neutral, roll: result.roll }), result);
  const max = (context: DamageContext) => calculateDamage({ ...context, roll: 100 }).damage;
  assert.equal(max({ ...neutral, critical: true }), 55);
  assert.equal(max({ ...neutral, attacker: { ...normal, types: ["water"] } }), 55, "STAB usa arredondamento de meio para baixo");
  assert.equal(max({ ...neutral, attacker: { ...normal, types: ["water"], ability: "adaptability" } }), 74);
  assert.equal(max({ ...neutral, attacker: { ...normal, ability: "adaptability" } }), 37, "Adaptability não cria STAB");
  assert.equal(max({ ...neutral, attacker: { ...normal, status: "brn" } }), 18);
  assert.equal(max({ ...neutral, move: { ...neutral.move, category: "Special" }, attacker: { ...normal, status: "brn" } }), 37);
  assert.equal(max({ ...neutral, defender: { ...normal, types: ["fire", "rock"] } }), 148);
  assert.equal(max({ ...neutral, defender: { ...normal, types: ["water", "dragon"] } }), 9);
  assert.equal(max({ ...neutral, move: { ...neutral.move, type: "electric" }, defender: { ...normal, types: ["ground"] } }), 0);
  assert.equal(max({ ...neutral, move: { ...neutral.move, category: "Status", basePower: 0 } }), 0);
  assert.equal(max({ ...neutral, attacker: { ...normal, level: 1, stats: { ...stats, atk: 1 } }, move: { ...neutral.move, basePower: 1 } }), 2);
  assert.equal(calculateDamage({ ...neutral, attacker: { ...normal, level: 1, stats: { ...stats, atk: 1 }, status: "brn" }, move: { ...neutral.move, basePower: 1 }, roll: 85 }).damage, 1);
  const badBoosts: DamageContext = {
    ...neutral, attacker: { ...normal, boosts: { atk: -6 } }, defender: { ...normal, boosts: { def: 6 } },
  };
  assert.ok(max(badBoosts) < 37);
  assert.equal(max({ ...badBoosts, critical: true }), 55, "Crítico ignora queda ofensiva e aumento defensivo");
  assert.ok(max({ ...neutral, critical: true, attacker: { ...normal, boosts: { atk: 2 } } }) > 55);
  assert.ok(max({ ...neutral, critical: true, defender: { ...normal, boosts: { def: -2 } } }) > 55);
  // Regressão: Custom Game usa Math.trunc e perde o overflow de 16 bits.
  // Esta fixture extrema deve continuar passando mesmo se as amostras mudarem.
  const overflow: DamageContext = {
    attacker: { level: 100, types: ["flying", "dark"], stats: { hp: 313, atk: 329, def: 116, spa: 160, spd: 237, spe: 528 }, boosts: { atk: 6 }, status: "brn" },
    defender: { level: 1, types: ["dragon", "rock"], stats: { hp: 12, atk: 8, def: 4, spa: 9, spd: 8, spe: 9 }, boosts: { def: -4 } },
    critical: true, move: { type: "water", category: "Physical", basePower: 110 },
  };
  assert.equal(calculateDamage({ ...overflow, roll: 85 }).damage, 11984);
  assert.equal(calculateDamage({ ...overflow, roll: 100 }).damage, 25664);
  const request = freeze({ ...neutral, roll: 100 as const });
  const before = JSON.stringify(request);
  const first = calculateDamage(request);
  calculateDamage({ ...request, critical: true });
  assert.deepEqual(calculateDamage(request), first, "Consultas intercaladas não compartilham estado");
  assert.equal(JSON.stringify(request), before);
  for (const roll of [84, 101, 85.5, NaN, Infinity]) {
    assert.throws(() => calculateDamage({ ...neutral, roll: roll as DamageRoll }), RangeError);
  }
  assert.throws(() => max({ ...neutral, attacker: { ...normal, boosts: { atk: 7 } } }), RangeError);
  assert.throws(() => max({ ...neutral, defender: { ...normal, stats: { ...stats, def: 0 } } }), RangeError);
  assert.throws(() => max({ ...neutral, move: { ...neutral.move, basePower: NaN } }), RangeError);
}

function testDamageOracle(): number {
  const rng = createRng([42, 7, 19, 2026]);
  const makePokemon = (sample: number, attacking: boolean): { input: Combatant; oracle: CalcPokemon } => {
    const type1 = TYPE_IDS[randomInt(rng, 0, TYPE_IDS.length)];
    const type2 = TYPE_IDS[randomInt(rng, 0, TYPE_IDS.length)];
    const types: PokemonTypes = type1 === type2 ? [type1] : [type1, type2];
    const calcTypes: CalcPokemon["types"] = types.length === 1
      ? [oracleType(types[0]).name] : [oracleType(types[0]).name, oracleType(types[1]).name];
    const baseStats = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
    for (const stat of STAT_IDS) baseStats[stat] = randomInt(rng, 2, 256);
    const ability = attacking && sample % 3 === 0 ? "adaptability" : "none";
    const status = sample % 2 === 0 ? "brn" : undefined;
    const nature = gen.natures.get(toID(NATURE_IDS[sample % NATURE_IDS.length]));
    assert.ok(nature);
    const oracle = new CalcPokemon(gen, "Mew", {
      level: [1, 50, 100][sample % 3], nature: nature.name,
      ability: ability === "adaptability" ? "Adaptability" : "No Ability", item: "", status,
      boosts: { atk: randomInt(rng, -6, 7), def: randomInt(rng, -6, 7), spa: randomInt(rng, -6, 7), spd: randomInt(rng, -6, 7) },
      overrides: { types: calcTypes, baseStats },
    });
    return {
      oracle,
      input: { level: oracle.level, types, stats: { ...oracle.rawStats }, ability, status, boosts: { ...oracle.boosts } },
    };
  };
  const samples = 360;
  for (let i = 0; i < samples; i++) {
    const attacker = makePokemon(i, true);
    const defender = makePokemon(i + 1, false);
    const context: DamageContext = freeze({
      attacker: attacker.input, defender: defender.input, critical: i % 2 === 0,
      move: { type: i % 3 === 0 ? attacker.input.types[0] : TYPE_IDS[i % 18], category: i % 4 < 2 ? "Physical" : "Special", basePower: randomInt(rng, 1, 151) },
    });
    const move = new CalcMove(gen, "Tackle", {
      isCrit: context.critical,
      overrides: { basePower: context.move.basePower, type: oracleType(context.move.type).name, category: context.move.category },
    });
    const oracle = calculate(gen, attacker.oracle, defender.oracle, move).damage;
    const expected = typeof oracle === "number" ? DAMAGE_ROLLS.map(() => oracle) : oracle;
    const actual = calculateDamageRange(context).map(result => result.damage);
    assert.deepEqual(actual, expected, `Amostra ${i}: ${JSON.stringify(context)}`);
    assert.ok(actual.every(damage => Number.isInteger(damage) && damage >= 0));
  }
  return samples;
}

function testIsolation(): void {
  const previousRandom = Math.random;
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  const rng = createRng(seed);
  const before = rng.snapshot();
  try {
    Math.random = () => { throw new Error("Aleatoriedade global proibida no novo motor"); };
    globalThis.fetch = () => { throw new Error("Rede proibida no novo motor"); };
    Date.now = () => 1000;
    const first = calculateDamageRange(neutral);
    Date.now = () => 987654321000;
    assert.deepEqual(calculateDamageRange(neutral), first, "Relógio upstream não pode influenciar resultados");
    calculateStats("pikachu");
    createBattleRngs(seed).combat.nextUint32();
    assert.deepEqual(rng.snapshot(), before, "Consulta não pode consumir RNG externo");
  } finally {
    Math.random = previousRandom;
    globalThis.fetch = previousFetch;
    Date.now = previousNow;
  }
}

testRng();
const statSamples = testStats();
testTypes();
testDamageExamples();
const damageSamples = testDamageOracle();
testIsolation();
console.log(`Engine 2A tests passed: ${statSamples} stat builds, 324 type pairs, ${damageSamples} damage samples x 16 rolls, RNG and isolation.`);
runBattleTests();
