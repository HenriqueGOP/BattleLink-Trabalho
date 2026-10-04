import assert from "node:assert/strict";
import { Dex } from "@pkmn/sim";
import { BattleSession, BattleRuleError, getMove, listMoves, replayBattle } from "./battle";
import type { BattleChoice, BattleEvent, BattleSetup, ChoiceSubmission, EngineOptions, SideId, SimpleMoveDefinition, TeamSet } from "./battle-types";
import { createRng } from "./rng";
import type { RNG, RngSeed } from "./types";
import { immutable } from "./immutable";

const SEED: RngSeed = [1, 2, 3, 4];
const MAX = 0xffffffff;
class FixedRng implements RNG {
  word = MAX;
  nextUint32(): number { return this.word; }
  snapshot() { return { algorithm: "showdown-gen5" as const, seed: SEED }; }
}
const set = (moves: readonly string[], options: Partial<TeamSet> = {}): TeamSet => ({ speciesId: "smeargle", moves, ...options });
const move = (moveId: string): BattleChoice => ({ type: "move", moveId });
function battle(left: TeamSet, right: TeamSet, options: EngineOptions = {}, leftBench: TeamSet[] = [], rightBench: TeamSet[] = []) {
  return new BattleSession({ seed: SEED, teams: [[left, ...leftBench], [right, ...rightBench]] }, options);
}
function send(session: BattleSession, side: SideId, choice: BattleChoice) {
  const request = session.getView(side).request;
  assert.ok(request, `${side} precisa de uma solicitação`);
  return session.submit({ side, requestId: request.id, actionId: `${side}_${request.id}`, choice });
}
function round(session: BattleSession, left: string, right: string): readonly BattleEvent[] {
  const after = session.getView("p1").sequence;
  send(session, "p1", move(left)); send(session, "p2", move(right));
  return session.getEvents("p1", after);
}
function pp(session: BattleSession, side: SideId, id: string): number {
  return session.getView(side).ownTeam[0].moves.find(entry => entry.id === id)!.pp;
}
function hasError(code: string) { return (error: unknown) => error instanceof BattleRuleError && error.code === code; }
function damages(events: readonly BattleEvent[], target?: string) {
  return events.filter((event): event is Extract<BattleEvent, { type: "damage" | "heal" }> => event.type === "damage" && (!target || event.target === target));
}
function uses(events: readonly BattleEvent[]) { return events.filter(event => event.type === "move"); }

function catalogTests(): void {
  const catalog = listMoves();
  assert.equal(catalog.length, 954, "Atualização do dataset exige revisar capacidades e fixtures");
  assert.ok(Object.isFrozen(catalog) && catalog.every(Object.isFrozen));
  for (const id of ["quickattack", "protect", "gigadrain", "doubleedge", "bulletseed", "solarbeam", "hyperbeam", "rest", "icebeam", "airslash", "substitute", "taunt", "disable", "uturn", "roar", "batonpass", "encore", "revivalblessing", "sleeptalk", "metronome"]) {
    assert.equal(getMove(id)?.support.supported, true, `${id} deve estar completo`);
  }
  assert.equal(getMove("protect")?.accuracy, true);
  assert.equal(getMove("quickattack")?.priority, 1);
  assert.equal(getMove("leafblade")?.critRatio, 2);
  assert.equal(getMove("icebeam")?.secondaries[0].chance, 10);
  assert.equal(getMove("airslash")?.secondaries[0].chance, 30);
  assert.deepEqual(getMove("bulletseed")?.multihit, [2, 5]);
  assert.deepEqual(getMove("gigadrain")?.drain, [1, 2]);
  assert.deepEqual(getMove("doubleedge")?.recoil, [33, 100]);
  assert.ok(getMove("rest")?.hooks.includes("onHit"));
  for (const id of ["sunnyday", "chillyreception", "grassyterrain", "spikes", "stoneaxe", "ceaselessedge", "skillswap", "doodle", "fling", "trick", "transform", "relicsong", "hyperspacefury", "maxflare", "infernooverdrive"]) {
    assert.equal(getMove(id)?.support.supported, false, `${id} deve ser bloqueado`);
    assert.throws(() => battle(set([id]), set(["splash"])), hasError("INVALID_TEAM"));
  }
  assert.equal(getMove("https://example.com/attack"), undefined);
  assert.throws(() => battle(set(["tackle"], { speciesId: "mew" }), set(["splash"])), hasError("INVALID_TEAM"));
  assert.throws(() => battle(set(["splash"]), set(["splash"]), {}, [set(["splash"])]), hasError("INVALID_TEAM"));
  const custom: SimpleMoveDefinition = { id: "teststrike", name: "Test Strike", type: "water", category: "Physical", basePower: 80, accuracy: true, pp: 15 };
  const added = battle(set([custom.id]), set(["splash"]), { additionalMoves: [custom] });
  assert.ok(damages(round(added, custom.id, "splash"), "p2s0").length === 1);
  assert.equal(getMove(custom.id), undefined, "Extensão não pode poluir o registro global");
  added.destroy();
}

function requestsAndReplayTests(): void {
  const setup: BattleSetup = immutable({ seed: SEED, teams: [
    [set(["splash", "quickattack"]), set(["protect"], { speciesId: "pikachu" })],
    [set(["splash", "quickattack"]), set(["protect"], { speciesId: "eevee" })],
  ] });
  const session = new BattleSession(setup);
  const before = session.getView("p2");
  const command: ChoiceSubmission = { side: "p1", requestId: 1, actionId: "one", choice: move("quickattack") };
  assert.equal(session.submit(command).resolved, false);
  assert.deepEqual(session.getView("p2"), before, "Escolha pendente não pode vazar");
  assert.equal(session.getView("p1").request?.submitted, true);
  assert.equal(session.submit(command).duplicate, true);
  assert.equal(session.submit({ ...command, choice: { moveId: "quickattack", type: "move" } }).duplicate, true, "Ordem de propriedades JSON não altera idempotência");
  assert.throws(() => session.submit({ ...command, choice: move("splash") }), hasError("INVALID_ACTION"));
  assert.throws(() => session.submit({ ...command, actionId: "two" }), hasError("ALREADY_SUBMITTED"));
  assert.deepEqual(session.getView("p2").opponentTeam[1], { id: "p1s1", hidden: true });
  assert.equal(JSON.stringify(before.opponentTeam).includes("pikachu"), false);
  assert.equal("moves" in before.opponentTeam[0], false);
  const opponent: ChoiceSubmission = { side: "p2", requestId: 1, actionId: "other", choice: move("splash") };
  session.submit(opponent);
  assert.throws(() => session.submit({ ...opponent, actionId: "late" }), hasError("STALE_REQUEST"));
  const clean = session.getView("p2");
  assert.throws(() => send(session, "p2", move("splash, move tackle")), hasError("INVALID_ACTION"));
  assert.deepEqual(session.getView("p2"), clean, "Rejeição não pode mutar HP/PP/solicitações");
  for (const malformed of [null, {}, { ...opponent, actionId: 123 }, { ...opponent, choice: null },
    { ...opponent, requestId: NaN }, { ...opponent, choice: { type: "switch", combatantId: "p3s0" } }]) {
    assert.throws(() => session.submit(malformed as unknown as ChoiceSubmission), hasError("INVALID_ACTION"));
    assert.deepEqual(session.getView("p2"), clean);
  }
  const events = session.getEvents("p1");
  assert.ok(events.every(Object.isFrozen));
  assert.ok(!JSON.stringify(events).match(/https?:|\"seed\"|\|split\||\|request\||t:/));
  const actions = [command, opponent];
  assert.deepEqual(replayBattle(setup, actions), replayBattle(setup, [...actions].reverse()), "Ordem de chegada não pode decidir desempate");
  const now = Date.now;
  const random = Math.random;
  const fetch = globalThis.fetch;
  try {
    Date.now = () => 1;
    Math.random = () => { throw new Error("RNG global proibido"); };
    globalThis.fetch = () => { throw new Error("Rede proibida"); };
    const first = replayBattle(setup, actions);
    Date.now = () => 999999999;
    assert.deepEqual(replayBattle(setup, actions), first);
  } finally { Date.now = now; Math.random = random; globalThis.fetch = fetch; }
  session.forfeit("p2");
  assert.deepEqual(session.getView("p1").result, { winner: "p1", reason: "forfeit" });
  assert.throws(() => session.submit({ side: "p1", requestId: 2, actionId: "after", choice: move("splash") }), hasError("FINISHED"));
  session.destroy(); session.destroy();
}

function orderAndProtectTests(): void {
  const rng = new FixedRng();
  const priority = battle(set(["quickattack"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
  const moves = uses(round(priority, "quickattack", "splash"));
  assert.equal(moves[0].actor, "p1s0", "Prioridade vence Speed"); priority.destroy();
  const speed = battle(set(["splash"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
  assert.equal(uses(round(speed, "splash", "splash"))[0].actor, "p2s0"); speed.destroy();
  const protect = battle(set(["protect"]), set(["quickattack"]), { rng });
  const first = round(protect, "protect", "quickattack");
  assert.equal(damages(first).length, 0);
  assert.equal(pp(protect, "p1", "protect"), 9);
  assert.equal(damages(round(protect, "protect", "quickattack")).length, 1, "Segundo Protect falha com RNG alto");
  protect.destroy();
  rng.word = 0;
  const success = battle(set(["protect"]), set(["quickattack"]), { rng });
  assert.equal(damages(round(success, "protect", "quickattack")).length, 0);
  assert.equal(damages(round(success, "protect", "quickattack")).length, 0, "Segundo Protect pode passar"); success.destroy();
  const capped = battle(set(["protect"]), set(["tackle"], { level: 1 }), { rng });
  for (let i = 0; i < 7; i++) round(capped, "protect", "tackle");
  rng.word = Math.floor(0x100000000 / 1000); // passa em 1/729, falharia em 1/2187
  assert.equal(damages(round(capped, "protect", "tackle")).length, 0, "Penalidade consecutiva limitada a 729"); capped.destroy();
}

function speedModifiersAndTrickRoomTests(): void {
  const rng = new FixedRng();
  const fast = { evs: { spe: 252 } };
  const stages = battle(set(['agility','splash']),set(['scaryface','splash'],fast),{rng});
  assert.equal(uses(round(stages,'agility','splash'))[0].actor,'p2s0');
  assert.equal(stages.getView('p1').ownTeam[0].boosts.spe,2);
  assert.equal(uses(round(stages,'splash','scaryface'))[0].actor,'p1s0');
  assert.equal(stages.getView('p1').ownTeam[0].boosts.spe,0);
  assert.equal(uses(round(stages,'splash','splash'))[0].actor,'p2s0'); stages.destroy();
  const wind=battle(set(['tailwind','splash']),set(['splash'],fast),{rng});
  round(wind,'tailwind','splash');
  assert.ok(wind.getView('p1').sideConditions.p1.includes('tailwind'));
  for (let i=0;i<3;i++) assert.equal(uses(round(wind,'splash','splash'))[0].actor,'p1s0');
  assert.ok(!wind.getView('p1').sideConditions.p1.includes('tailwind'));
  assert.equal(uses(round(wind,'splash','splash'))[0].actor,'p2s0'); wind.destroy();
  const room=battle(set(['trickroom','splash']),set(['quickattack','splash'],fast),{rng});
  assert.equal(getMove('trickroom')?.support.supported,true);
  assert.equal(uses(round(room,'trickroom','splash'))[0].actor,'p2s0','Trick Room move priority is -7');
  assert.ok(room.getView('p1').fieldConditions.includes('trickroom'));
  assert.equal(uses(round(room,'splash','splash'))[0].actor,'p1s0','Lower effective speed wins within priority');
  assert.equal(uses(round(room,'splash','quickattack'))[0].actor,'p2s0','Trick Room does not invert priority');
  round(room,'trickroom','splash');
  assert.ok(!room.getView('p1').fieldConditions.includes('trickroom'),'Second use ends the field effect');
  assert.equal(uses(round(room,'splash','splash'))[0].actor,'p2s0');
  round(room,'trickroom','splash');
  assert.ok(room.getView('p1').fieldConditions.includes('trickroom'),'Reapplication after cancellation starts a new duration');
  assert.equal(uses(round(room,'splash','splash'))[0].actor,'p1s0'); room.destroy();
  const expiry=battle(set(['trickroom','splash']),set(['splash'],fast),{rng});
  round(expiry,'trickroom','splash');
  for (let i=0;i<4;i++) assert.equal(uses(round(expiry,'splash','splash'))[0].actor,'p1s0');
  assert.ok(!expiry.getView('p1').fieldConditions.includes('trickroom'));
  assert.equal(uses(round(expiry,'splash','splash'))[0].actor,'p2s0'); expiry.destroy();
  const slower=battle(set(['scaryface','splash'],fast),set(['splash']),{rng});
  const changed=round(slower,'scaryface','splash');
  assert.ok(changed.findIndex(event=>event.type==='boost'&&event.stat==='spe')<changed.findIndex(event=>event.type==='move'&&event.actor==='p2s0'),'Speed boost event precedes the remaining action');
  slower.destroy();
  const tiedWinners = new Set<string>();
  for (let seedPart = 0; seedPart < 32; seedPart++) {
    const tieRng = createRng([seedPart,2,3,4]);
    const tie = battle(set(['splash']),set(['splash']),{rng:tieRng});
    tiedWinners.add(uses(round(tie,'splash','splash'))[0].actor);
    tie.destroy();
  }
  assert.equal(tiedWinners.size,2,'Equal-speed order is decided by injected RNG, not a fixed side');
  console.log('Turn order passed: speed stages, Tailwind expiry, Trick Room priority/activation/restart/expiry, and mid-round speed events.');
}

function statusTests(): void {
  const rng = new FixedRng(); rng.word = 0;
  for (const [moveId, status] of [["willowisp", "brn"], ["toxic", "tox"], ["poisonpowder", "psn"], ["thunderwave", "par"]] as const) {
    const session = battle(set([moveId], { level: 100 }), set(["splash"], { level: 50 }), { rng });
    const events = round(session, moveId, "splash");
    const target = session.getView("p2").ownTeam[0];
    assert.equal(target.status, status);
    if (status !== "par") {
      const residual = damages(events, "p2s0");
      assert.equal(residual.length, 1, `${status}: residual ocorre uma vez por rodada`);
      assert.equal(residual[0].amount, Math.floor(target.maxHp / (status === "psn" ? 8 : 16)));
      assert.equal(residual[0].source, null, "Residual não herda o atacante da última ação");
      const lastMove = Math.max(...events.map((event, index) => event.type === "move" ? index : -1));
      assert.ok(events.indexOf(residual[0]) > lastMove, "Residual somente após as ações da rodada");
      if (status === "tox") assert.equal(damages(round(session, moveId, "splash"), "p2s0")[0].amount, Math.floor(target.maxHp / 16) * 2);
    } else {
      assert.ok(events.some(event => event.type === "unable" && event.reason === "par"));
      assert.equal(pp(session, "p2", "splash"), 40);
    }
    session.destroy();
  }
  const sleep = battle(set(["spore"], { level: 100 }), set(["splash"], { level: 50 }), { rng });
  assert.ok(round(sleep, "spore", "splash").some(event => event.type === "unable" && event.reason === "slp"));
  assert.equal(pp(sleep, "p2", "splash"), 40); sleep.destroy();
  for (const word of [0, MAX]) {
    rng.word = word;
    const freeze = battle(set(["icebeam"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
    round(freeze, "icebeam", "splash");
    assert.equal(freeze.getView("p2").ownTeam[0].status, word === 0 ? "frz" : null);
    if (word === 0) {
      rng.word = MAX;
      const before = pp(freeze, "p2", "splash");
      assert.ok(round(freeze, "icebeam", "splash").some(event => event.type === "unable" && event.reason === "frz"));
      assert.equal(pp(freeze, "p2", "splash"), before);
      rng.word = 0;
      assert.ok(round(freeze, "icebeam", "splash").some(event => event.type === "status" && event.status === null));
    }
    freeze.destroy();
  }
  rng.word = 0;
  const confusion = battle(set(["confuseray"], { level: 100 }), set(["splash"], { level: 50 }), { rng });
  const confused = round(confusion, "confuseray", "splash");
  assert.ok(damages(confused, "p2s0").length > 0);
  assert.equal(pp(confusion, "p2", "splash"), 40); confusion.destroy();
  const clearConfusion = battle(set(["confuseray", "splash"], { level: 100 }), set(["splash"]), { rng });
  round(clearConfusion, "confuseray", "splash"); rng.word = MAX;
  for (let i = 0; i < 4; i++) round(clearConfusion, "splash", "splash");
  assert.equal(clearConfusion.getView("p2").ownTeam[0].volatiles.includes("confusion"), false); clearConfusion.destroy();
  for (const word of [0, Math.floor(0.7 * 0x100000000)]) {
    rng.word = word;
    const flinch = battle(set(["airslash"], { evs: { spe: 252 } }), set(["splash"]), { rng });
    const events = round(flinch, "airslash", "splash");
    assert.equal(events.some(event => event.type === "unable" && event.reason === "flinch"), word === 0);
    flinch.destroy();
  }
}

function specialMovesTests(): void {
  const rng = new FixedRng(); rng.word = 0;
  for (const [word, count] of [[0, 2], [MAX, 5]] as const) {
    rng.word = word;
    const multi = battle(set(["bulletseed"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
    const events = round(multi, "bulletseed", "splash");
    const hits = damages(events, "p2s0");
    assert.equal(hits.length, count, "Um evento por hit, sem duplicar linhas split");
    assert.equal(events.filter(event => event.type === "critical").length, word === 0 ? count : 0);
    for (let i = 1; i < hits.length; i++) assert.equal(hits[i].hpBefore, hits[i - 1].hpAfter);
    multi.destroy();
  }
  let foundMixed = false;
  for (let seed = 0; seed < 128 && !foundMixed; seed++) {
    const multi = battle(set(["bulletseed"], { level: 30 }), set(["splash"], { level: 100 }), { rng: createRng([seed, 12, 34, 56]) });
    const events = round(multi, "bulletseed", "splash");
    const crits = events.filter(event => event.type === "critical").length;
    foundMixed = crits > 0 && crits < damages(events, "p2s0").length;
    multi.destroy();
  }
  assert.ok(foundMixed, "Cada hit precisa de seu próprio sorteio de crítico");
  rng.word = 0;
  const charge = battle(set(["solarbeam"]), set(["splash"]), { rng });
  assert.equal(damages(round(charge, "solarbeam", "splash")).length, 0);
  assert.equal(pp(charge, "p1", "solarbeam"), 9);
  assert.ok(damages(round(charge, "solarbeam", "splash")).length > 0);
  assert.equal(pp(charge, "p1", "solarbeam"), 9, "Segundo turno de carga não gasta PP novamente"); charge.destroy();
  const lastCharge = battle(set(["splash", "solarbeam"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
  for (let i = 0; i < 10; i++) {
    round(lastCharge, "solarbeam", "splash");
    assert.equal(lastCharge.getView("p1").request?.lockedMoveId, "solarbeam");
    assert.equal(lastCharge.getView("p1").request?.moves[0].pp, 9 - i);
    assert.ok(damages(round(lastCharge, "solarbeam", "splash")).length > 0);
  }
  assert.equal(lastCharge.getView("p1").request?.moves.find(move => move.id === "solarbeam")?.disabled, true); lastCharge.destroy();
  const recharge = battle(set(["hyperbeam"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
  round(recharge, "hyperbeam", "splash");
  assert.equal(recharge.getView("p1").request?.moves[0].id, "recharge");
  assert.equal(damages(round(recharge, "recharge", "splash")).length, 0); recharge.destroy();
  const rest = battle(set(["rest", "splash"]), set(["willowisp", "splash"]), { rng });
  round(rest, "splash", "willowisp");
  assert.equal(rest.getView("p1").ownTeam[0].status, "brn");
  round(rest, "rest", "splash");
  assert.equal(rest.getView("p1").ownTeam[0].hp, rest.getView("p1").ownTeam[0].maxHp);
  assert.equal(rest.getView("p1").ownTeam[0].status, "slp");
  for (let i = 0; i < 2; i++) assert.ok(round(rest, "splash", "splash").some(event => event.type === "unable" && event.actor === "p1s0"));
  assert.ok(uses(round(rest, "splash", "splash")).some(event => event.actor === "p1s0")); rest.destroy();
  const substitute = battle(set(["substitute", "splash"], { evs: { spe: 252 } }), set(["tackle"], { level: 1 }), { rng });
  const subEvents = round(substitute, "substitute", "tackle");
  assert.equal(damages(subEvents, "p1s0").length, 1, "Dano no Substitute não deve reduzir HP real");
  assert.equal(substitute.getView("p1").ownTeam[0].hp, 130 - Math.floor(130 / 4)); substitute.destroy();
}

function switchAndBlockingTests(): void {
  const rng = new FixedRng(); rng.word = 0;
  const bench = set(["splash"], { speciesId: "magikarp" });
  const pivot = battle(set(["uturn"], { evs: { spe: 252 } }), set(["tackle"]), { rng }, [bench]);
  const first = round(pivot, "uturn", "tackle");
  assert.equal(uses(first).length, 1, "Fila deve pausar para U-turn");
  assert.equal(pivot.getView("p1").request?.kind, "switch");
  assert.equal(pivot.getView("p2").request, null);
  const after = pivot.getView("p1").sequence;
  send(pivot, "p1", { type: "switch", combatantId: "p1s1" });
  assert.ok(uses(pivot.getEvents("p1", after)).some(event => event.actor === "p2s0"));
  assert.equal(pivot.getView("p1").active.p1, "p1s1"); pivot.destroy();
  const forced = battle(set(["roar"]), set(["splash"]), { rng }, [], [bench]);
  round(forced, "roar", "splash");
  assert.equal(forced.getView("p2").active.p2, "p2s1"); forced.destroy();
  const taunt = battle(set(["taunt"], { evs: { spe: 252 } }), set(["splash", "tackle"]), { rng });
  round(taunt, "taunt", "splash");
  assert.equal(taunt.getView("p2").request?.moves.find(entry => entry.id === "splash")?.disabled, true);
  assert.throws(() => send(taunt, "p2", move("splash")), hasError("INVALID_ACTION")); taunt.destroy();
  const disable = battle(set(["disable", "splash"], { evs: { spe: 252 } }), set(["splash", "tackle"]), { rng });
  round(disable, "splash", "tackle");
  round(disable, "disable", "tackle");
  assert.equal(disable.getView("p2").request?.moves.find(entry => entry.id === "tackle")?.disabled, true); disable.destroy();
  const ko = battle(set(["quickattack"], { level: 100 }), set(["splash"], { level: 1 }), { rng }, [], [bench]);
  round(ko, "quickattack", "splash");
  assert.equal(ko.getView("p2").request?.kind, "switch");
  send(ko, "p2", { type: "switch", combatantId: "p2s1" });
  assert.equal(ko.getView("p2").active.p2, "p2s1"); ko.destroy();
  const finish = battle(set(["quickattack"], { level: 100 }), set(["splash"], { level: 1 }), { rng });
  round(finish, "quickattack", "splash");
  assert.deepEqual(finish.getView("p1").result, { winner: "p1", reason: "knockout" }); finish.destroy();
}

function extendedMechanicsTests(): void {
  const rng = new FixedRng(); rng.word = 0;
  // Dreno/recuo consideram HP efetivamente perdido, incluindo o último hit fatal.
  for (const moveId of ["gigadrain", "doubleedge"]) {
    const session = battle(set([moveId, "substitute"], { level: 100 }), set(["splash"], { level: 1 }), { rng });
    round(session, "substitute", "splash");
    const before = session.getView("p1").ownTeam[0].hp;
    const victim = session.getView("p2").ownTeam[0].hp;
    const events = round(session, moveId, "splash");
    assert.equal(damages(events, "p2s0")[0].amount, victim);
    const expected = moveId === "gigadrain" ? Math.round(victim / 2) : -Math.round(victim * 33 / 100);
    assert.equal(session.getView("p1").ownTeam[0].hp - before, expected);
    assert.ok(events.some(event => event.type === "faint"));
    assert.ok(events.findIndex(event => event.type === "battle_end") > events.findIndex(event => event.type === "faint"));
    session.destroy();
  }
  const counts = [0, 0, 0, 0, 0, 0];
  for (let percentile = 0; percentile < 100; percentile++) {
    rng.word = Math.floor((percentile + 0.5) / 100 * 0x100000000);
    const session = battle(set(["bulletseed"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
    counts[damages(round(session, "bulletseed", "splash"), "p2s0").length]++;
    session.destroy();
  }
  assert.deepEqual(counts.slice(2), [35, 35, 15, 15]);
  // Críticos normais, elevados, Focus Energy e limite garantido.
  for (const [id, fraction, critical] of [["tackle", 0.04, true], ["tackle", 0.05, false], ["leafblade", 0.12, true], ["leafblade", 0.13, false]] as const) {
    rng.word = Math.floor(fraction * 0x100000000);
    const session = battle(set([id], { level: 1 }), set(["splash"], { level: 100 }), { rng });
    assert.equal(round(session, id, "splash").some(event => event.type === "critical"), critical);
    session.destroy();
  }
  rng.word = MAX;
  const focused = battle(set(["focusenergy", "leafblade"], { level: 1 }), set(["splash"], { level: 100 }), { rng });
  round(focused, "focusenergy", "splash");
  assert.ok(round(focused, "leafblade", "splash").some(event => event.type === "critical")); focused.destroy();
  const accuracy = battle(set(["protect", "splash"]), set(["fissure", "swift"], { level: 1 }), { rng });
  const blocked = round(accuracy, "protect", "fissure");
  assert.ok(blocked.some(event => event.type === "effect" && event.effectId === "protect"));
  assert.equal(blocked.some(event => event.type === "miss"), false, "Protect vem antes da precisão");
  assert.ok(damages(round(accuracy, "splash", "swift")).length > 0, "Precisão true ignora RNG alto"); accuracy.destroy();
  rng.word = 0;
  const exhausted = battle(set(["spite"]), set(["splash"]), { rng });
  for (let i = 0; i < 10; i++) round(exhausted, "spite", exhausted.getView("p2").request!.moves[0].id);
  assert.equal(pp(exhausted, "p1", "spite"), 0);
  assert.equal(exhausted.getView("p1").request?.moves[0].id, "struggle");
  assert.throws(() => send(exhausted, "p1", move("spite")), hasError("INVALID_ACTION"));
  exhausted.destroy();
  const encore = battle(set(["encore", "splash"], { evs: { spe: 252 } }), set(["tackle", "splash"]), { rng });
  round(encore, "splash", "splash"); round(encore, "encore", "tackle");
  assert.equal(encore.getView("p2").request?.moves.find(entry => entry.id === "tackle")?.disabled, true);
  assert.equal(pp(encore, "p2", "tackle"), 35); encore.destroy();
  const baton = battle(set(["swordsdance", "batonpass"]), set(["splash"]), { rng }, [set(["tackle"], { speciesId: "eevee" })]);
  round(baton, "swordsdance", "splash"); round(baton, "batonpass", "splash");
  send(baton, "p1", { type: "switch", combatantId: "p1s1" });
  assert.equal(baton.getView("p1").ownTeam[1].boosts.atk, 2); baton.destroy();
  const revival = battle(set(["splash"], { speciesId: "magikarp", level: 1 }), set(["quickattack", "splash"]), { rng },
    [set(["revivalblessing"], { speciesId: "pawmot" })]);
  round(revival, "splash", "quickattack"); send(revival, "p1", { type: "switch", combatantId: "p1s1" });
  round(revival, "revivalblessing", "splash");
  assert.equal(revival.getView("p1").request?.kind, "revive");
  assert.deepEqual(revival.getView("p1").request?.switches, ["p1s0"]);
  send(revival, "p1", { type: "switch", combatantId: "p1s0" });
  const revived = revival.getView("p1").ownTeam[0];
  assert.equal(revived.fainted, false); assert.equal(revived.hp, Math.floor(revived.maxHp / 2));
  assert.equal(revival.getView("p1").active.p1, "p1s1"); revival.destroy();
  const sleepTalk = battle(set(["sleeptalk", "tackle"], { level: 1 }), set(["spore", "splash"], { level: 100 }), { rng });
  const asleep = round(sleepTalk, "sleeptalk", "spore");
  assert.ok(uses(asleep).some(event => event.moveId === "tackle"));
  assert.equal(pp(sleepTalk, "p1", "tackle"), 35); assert.equal(pp(sleepTalk, "p1", "sleeptalk"), 9); sleepTalk.destroy();
  const toxic = battle(set(["toxic", "splash"]), set(["splash"]), { rng }, [], [set(["splash"], { speciesId: "magikarp" })]);
  round(toxic, "toxic", "splash"); round(toxic, "splash", "splash");
  send(toxic, "p1", move("splash")); send(toxic, "p2", { type: "switch", combatantId: "p2s1" });
  const checkpoint = toxic.getView("p1").sequence;
  send(toxic, "p1", move("splash")); send(toxic, "p2", { type: "switch", combatantId: "p2s0" });
  assert.equal(damages(toxic.getEvents("p1", checkpoint), "p2s0")[0].amount, Math.floor(toxic.getView("p2").ownTeam[0].maxHp / 16)); toxic.destroy();
  const capped = battle(set(["swordsdance", "splash"]), set(["splash", "growl"]), { rng });
  for (let i = 0; i < 4; i++) round(capped, "swordsdance", "splash");
  assert.equal(capped.getView("p1").ownTeam[0].boosts.atk, 6);
  for (let i = 0; i < 14; i++) round(capped, "splash", "growl");
  assert.equal(capped.getView("p1").ownTeam[0].boosts.atk, -6); capped.destroy();
  // Após Paralisia, a Speed efetiva é reduzida e passa a ordenar o turno.
  const paralysis = battle(set(["thunderwave", "splash"]), set(["splash"], { evs: { spe: 252 } }), { rng });
  round(paralysis, "thunderwave", "splash"); rng.word = MAX;
  assert.equal(uses(round(paralysis, "splash", "splash"))[0].actor, "p1s0"); paralysis.destroy();
  const accuracyStages = battle(set(["sandattack", "splash"], { evs: { spe: 252 } }), set(["tackle"]), { rng });
  const inaccurate = round(accuracyStages, "sandattack", "tackle");
  assert.ok(inaccurate.some(event => event.type === "miss" && event.actor === "p2s0")); accuracyStages.destroy();
  const adaptability = battle(set(["tackle"], { speciesId: "eevee" }), set(["splash"], { speciesId: "magikarp" }));
  assert.equal(adaptability.getView("p1").ownTeam[0].ability, "adaptability");
  assert.equal(adaptability.getView("p2").ownTeam[0].ability, "none"); adaptability.destroy();
}

function calledMovesAndCompleteReplayTests(): number {
  const dex = Dex.forGen(9);
  const pool = dex.moves.all().filter(move => getMove(move.id)?.support.supported &&
    (!move.isNonstandard || move.isNonstandard === "Unobtainable") && move.flags.metronome).sort((a, b) => a.num - b.num);
  const rng = new FixedRng();
  for (let i = 0; i < pool.length; i++) {
    rng.word = Math.floor((i + 0.5) / pool.length * 0x100000000);
    const session = battle(set(["metronome"], { speciesId: "mew", level: 1 }), set(["splash"], { level: 100 }), { rng },
      [set(["tackle"], { speciesId: "eevee" })], [set(["quickattack"], { speciesId: "pikachu" })]);
    const events = round(session, "metronome", "splash");
    const called = uses(events).filter(event => event.actor === "p1s0" && event.moveId !== "metronome");
    assert.ok(called.some(event => event.moveId === pool[i].id), `Metronome deve chamar ${pool[i].id}`);
    assert.ok(called.every(event => getMove(event.moveId)?.support.supported));
    if (pool[i].id === "solarbeam") {
      assert.equal(session.getView("p1").request?.lockedMoveId, "solarbeam");
      assert.ok(damages(round(session, "solarbeam", "splash")).length > 0);
    }
    session.destroy();
  }
  for (let seed = 0; seed < 12; seed++) {
    const setup: BattleSetup = immutable({ seed: [seed, 12, 34, 56], teams: [
      [set(["tackle"]), set(["tackle"], { speciesId: "eevee" }), set(["tackle"], { speciesId: "bulbasaur" })],
      [set(["tackle"]), set(["tackle"], { speciesId: "squirtle" }), set(["tackle"], { speciesId: "eevee" })],
    ] });
    const session = new BattleSession(setup);
    const commands: ChoiceSubmission[] = [];
    const reversed: ChoiceSubmission[] = [];
    let cycles = 0;
    while (session.getView("p1").phase !== "finished") {
      assert.ok(cycles++ < 300, "Partida de regressão precisa terminar");
      const batch: ChoiceSubmission[] = [];
      for (const side of ["p1", "p2"] as const) {
        const request = session.getView(side).request;
        if (!request) continue;
        const choice: BattleChoice = request.kind === "move" ? move(request.moves[0].id) : { type: "switch", combatantId: request.switches[0] };
        batch.push({ side, requestId: request.id, actionId: `${side}_${request.id}`, choice });
      }
      commands.push(...batch); reversed.push(...[...batch].reverse());
      for (const command of batch) session.submit(command);
      for (const side of ["p1", "p2"] as const) for (const pokemon of session.getView(side).ownTeam) {
        assert.ok(pokemon.hp >= 0 && pokemon.hp <= pokemon.maxHp);
        assert.ok(pokemon.moves.every(move => move.pp >= 0 && move.pp <= move.maxPp));
      }
    }
    const replay = replayBattle(setup, reversed);
    assert.deepEqual(replay.events.p1, session.getEvents("p1"));
    assert.deepEqual(replay.p1, session.getView("p1"));
    assert.deepEqual(replayBattle(setup, commands), replay);
    session.destroy();
  }
  return pool.length;
}

/** Exercita todos os golpes disponíveis que tenham uma espécie legal no catálogo. */
function moveSmokeTests(): number {
  const dex = Dex.forGen(9);
  const species = dex.species.all().filter(value => value.exists && value.num > 0 && value.num <= 1025 && !value.forme && value.gen <= 9);
  const pools = species.map(value => ({ id: value.id, moves: dex.species.getMovePool(value.id, true) }));
  const rng = new FixedRng(); rng.word = 0;
  let executed = 0;
  for (const word of [0, MAX]) for (const moveData of listMoves()) {
    rng.word = word;
    if (!moveData.support.supported || moveData.id === "struggle") continue;
    const eligible = pools.find(pool => pool.moves.has(dex.toID(moveData.id)));
    if (!eligible) continue;
    const session = battle(set([moveData.id], { speciesId: eligible.id }), set(["splash"], { level: 100 }), { rng },
      eligible.id === "magikarp" ? [set(["protect"], { speciesId: "pikachu" })] : [set(["splash"], { speciesId: "magikarp" })],
      [set(["protect"], { speciesId: "pikachu" })]);
    try {
      round(session, moveData.id, "splash");
      // Avança efeitos retardados, cargas, bloqueios e pedidos intermediários.
      for (let step = 0; step < 8 && session.getView("p1").phase !== "finished"; step++) {
        const requests = (["p1", "p2"] as const).map(side => ({ side, request: session.getView(side).request }));
        for (const { side, request } of requests) {
          if (!request) continue;
          const legal = request.moves.find(move => !move.disabled && (move.pp > 0 || move.id === "struggle" || move.id === request.lockedMoveId));
          if (request.kind === "move" && legal) send(session, side, move(legal.id));
          else { assert.ok(request.switches.length > 0, moveData.id); send(session, side, { type: "switch", combatantId: request.switches[0] }); }
        }
      }
      for (const side of ["p1", "p2"] as const) {
        const view = session.getView(side);
        for (const pokemon of view.ownTeam) {
          assert.ok(pokemon.hp >= 0 && pokemon.hp <= pokemon.maxHp, moveData.id);
          assert.ok(Object.values(pokemon.boosts).every(value => value >= -6 && value <= 6), moveData.id);
        }
      }
      executed++;
    } catch (error) { throw new Error(`Falha no smoke test de ${moveData.id}: ${error instanceof Error ? error.stack : String(error)}`); }
    finally { session.destroy(); }
  }
  return executed;
}

export function runBattleTests(): void {
  catalogTests(); requestsAndReplayTests(); orderAndProtectTests(); speedModifiersAndTrickRoomTests(); statusTests();
  specialMovesTests(); switchAndBlockingTests(); extendedMechanicsTests();
  const called = calledMovesAndCompleteReplayTests();
  const smoke = moveSmokeTests();
  console.log(`Engine 2B tests passed: catalog, actions/privacy, 12 complete deterministic replays, priority, statuses, special moves, switches, ${called} Metronome outcomes and ${smoke} multi-turn move scenarios.`);
}
