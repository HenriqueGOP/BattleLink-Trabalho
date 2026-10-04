import assert from "node:assert/strict";
import { parseClientMessage } from "./protocol";
import { PROTOCOL_VERSION } from "./contracts/protocol";
import { catalog } from "./contracts/catalog";
import { decodeServerMessage } from "./contracts/decode";
import { fixtureRoom } from "./game/room.fixture";

const join = {
  type: "join",
  name: "Alice",
  protocol: PROTOCOL_VERSION,
  catalogVersion: catalog.version,
};
assert.deepEqual(parseClientMessage(join), join);
assert.deepEqual(parseClientMessage({ ...join, token: "secret" }), {
  ...join,
  token: "secret",
});
assert.throws(
  () => parseClientMessage({ ...join, token: "x".repeat(257) }),
  /grande demais/,
);
assert.throws(
  () => parseClientMessage({ ...join, protocol: "pokemon-battle/2" }),
  /incompatível/,
);
assert.deepEqual(parseClientMessage({ type: "accept_team", matchId: "match-fixture" }), {
  type: "accept_team", matchId: "match-fixture",
});
const action = {
  type: "action",
  matchId: "match-fixture",
  requestId: 1,
  actionId: "id-1",
  choice: { type: "move", moveId: "tackle" },
};
assert.deepEqual(parseClientMessage(action), action);
for (const raw of [
  null,
  [],
  { type: "action", action: { type: "attack", move: "tackle" } },
  { ...action, requestId: 0 },
  { ...action, actionId: "../x" },
  { ...action, choice: { type: "move", moveId: "https://evil.test/x" } },
  { ...action, choice: { type: "switch", combatantId: "p3s0" } },
  { type: "terastallize" },
  { type: "switch_pokemon", pokemon: "pikachu" },
  { type: "set_moves", pokemon: "pikachu", moves: ["thunderbolt", 1] },
  { type: "random_team", count: 7 },
  {
    type: "set_moves",
    pokemon: "pikachu",
    moves: ["thunderbolt", "thunderbolt"],
  },
  { type: "unknown" },
])
  assert.throws(() => parseClientMessage(raw));
const room = fixtureRoom();
const valid = { type: "state", state: room.getStateFor("p1") };
assert.deepEqual(decodeServerMessage(valid), valid);
for (const field of ["phase", "viewer", "events", "battle", "team"])
  assert.throws(() =>
    decodeServerMessage({
      ...valid,
      state: { ...valid.state, [field]: "invalid" },
    }),
  );
assert.throws(() =>
  decodeServerMessage({
    type: "state",
    state: {
      ...valid.state,
      team: [{ ...valid.state.team[0], speciesId: "https://evil.test" }],
    },
  }),
);
assert.throws(() =>
  decodeServerMessage({
    type: "state",
    state: {
      ...valid.state,
      battle: {
        ...valid.state.battle,
        ownTeam: [{ ...valid.state.battle!.ownTeam[0], hp: -1 }],
      },
    },
  }),
);
room.destroy();
console.log(
  "Protocol tests passed: v4, malformed actions, old commands rejected and validated snapshots.",
);
