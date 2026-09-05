import assert from "node:assert/strict";
import { parseClientMessage } from "./protocol";

assert.deepEqual(parseClientMessage({ type: "join", name: "Alice" }), { type: "join", name: "Alice" });
assert.deepEqual(parseClientMessage({ type: "action", action: { type: "attack", move: "tackle" } }), {
  type: "action",
  action: { type: "attack", move: "tackle" },
});
assert.throws(() => parseClientMessage({ type: "action", action: { type: "hack" } }), /ação válida/);
assert.throws(() => parseClientMessage({ type: "unknown" }), /desconhecido/);

console.log("Protocol tests passed.");
