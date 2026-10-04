import assert from "node:assert/strict";
import { TRAINERS, DIFFICULTIES } from "./contracts/trainers";
import { trainerTeam } from "./game/trainers";
import { botChoice } from "./game/bot";
import { BattleSession, createRng, effectiveness, type BattleChoice, type BattleView } from "./game/engine";
import { moveById } from "./contracts/catalog";

function humanChoice(view: BattleView): BattleChoice {
  const request = view.request!;
  if (request.kind !== "move") return { type: "switch", combatantId: request.switches[0] };
  const target = view.opponentTeam.find(pokemon => pokemon.id === view.active.p2);
  const types = target && !("hidden" in target) ? target.types : [];
  const moves = request.moves.filter(move => !move.disabled && (move.pp > 0 || move.id === "struggle" || request.lockedMoveId === move.id));
  const score = (id: string) => { const move = moveById(id); return !move || move.category === "Status" ? -1 : (move.basePower || 60) * types.reduce((factor, type) => factor * effectiveness(move.type, [type]), 1); };
  moves.sort((a, b) => score(b.id) - score(a.id));
  return { type: "move", moveId: moves[0].id };
}
let completed = 0;
for (const trainer of TRAINERS) for (const format of [{ id: "quick" }, { id: "classic" }, { id: "monotype", type: trainer.type }] as const) for (const difficulty of DIFFICULTIES) {
  const team = trainerTeam(trainer.id, format);
  const battle = new BattleSession({ teams: [team, team], seed: [1, 2, 3, 4] });
  const rng = createRng([9, 8, 7, 6]);
  let choices = 0;
  while (!battle.getView("p1").result && choices < 1600) {
    for (const side of ["p1", "p2"] as const) {
      const view = battle.getView(side), request = view.request;
      if (!request || request.submitted) continue;
      const choice = side === "p2" ? botChoice(view, battle.getEvents("p2"), difficulty, rng) : humanChoice(view);
      if (choice.type === "move") assert.ok(request.moves.some(move => !move.disabled && move.id === choice.moveId));
      else assert.ok(request.switches.includes(choice.combatantId));
      battle.submit({ side, requestId: request.id, actionId: `${side}-${request.id}`, choice }); choices++;
      assert.ok(battle.getView(side).ownTeam.every(pokemon => pokemon.hp >= 0 && pokemon.hp <= pokemon.maxHp && pokemon.moves.every(move => move.pp >= 0)));
    }
  }
  assert.ok(battle.getView("p1").result, `${trainer.id}/${format.id}/${difficulty}: battle must finish, including PP exhaustion and forced switches`);
  completed++; battle.destroy();
}
// The bot's public view is identical before and after the human submits a private choice.
const team = trainerTeam("vespera", { id: "quick" });
const battle = new BattleSession({ teams: [team, team], seed: [1, 2, 3, 4] });
const before = botChoice(battle.getView("p2"), battle.getEvents("p2"), "hard", createRng([7, 6, 5, 4]));
const view = battle.getView("p1");
battle.submit({ side: "p1", requestId: view.request!.id, actionId: "private", choice: humanChoice(view) });
assert.deepEqual(botChoice(battle.getView("p2"), battle.getEvents("p2"), "hard", createRng([7, 6, 5, 4])), before);
battle.destroy();
console.log(`Bot policies passed: ${completed} complete trainer/format/difficulty battles, HP/PP invariants, mandatory switches, legal decisions and no access to pending human choices.`);
