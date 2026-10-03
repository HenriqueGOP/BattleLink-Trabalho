import assert from "node:assert/strict";
import { act, fixtureRoom, turn } from "./room.fixture";
import {
  diffState,
  buildLogEntries,
} from "../../../client/src/lib/eventEngine";
import { presentSnapshot } from "../../../client/src/lib/battleView";
import { decodeServerMessage } from "../contracts/decode";
import type { BattleEvent } from "./engine";

const room = fixtureRoom(["seismictoss"], ["splash"]);
const initial = [
  presentSnapshot(room.getStateFor("p1")),
  presentSnapshot(room.getStateFor("p2")),
];
assert.deepEqual(diffState(null, initial[0], 0), []);
for (let i = 0; i < 3; i++) turn(room, "seismictoss", "splash");
const view = room.getStateFor("p1");
assert.equal(view.events.filter((event) => event.type === "faint").length, 1);
const faint = view.events.find((event) => event.type === "faint")!;
assert.equal("target" in faint && faint.target, "p2s0");
assert.equal(room.getStateFor("p2").battle!.ownTeam[0].hp, 0);
assert.equal(room.getStateFor("p2").battle!.request!.kind, "switch");
const next = [presentSnapshot(view), presentSnapshot(room.getStateFor("p2"))];
const left = diffState(initial[0], next[0], 0),
  right = diffState(initial[1], next[1], 1);
assert.equal(left.filter((event) => event.type === "faint").length, 1);
assert.equal(right.filter((event) => event.type === "faint").length, 1);
assert.equal(left.find((event) => event.type === "damage")!.target, "opponent");
assert.equal(right.find((event) => event.type === "damage")!.target, "me");
assert.deepEqual(
  left.map((event) => event.message),
  right.map((event) => event.message),
);
assert.deepEqual(diffState(next[0], next[0], 0), []);
assert.equal(
  buildLogEntries(next[0], 0).filter((event) =>
    event.text.includes("foi nocauteado"),
  ).length,
  1,
);
act(room, "p2", { type: "switch", combatantId: "p2s1" });
assert.equal(
  room.getStateFor("p1").events.filter((event) => event.type === "faint")
    .length,
  1,
);
decodeServerMessage({ type: "state", state: room.getStateFor("p1") });
room.destroy();

const types = fixtureRoom(
  ["ember", "bulletseed"],
  ["growl"],
  true,
  "bulbasaur",
);
assert.ok(
  turn(types, "ember", "growl").some(
    (event) => event.type === "super_effective" && event.target === "p2s0",
  ),
);
assert.ok(
  turn(types, "bulletseed", "growl").some(
    (event) => event.type === "resisted" && event.target === "p2s0",
  ),
);
types.destroy();
const multi = fixtureRoom(["bulletseed"], ["splash"]);
const hits = turn(multi, "bulletseed", "splash").filter(
  (event): event is Extract<BattleEvent, { type: "damage" | "heal" }> =>
    event.type === "damage",
);
assert.ok(hits.length >= 2);
for (let i = 1; i < hits.length; i++)
  assert.equal(hits[i].hpBefore, hits[i - 1].hpAfter);
multi.destroy();

const bounded = fixtureRoom(["splash"], ["splash"]);
const old = presentSnapshot(bounded.getStateFor("p1"));
for (let i = 0; i < 70; i++) {
  const slot = i % 2 === 0 ? 1 : 0;
  act(bounded, "p1", { type: "switch", combatantId: `p1s${slot}` });
  act(bounded, "p2", { type: "switch", combatantId: `p2s${slot}` });
}
const recent = presentSnapshot(bounded.getStateFor("p1"));
assert.ok(recent.wire.events.length <= 240);
assert.ok(recent.wire.eventFloor > old.wire.sequence);
assert.deepEqual(
  diffState(old, recent, 0),
  [],
  "Lacuna é ressincronizada pelo snapshot",
);
bounded.destroy();
console.log(
  "Event tests passed: canonical events, HP per hit, mirrored views, KO uniqueness and resync.",
);
