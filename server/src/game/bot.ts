import { moveById, speciesById } from "../contracts/catalog";
import type { Difficulty } from "../contracts/trainers";
import { effectiveness, randomInt } from "./engine";
import type { BattleChoice, BattleEvent, BattleView, OwnPokemon, PublicPokemon, RNG, TypeId } from "./engine";

const stage = (value = 0) => value >= 0 ? (2 + value) / 2 : 2 / (2 - value);
// Public combatants can temporarily have zero or three types (Burn Up / Forest's Curse).
const typeFactor = (attack: TypeId, defense: readonly TypeId[]) => defense.reduce((factor, type) => factor * effectiveness(attack, [type]), 1);
/** Receives the bot's own view and public events only; never pending choices. */
export function botChoice(view: BattleView, events: readonly BattleEvent[], difficulty: Difficulty, rng: RNG): BattleChoice {
  const request = view.request;
  if (!request || request.submitted) throw new Error("Bot sem solicitação.");
  const legal = request.moves.filter(move => !move.disabled && (move.pp > 0 || move.id === "struggle" || request.lockedMoveId === move.id));
  const fallback: BattleChoice | undefined = request.kind === "move" && legal.length
    ? { type: "move", moveId: legal[0].id }
    : request.switches.length ? { type: "switch", combatantId: request.switches[0] } : undefined;
  if (!fallback) throw new Error("Bot sem ação legal.");
  if (difficulty === "easy") return request.kind === "move" && legal.length
    ? { type: "move", moveId: legal[randomInt(rng, 0, legal.length)].id }
    : { type: "switch", combatantId: request.switches[randomInt(rng, 0, request.switches.length)] };
  const active = view.ownTeam.find(pokemon => pokemon.id === view.active.p2);
  const opponent = view.opponentTeam.find(pokemon => pokemon.id === view.active.p1);
  if (!active || !opponent || "hidden" in opponent) return fallback;
  // Fixed operation budget keeps decisions deterministic even under scheduler contention.
  let remaining = 96;
  const estimate = (pokemon: OwnPokemon, moveId: string, target: PublicPokemon) => {
    if (--remaining < 0) return -Infinity;
    const move = moveById(moveId);
    if (!move) return 1;
    const effect = typeFactor(move.type, target.types);
    if (move.category === "Status") {
      if (move.heal) return pokemon.hp < pokemon.maxHp * .55 ? 75 * (1 - pokemon.hp / pokemon.maxHp) : -20;
      if (move.status) return target.status || effect === 0 ? -25 : 18;
      if (move.boosts && (move.target === "self" || move.selfBoosts)) {
        return pokemon.hp > pokemon.maxHp * .65 && Object.entries(move.boosts).some(([stat, n]) => n > 0 && (pokemon.boosts[stat as keyof typeof pokemon.boosts] ?? 0) < 2) ? 14 : -20;
      }
      return -10;
    }
    const physical = move.category === "Physical";
    const attack = pokemon.stats[physical ? "atk" : "spa"] * stage(pokemon.boosts[physical ? "atk" : "spa"]);
    const defense = (speciesById(target.speciesId)?.stats[physical ? "def" : "spd"] ?? 100) * stage(target.boosts[physical ? "def" : "spd"]);
    const stab = pokemon.types.includes(move.type) ? pokemon.ability === "adaptability" ? 2 : 1.5 : 1;
    const power = move.basePower || 60;
    const damage = ((22 * power * attack / Math.max(1, defense)) / 50 + 2) * stab * effect * (physical && pokemon.status === "brn" ? .5 : 1) * .925;
    const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
    return damage * accuracy + (damage >= target.hp ? 30 : 0) + move.priority * 2 - (move.charge || move.recharge ? 20 : 0) - (move.recoil ? damage * move.recoil[0] / move.recoil[1] * .2 : 0);
  };
  let best = fallback, bestScore = -Infinity;
  for (const move of legal) {
    if (remaining <= 0) break;
    const score = estimate(active, move.id, opponent);
    if (score > bestScore) { best = { type: "move", moveId: move.id }; bestScore = score; }
  }
  const observed = [...new Set(events.filter(event => event.type === "move" && event.actor === opponent.id).map(event => event.type === "move" ? event.moveId : ""))].slice(-16);
  const switchScore = (pokemon: OwnPokemon) => {
    const offense = Math.max(0, ...pokemon.moves.filter(move => !move.disabled && move.pp > 0).map(move => estimate(pokemon, move.id, opponent)));
    const danger = Math.max(0, ...observed.map(id => {
      if (--remaining < 0) return 0;
      const move = moveById(id);
      return move && move.category !== "Status" ? typeFactor(move.type, pokemon.types) : 0;
    }));
    return offense + pokemon.hp / pokemon.maxHp * 15 - danger * 18;
  };
  if (request.kind !== "move" || difficulty === "hard") {
    const currentScore = switchScore(active);
    for (const id of request.switches) {
      if (remaining <= 0) break;
      const candidate = view.ownTeam.find(pokemon => pokemon.id === id);
      if (!candidate) continue;
      const score = switchScore(candidate);
      if (request.kind !== "move" ? score > bestScore : score > currentScore + 35 && score > bestScore + 20) {
        best = { type: "switch", combatantId: id }; bestScore = score;
      }
    }
  }
  return best;
}
