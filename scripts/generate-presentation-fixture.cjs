// Fixtures visuais derivadas do motor real. Somente ferramentas de desenvolvimento.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { Room } = require(path.join(root, "server/dist/game/room.js"));
const { decodeServerMessage } = require(
  path.join(root, "server/dist/contracts/decode.js"),
);
const room = new Room("p1", "p2", [1, 2, 3, 4]);
room.setName("p1", "Alice");
room.setName("p2", "Bob");
const team = [
  "smeargle",
  "eevee",
  "bulbasaur",
  "squirtle",
  "pikachu",
  "magikarp",
];
for (const side of ["p1", "p2"])
  for (const id of team) room.choosePokemon(side, id);
room.setMoves("p1", "smeargle", [
  "bulletseed",
  "seismictoss",
  "willowisp",
  "swordsdance",
]);
room.setMoves("p2", "smeargle", ["splash", "recover"]);
room.acceptTeam("p1");
room.acceptTeam("p2");
const preparation = room.getStateFor("p1").preparation.id;
const snapshots = [];
function save(label) {
  const state = room.getStateFor("p1");
  decodeServerMessage({ type: "state", state });
  snapshots.push({ label, state });
}
function action(side, choice) {
  const request = room.getStateFor(side).battle.request;
  room.applyAction(side, {
    type: "action",
    requestId: request.id,
    actionId: side + "_" + request.id,
    choice,
  });
}
function turn(left, right) {
  action("p1", { type: "move", moveId: left });
  action("p2", { type: "move", moveId: right });
}
save("Preparação");
room.battleReady("p1", preparation);
room.battleReady("p2", preparation);
save("Entrada em campo");
turn("bulletseed", "splash");
save("Múltiplos hits");
turn("bulletseed", "recover");
save("Nova rodada e cura");
turn("willowisp", "splash");
save("Status e residual");
turn("swordsdance", "splash");
save("Atributo e aura");
for (
  let i = 0;
  i < 4 && room.getStateFor("p2").battle.request.kind === "move";
  i++
)
  turn("seismictoss", "splash");
save("Nocaute");
action("p2", { type: "switch", combatantId: "p2s1" });
save("Troca forçada");
room.forfeit("p2");
save("Resultado");
room.destroy();
fs.writeFileSync(
  path.join(root, "client/src/data/presentation-fixture.json"),
  JSON.stringify(snapshots),
);
console.log(
  "Fixture visual: " + snapshots.length + " snapshots validados do motor real.",
);
