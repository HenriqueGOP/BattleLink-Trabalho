import assert from "node:assert/strict";
import { parseClientMessage } from "./protocol";

assert.deepEqual(parseClientMessage({ type: "join", name: "Alice" }), { type: "join", name: "Alice" });
assert.deepEqual(parseClientMessage({ type: "accept_team" }), { type: "accept_team" });
assert.deepEqual(parseClientMessage({ type: "join", name: "Alice", token: "secret" }), { type: "join", name: "Alice", token: "secret" });
assert.throws(() => parseClientMessage({ type: "join", name: "Alice", token: "x".repeat(257) }), /grande demais/i);
assert.deepEqual(parseClientMessage({ type: "action", action: { type: "attack", move: "tackle" } }), {
  type: "action",
  action: { type: "attack", move: "tackle" },
});
assert.throws(() => parseClientMessage({ type: "action", action: { type: "hack" } }), /Ação inválida/i);
assert.throws(() => parseClientMessage({ type: "action", action: { type: "attack" } }), /action\.move/i);
assert.throws(() => parseClientMessage({ type: "set_moves", pokemon: "pikachu", moves: ["thunderbolt", 1] }), /moves\[1\]/i);
assert.throws(() => parseClientMessage({ type: "unknown" }), /desconhecida|inválida/i);

console.log("Protocol tests passed.");
