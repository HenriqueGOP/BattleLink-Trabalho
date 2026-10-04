import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { createApplication } from "./application";
import { config } from "./config";
import { catalog } from "./contracts/catalog";
import { PROTOCOL_VERSION, type ServerMessage, type RoomSnapshot } from "./contracts/protocol";
import { decodeServerMessage } from "./contracts/decode";

type Message<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;
class Peer {
  readonly history: ServerMessage[] = [];
  private listeners = new Set<() => void>();
  constructor(readonly socket: WebSocket) {
    socket.on("message", data => { this.history.push(decodeServerMessage(JSON.parse(data.toString()))); for (const listener of this.listeners) listener(); });
    socket.on("error", () => undefined);
  }
  wait<T extends ServerMessage["type"]>(type: T, after = 0, predicate: (message: Message<T>) => boolean = () => true): Promise<Message<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(check); reject(new Error(`Timeout ${type}: ${JSON.stringify(this.history.slice(after))}`)); }, 6000);
      const check = () => {
        const message = this.history.slice(after).find(message => message.type === type && predicate(message as Message<T>));
        if (message) { clearTimeout(timer); this.listeners.delete(check); resolve(message as Message<T>); }
      };
      this.listeners.add(check); check();
    });
  }
  send(message: unknown): number { const cursor = this.history.length; this.socket.send(JSON.stringify(message)); return cursor; }
  async command<T extends ServerMessage["type"]>(message: unknown, type: T, predicate?: (message: Message<T>) => boolean) { return this.wait(type, this.send(message), predicate); }
  get state(): RoomSnapshot { const message = [...this.history].reverse().find(message => message.type === "state" || message.type === "match_found") as Message<"state">; return message.state; }
}

async function run() {
  const app = createApplication({ ...config, accessToken: "", host: "127.0.0.1", tcpHost: "127.0.0.1", tcpPort: 0, webSocketPort: 0, httpPort: 0, maxMessagesPerSecond: 500, maxPendingMessages: 128 }, () => undefined);
  const peers: Peer[] = [];
  await app.listen();
  try {
    const port = (app.addresses().websocket as AddressInfo).port;
    async function peer(name: string) {
      const client = new Peer(new WebSocket(`ws://127.0.0.1:${port}`, { origin: config.allowedOrigins[0] })); peers.push(client);
      await client.wait("welcome");
      await client.command({ type: "join", name, protocol: PROTOCOL_VERSION, catalogVersion: catalog.version }, "lobby");
      assert.equal(client.history.some(message => message.type === "waiting"), false, "Authentication does not enter matchmaking");
      return client;
    }
    const [a, b, c, d, e, f] = await Promise.all(["Alice", "Bob", "Carol", "Dora", "Eva", "Fábio"].map(peer));
    const created = await a.command({ type: "private_create", format: { id: "quick" }, commandId: "create-1" }, "lobby");
    const invitation = created.lobby!;
    assert.equal(created.commandId, "create-1");
    await a.command({ type: "queue_cancel" }, "error");
    const duplicate = await a.command({ type: "private_create", format: { id: "quick" }, commandId: "create-1" }, "lobby");
    assert.equal(duplicate.lobby!.code, invitation.code);
    await a.command({ type: "private_create", format: { id: "classic" }, commandId: "create-1" }, "error");
    const waiting = await d.command({ type: "queue_join", format: { id: "classic" }, commandId: "queue-1" }, "waiting");
    assert.ok(waiting.message);
    const hostCursor = a.history.length, bCursor = b.history.length, cCursor = c.history.length;
    b.send({ type: "private_join", code: invitation.code, commandId: "join-1" });
    c.send({ type: "private_join", code: invitation.code, commandId: "join-1" });
    await a.wait("match_found", hostCursor);
    const winner = a.state.players[1].name === "Bob" ? b : c, rejected = winner === b ? c : b;
    await winner.wait("match_found", winner === b ? bCursor : cCursor);
    await rejected.wait("error", rejected === b ? bCursor : cCursor);
    assert.equal(d.history.some(message => message.type === "match_found"), false, "Private invite must not consume queue");
    const match = winner.state.matchId;
    await winner.command({ type: "queue_cancel" }, "error");
    assert.equal(winner.state.matchId, match, "Cancelling matchmaking cannot detach an active room");
    const hostDuplicateCursor = a.history.length;
    const again = await winner.command({ type: "private_join", code: invitation.code, commandId: "join-1" }, "match_found");
    assert.equal(again.state.matchId, match);
    assert.equal(again.commandId, "join-1");
    assert.equal(a.history.slice(hostDuplicateCursor).some(message => message.type === "match_found"), false, "A retry must not reset the opponent's presentation");
    await winner.command({ type: "choose_pokemon", pokemon: "pikachu" }, "error");
    const hostLeave = a.history.length;
    await winner.command({ type: "room_leave" }, "lobby");
    assert.equal((await a.wait("lobby", hostLeave)).lobby!.players.length, 1);
    await a.command({ type: "room_leave" }, "lobby");
    await rejected.command({ type: "private_join", code: invitation.code, commandId: "expired" }, "error");

    await e.command({ type: "queue_join", format: { id: "quick" }, commandId: "quick" }, "waiting");
    const queuedCursor = d.history.length;
    const matched = await f.command({ type: "queue_join", format: { id: "classic" }, commandId: "classic" }, "match_found");
    assert.equal((await d.wait("match_found", queuedCursor)).state.matchId, matched.state.matchId);
    assert.equal(e.history.some(message => message.type === "match_found"), false);
    await e.command({ type: "queue_cancel" }, "lobby");
    await d.command({ type: "room_leave" }, "lobby");
    await f.command({ type: "room_leave" }, "lobby");

    await a.command({ type: "pve_start", trainerId: "brasa", difficulty: "easy", format: { id: "quick" }, commandId: "pve" }, "match_found");
    assert.equal(a.state.players[1].name, "Brasa");
    assert.equal(a.state.battle, null);
    assert.equal(a.state.team.length, 0);
    for (const [pokemon, move] of [["kyogre", "surf"], ["mewtwo", "psychic"], ["rayquaza", "dragonpulse"]]) {
      await a.command({ type: "choose_pokemon", matchId: a.state.matchId, pokemon }, "state");
      await a.command({ type: "set_moves", matchId: a.state.matchId, pokemon, moves: [move] }, "state");
    }
    await a.command({ type: "accept_team", matchId: a.state.matchId }, "state");
    const preparation = a.state.preparation!.id;
    await a.command({ type: "battle_ready", matchId: a.state.matchId, preparationId: preparation }, "state", message => message.state.phase === "battle");
    for (let turn = 0; a.state.phase !== "finished" && turn < 180; turn++) {
      const request = a.state.battle!.request!;
      const choice = request.kind === "move" ? { type: "move", moveId: request.moves.find(move => !move.disabled && (move.pp > 0 || move.id === "struggle"))!.id } : { type: "switch", combatantId: request.switches[0] };
      const cursor = a.send({ type: "action", matchId: a.state.matchId, requestId: request.id, actionId: `a-${request.id}`, choice });
      await a.wait("state", cursor, message => message.state.phase === "finished" || Boolean(message.state.battle?.request && !message.state.battle.request.submitted && message.state.battle.request.id !== request.id));
    }
    assert.equal(a.state.phase, "finished", "Server bot and player complete a real battle");
    assert.equal(a.state.rematch.available, true);
    const finished = a.state, team = finished.team;
    await a.command({ type: "rematch", matchId: finished.matchId, accept: true, keepTeam: true }, "match_found");
    assert.equal(a.state.roomId, finished.roomId);
    assert.notEqual(a.state.matchId, finished.matchId);
    assert.deepEqual(a.state.team, team);
    // Both retained teams are already accepted: this new engine has its own introduction events.
    assert.equal(a.state.phase, "preparing");
    assert.equal(a.state.battle!.round, 1);
    assert.equal(a.state.battle!.result, null);
    assert.ok(a.state.battle!.ownTeam.every(pokemon => pokemon.hp === pokemon.maxHp && !pokemon.status && pokemon.moves.every(move => move.pp === move.maxPp)));
    assert.ok(a.state.events.every(event => !["damage", "faint", "result"].includes(event.type)));
    assert.notEqual(a.state.preparation!.id, preparation);
    await a.command({ type: "reset_team", matchId: finished.matchId }, "error");
    await a.command({ type: "battle_ready", matchId: a.state.matchId, preparationId: preparation }, "error");
    await a.command({ type: "room_leave" }, "lobby");
    console.log("Network modes passed: independent lobby, invite idempotency/races, isolated queues, legal PvE battle, fresh rematch and stale command rejection.");
  } finally { for (const peer of peers) peer.socket.terminate(); await app.close(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
