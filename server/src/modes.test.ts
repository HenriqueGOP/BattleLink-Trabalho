import assert from "node:assert/strict";
import { RoomManager } from "./game/manager";
import { Room } from "./game/room";
import { TRAINERS } from "./contracts/trainers";
import { trainerTeam } from "./game/trainers";
import { speciesById } from "./contracts/catalog";
import { parseClientMessage } from "./protocol";
import { botChoice } from "./game/bot";
import { BattleSession, createRng } from "./game/engine";
import { decodeServerMessage } from "./contracts/decode";
import { TEAM } from "./game/room.fixture";

let now = 1000;
const manager = new RoomManager(() => now);
assert.equal(manager.enqueue("classic", "Alice"), null);
assert.equal(manager.enqueue("quick", "Bob", { id: "quick" }), null);
assert.equal(manager.enqueue("water", "Maré", { id: "monotype", type: "water" }), null);
assert.equal(manager.enqueue("fire", "Brasa", { id: "monotype", type: "fire" }), null);
const quick = manager.enqueue("quick2", "Carol", { id: "quick" })!;
assert.equal(quick.format.id, "quick");
assert.equal(manager.waitingPosition("classic"), 1);
assert.equal(manager.waitingPosition("water"), 1);
manager.remove("quick");
const invite = manager.createPrivate("host", "Host", { id: "quick" });
assert.match(invite.code, /^[A-HJ-NP-Z2-9]{8}$/);
assert.throws(() => manager.createPrivate("host", "Host", { id: "classic" }));
assert.throws(() => manager.joinPrivate("guest", "Guest", "XXXXXXXX"));
const privateMatch = manager.joinPrivate("guest", "Guest", invite.code);
assert.equal(privateMatch.id, invite.roomId);
assert.equal(privateMatch.format.id, "quick");
assert.throws(() => manager.joinPrivate("third", "Third", invite.code));
manager.remove("guest");
assert.equal(manager.lobbyOf("host")!.players.length, 1);
assert.equal(manager.lobbyOf("host")!.code, invite.code);
const replacement = manager.joinPrivate("guest2", "Guest 2", invite.code);
assert.notEqual(replacement.matchId, privateMatch.matchId);
manager.remove("host");
assert.equal(manager.lobbyOf("guest2"), null);
assert.throws(() => manager.joinPrivate("guest3", "Guest 3", invite.code));
manager.createPrivate("idle", "Idle", { id: "classic" });
now += 900001;
assert.deepEqual(manager.sweep(), ["idle"]);
manager.close();
const dormant = new RoomManager(() => now);
const dormantInvite = dormant.createPrivate("host", "Host", { id: "quick" });
dormant.joinPrivate("guest", "Guest", dormantInvite.code);
now += 900001;
assert.deepEqual(dormant.sweep(), ["host", "guest"], "Inactive setup expires for both participants");
assert.equal(dormant.roomOf("guest"), undefined);
dormant.close();

const themed = new Room("p1", "p2", [1, 2, 3, 4], { format: { id: "monotype", type: "water" } });
assert.throws(() => themed.choosePokemon("p1", "pikachu"));
themed.choosePokemon("p1", "lapras");
themed.randomTeam("p1", 5);
assert.ok(themed.getStateFor("p1").team.every(member => speciesById(member.speciesId)!.types.includes("water")));
themed.destroy();
for (const trainer of TRAINERS) for (const format of [{ id: "quick" }, { id: "classic" }, { id: "monotype", type: trainer.type }] as const) {
  const team = trainerTeam(trainer.id, format);
  assert.equal(team[0].speciesId, trainer.signature);
  assert.equal(team.length, format.id === "quick" ? 3 : 6);
  if (format.id === "monotype") assert.ok(team.every(member => speciesById(member.speciesId)!.types.includes(trainer.type)));
  const session = new BattleSession({ teams: [team, team], seed: [1, 2, 3, 4] });
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const view = session.getView("p2");
    const first = botChoice(view, session.getEvents("p2"), difficulty, createRng([4, 3, 2, 1]));
    assert.deepEqual(first, botChoice(view, session.getEvents("p2"), difficulty, createRng([4, 3, 2, 1])));
    if (first.type === "move") assert.ok(view.request!.moves.some(move => move.id === first.moveId && !move.disabled));
    else assert.ok(view.request!.switches.includes(first.combatantId));
    assert.equal(view.request!.submitted, false);
  }
  session.destroy();
}
assert.throws(() => trainerTeam("mare", { id: "monotype", type: "fire" }));
assert.throws(() => parseClientMessage({ type: "action", requestId: 1, actionId: "old", choice: { type: "move", moveId: "tackle" } }), /matchId/);
assert.throws(() => parseClientMessage({ type: "pve_start", trainerId: "../mare", difficulty: "hard", format: { id: "classic" }, commandId: "x" }));

// A real knockout proves reset semantics, rather than mutating a finished flag.
const rounds = new RoomManager();
rounds.enqueue("p1", "Alice");
const room = rounds.enqueue("p2", "Bob")!;
for (const id of TEAM) { room.choosePokemon("p1", id); room.choosePokemon("p2", id); }
room.setMoves("p1", "smeargle", ["seismictoss"]);
for (const [species, move] of [["smeargle", "splash"], ["eevee", "growl"], ["bulbasaur", "growth"], ["squirtle", "tailwhip"], ["pikachu", "growl"], ["magikarp", "splash"]]) room.setMoves("p2", species, [move]);
room.acceptTeam("p1"); room.acceptTeam("p2");
const prep = room.getStateFor("p1").preparation!.id;
room.battleReady("p1", prep); room.battleReady("p2", prep);
for (let turn = 0; room.state.phase !== "finished" && turn < 200; turn++) for (const side of ["p1", "p2"] as const) {
  const view = room.getStateFor(side).battle;
  if (!view?.request || view.request.submitted) continue;
  const req = view.request;
  room.applyAction(side, { type: "action", requestId: req.id, actionId: `${side}-${req.id}`, choice: req.kind === "move" ? { type: "move", moveId: req.moves.find(move => !move.disabled && (move.pp > 0 || move.id === "struggle"))!.id } : { type: "switch", combatantId: req.switches[0] } });
}
assert.equal(room.state.phase, "finished");
room.openRematch(1000);
assert.throws(() => room.voteRematch("p1", true, 31000), /expirada/);
assert.equal(room.voteRematch("p1", true, 1001), false);
assert.equal(room.voteRematch("p2", false, 1002), true);
const original = room.getStateFor("p1").team;
const fresh = rounds.rematch(room);
assert.equal(fresh.id, room.id);
assert.notEqual(fresh.matchId, room.matchId);
assert.deepEqual(fresh.getStateFor("p1").team, original);
assert.equal(fresh.getStateFor("p2").team.length, 0);
assert.equal(fresh.getStateFor("p1").battle, null);
assert.equal(fresh.getStateFor("p1").sequence, 0);
assert.throws(() => fresh.assertMatch(room.matchId), /outra partida/);
decodeServerMessage({ type: "state", state: fresh.getStateFor("p1") });
rounds.close();
const fallback = new Room("human", "bot", [1, 2, 3, 4], { format: { id: "quick" }, mode: "pve", trainerId: "vespera", difficulty: "hard" });
fallback.loadTeam("human", trainerTeam("mare", { id: "quick" }).map((member, index) => ({ id: `p1s${index}`, speciesId: member.speciesId, moves: member.moves, shiny: false })));
fallback.acceptTeam("human");
fallback.battleReady("human", fallback.getStateFor("human").preparation!.id);
fallback.playBot(() => { throw new Error("Simulated evaluator failure"); });
assert.equal(fallback.getStateFor("bot").battle!.request!.submitted, true, "Failure uses a legal fallback without forfeiting");
fallback.destroy();
console.log("Mode tests passed: isolated queues, invites, expiry, 33 trainer teams, legal deterministic bots, monotype and fresh rematches.");
