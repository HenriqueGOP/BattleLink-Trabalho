import assert from "node:assert/strict";
import { createConnection } from "node:net";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { createApplication } from "./application";
import { config } from "./config";
import type { ClientMessage, ServerMessage } from "./game/types";
import { catalog } from "./contracts/catalog";
import { PROTOCOL_VERSION } from "./contracts/protocol";
import { decodeServerMessage } from "./contracts/decode";
import { TEAM } from "./game/room.fixture";
import type { RoomSnapshot } from "./contracts/protocol";

type OfType<T extends ServerMessage["type"]> = Extract<
  ServerMessage,
  { type: T }
>;
// Each new admission uses a fresh command; retries within an admission reuse it.
let queueCommand = 0;
class Inbox {
  readonly history: ServerMessage[] = [];
  private messages: ServerMessage[] = [];
  private listeners = new Set<() => void>();
  receive(raw: unknown): void {
    const message = decodeServerMessage(raw);
    this.history.push(message);
    this.messages.push(message);
    for (const listener of [...this.listeners]) listener();
  }
  next<T extends ServerMessage["type"]>(
    type: T,
    predicate: (message: OfType<T>) => boolean = () => true,
  ): Promise<OfType<T>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(check);
        reject(
          new Error(
            `Esperando ${type}. Recebido: ${JSON.stringify(this.history.map((message) => message.type))}`,
          ),
        );
      }, 3000);
      const check = () => {
        const index = this.messages.findIndex(
          (message) => message.type === type && predicate(message as OfType<T>),
        );
        if (index < 0) return;
        clearTimeout(timeout);
        this.listeners.delete(check);
        resolve(this.messages.splice(index, 1)[0] as OfType<T>);
      };
      this.listeners.add(check);
      check();
    });
  }
}

async function tcpPeer(port: number) {
  const socket = createConnection({ host: "127.0.0.1", port });
  const inbox = new Inbox();
  let buffer = "";
  socket.on("error", () => undefined);
  socket.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean))
      inbox.receive(JSON.parse(line) as ServerMessage);
  });
  const welcome = await inbox.next("welcome");
  return {
    inbox,
    id: welcome.playerId,
    send: (message: ClientMessage) => {
      const snapshot = [...inbox.history].reverse().find(m => m.type === "state" || m.type === "match_found") as Extract<ServerMessage, {type: "state" | "match_found"}> | undefined;
      socket.write(`${JSON.stringify("matchId" in message && message.matchId ? message : { ...message, matchId: snapshot?.state.matchId })}\n`);
      if (message.type === "join") socket.write(`${JSON.stringify({ type: "queue_join", format: { id: "classic" }, commandId: `queue-${++queueCommand}` })}\n`);
    },
    close: () => socket.destroy(),
  };
}

async function webPeer(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
    origin: config.allowedOrigins[0],
  });
  const inbox = new Inbox();
  socket.on("error", () => undefined);
  socket.on("message", (raw) =>
    inbox.receive(JSON.parse(raw.toString()) as ServerMessage),
  );
  const welcome = await inbox.next("welcome");
  return {
    inbox,
    id: welcome.playerId,
    socket,
    send: (message: ClientMessage) => {
      const snapshot = [...inbox.history].reverse().find(m => m.type === "state" || m.type === "match_found") as Extract<ServerMessage, {type: "state" | "match_found"}> | undefined;
      socket.send(JSON.stringify("matchId" in message && message.matchId ? message : { ...message, matchId: snapshot?.state.matchId }));
      if (message.type === "join") socket.send(JSON.stringify({ type: "queue_join", format: { id: "classic" }, commandId: `queue-${++queueCommand}` }));
    },
    close: () => socket.terminate(),
  };
}

function rejectedUpgrade(
  port: number,
  origin: string | undefined,
  status: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}`,
      origin ? { origin } : {},
    );
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("Handshake não foi recusado."));
    }, 3000);
    socket.once("error", (error) => {
      clearTimeout(timer);
      try {
        assert.match(error.message, new RegExp(String(status)));
        resolve();
      } catch (cause) {
        reject(cause);
      }
    });
    socket.once("open", () => {
      clearTimeout(timer);
      socket.terminate();
      reject(new Error("Origem/vaga indevida aceita."));
    });
  });
}

async function run(): Promise<void> {
  const settings = {
    ...config,
    host: "127.0.0.1",
    tcpHost: "127.0.0.1",
    tcpPort: 0,
    webSocketPort: 0,
    httpPort: 0,
    accessToken: "test-access-key",
    maxConnections: 2,
    maxConnectionsPerIp: 2,
    maxMessagesPerSecond: 1000,
    maxPendingMessages: 64,
  };
  const join = (name: string): ClientMessage => ({
    type: "join",
    name,
    token: settings.accessToken,
    protocol: PROTOCOL_VERSION,
    catalogVersion: catalog.version,
  });
  const application = createApplication(settings, () => undefined);
  await application.listen();
  const addresses = application.addresses();
  const tcpPort = (addresses.tcp as AddressInfo).port,
    webPort = (addresses.websocket as AddressInfo).port,
    httpPort = (addresses.http as AddressInfo).port;
  try {
    await rejectedUpgrade(webPort, "http://evil.test", 403);
    await rejectedUpgrade(webPort, undefined, 403);
    const forbidden = await webPeer(webPort);
    const closed = new Promise<void>((resolve) =>
      forbidden.socket.once("close", () => resolve()),
    );
    forbidden.send({ ...join("Intruder"), token: "wrong" } as ClientMessage);
    assert.equal((await forbidden.inbox.next("error")).code, "UNAUTHORIZED");
    await closed;
    const outdated = await webPeer(webPort);
    const outdatedClosed = new Promise<void>((resolve) =>
      outdated.socket.once("close", () => resolve()),
    );
    outdated.send({ ...join("Old"), catalogVersion: "old" } as ClientMessage);
    assert.equal((await outdated.inbox.next("error")).code, "CATALOG_MISMATCH");
    await outdatedClosed;
    const alice = await tcpPeer(tcpPort),
      bob = await webPeer(webPort);
    await rejectedUpgrade(webPort, config.allowedOrigins[0], 503);
    alice.send(join("Alice"));
    await alice.inbox.next("waiting");
    bob.send(join("Bob"));
    await alice.inbox.next("match_found");
    await bob.inbox.next("match_found");
    for (const pokemon of TEAM) {
      alice.send({ type: "choose_pokemon", pokemon });
      bob.send({ type: "choose_pokemon", pokemon });
    }
    await alice.inbox.next("state", (m) => m.state.team.length === 6);
    await bob.inbox.next("state", (m) => m.state.team.length === 6);
    // Additive setup edits retain FIFO ordering and acknowledge only their owner.
    alice.send({ type: 'reorder_team', pokemon: [...TEAM].reverse(), editId: 'reverse' });
    alice.send({ type: 'reorder_team', pokemon: [...TEAM], editId: 'restore' });
    assert.deepEqual((await alice.inbox.next('state', m => m.editId === 'reverse')).state.team.map(p => p.speciesId), [...TEAM].reverse());
    assert.deepEqual((await alice.inbox.next('state', m => m.editId === 'restore')).state.team.map(p => p.speciesId), [...TEAM]);
    const opponentEdit = await bob.inbox.next('state', m => m.state.log.some(entry => entry.includes('reorganizou')));
    assert.equal(opponentEdit.editId, undefined, 'Private edit correlation does not reach opponent');
    assert.equal(JSON.stringify(opponentEdit.state).includes('reverse'), false);
    alice.send({ type: 'remove_pokemon', pokemon: TEAM[5], editId: 'remove-last' });
    assert.equal((await alice.inbox.next('state', m => m.editId === 'remove-last')).state.team.length, 5);
    alice.send({ type: 'choose_pokemon', pokemon: TEAM[5], editId: 'restore-last' });
    assert.equal((await alice.inbox.next('state', m => m.editId === 'restore-last')).state.team.length, 6);
    alice.send({ type: 'reorder_team', pokemon: TEAM.slice(1), editId: 'reject-permutation' });
    assert.equal((await alice.inbox.next('error', m => m.editId === 'reject-permutation')).code, 'INVALID_MESSAGE');
      alice.send({ type: 'reorder_team', pokemon: [TEAM[0], TEAM[0]], editId: 'reject-payload' });
      assert.equal((await alice.inbox.next('error', m => m.editId === 'reject-payload')).code, 'INVALID_MESSAGE');
    alice.send({ type: 'resync' });
    assert.deepEqual((await alice.inbox.next('state', m => m.state.team.length === 6 && m.state.team[5].speciesId === TEAM[5])).state.team.map(p => p.speciesId), [...TEAM]);
    alice.send({
      type: "set_moves",
      pokemon: "smeargle",
      moves: ["seismictoss"],
    });
    alice.send({ type: "accept_team" });
    assert.equal(
      (await alice.inbox.next("state", (m) => m.state.players[0].ready)).state
        .phase,
      "setup",
    );
    bob.send({ type: "set_moves", pokemon: "smeargle", moves: ["splash"] });
    bob.send({ type: "accept_team" });
    const preparation = (
      await alice.inbox.next("state", (m) => m.state.phase === "preparing")
    ).state;
    await bob.inbox.next("state", (m) => m.state.phase === "preparing");
    alice.send({
      type: "battle_ready",
      preparationId: preparation.preparation!.id,
    });
    bob.send({
      type: "battle_ready",
      preparationId: preparation.preparation!.id,
    });
    const battle = (
      await alice.inbox.next("state", (m) => m.state.phase === "battle")
    ).state;
    const opponent = (
      await bob.inbox.next("state", (m) => m.state.phase === "battle")
    ).state;
    assert.deepEqual(battle.team[0].moves, ["seismictoss"]);
    assert.ok(!JSON.stringify(battle).includes('"splash"'));
    assert.deepEqual(battle.battle!.opponentTeam[1], {
      id: "p2s1",
      hidden: true,
    });
    bob.send({ type: "set_moves", pokemon: "smeargle", moves: ["tackle"] });
    assert.match((await bob.inbox.next("error")).message, /travados/);
    const first: ClientMessage = {
      type: "action",
      requestId: battle.battle!.request!.id,
      actionId: "first",
      choice: { type: "move", moveId: "seismictoss" },
    };
    const beforePending = bob.inbox.history.length;
    alice.send(first);
    assert.equal((await alice.inbox.next("action_ack")).resolved, false);
    await alice.inbox.next(
      "state",
      (m) => m.state.battle?.request?.submitted === true,
    );
    bob.send({ type: "resync" });
    const stillPrivate = (
      await bob.inbox.next(
        "state",
        (m) =>
          m.state.phase === "battle" && m.state.sequence === battle.sequence,
      )
    ).state;
    assert.deepEqual(
      stillPrivate,
      opponent,
      "Escolha do adversário não altera sequer o snapshot privado",
    );
    assert.equal(
      bob.inbox.history.slice(beforePending).filter((m) => m.type === "state")
        .length,
      1,
      "Escolha pendente não é transmitida ao oponente",
    );
    alice.send(first);
    assert.equal((await alice.inbox.next("action_ack")).duplicate, true);
    bob.send({
      type: "action",
      requestId: opponent.battle!.request!.id,
      actionId: "second",
      choice: { type: "move", moveId: "splash" },
    });
    assert.equal((await bob.inbox.next("action_ack")).resolved, true);
    const resolved = (
      await alice.inbox.next("state", (m) => m.state.sequence > battle.sequence)
    ).state;
    await bob.inbox.next(
      "state",
      (m) => m.state.sequence === resolved.sequence,
    );
    assert.equal(resolved.events.filter((e) => e.type === "damage").length, 1);
    alice.send(first);
    assert.equal((await alice.inbox.next("action_ack")).duplicate, true);
    alice.send({ ...first, actionId: "late" });
    assert.equal((await alice.inbox.next("error")).code, "STALE_REQUEST");
    alice.send({
      type: "action",
      requestId: resolved.battle!.request!.id,
      actionId: "foreign",
      choice: { type: "switch", combatantId: "p2s1" },
    });
    assert.equal((await alice.inbox.next("error")).code, "INVALID_ACTION");
    bob.close();
    const ended = (
      await alice.inbox.next("state", (m) => m.state.phase === "finished")
    ).state;
    assert.deepEqual(ended.result, { winner: "p1", reason: "disconnect" });
    await alice.inbox.next("opponent_left");

    // Sobrevivente volta à fila na mesma conexão; seleção/reset não depende de HTTP.
    alice.send(join("Alice"));
    await alice.inbox.next("waiting");
    const newBob = await webPeer(webPort);
    newBob.send(join("Bob"));
    await alice.inbox.next("match_found");
    await newBob.inbox.next("match_found");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("Backend de batalha não pode depender da rede externa");
    };
    try {
      alice.send({ type: "choose_pokemon", pokemon: "charizard" });
      alice.send({ type: "reset_team" });
      await alice.inbox.next(
        "state",
        (m) =>
          m.state.team.length === 0 &&
          m.state.log.some((line) => line.includes("vai refazer")),
      );
      newBob.send({ type: "random_team", count: 6 });
      const randomized = (
        await newBob.inbox.next("state", (m) => m.state.team.length === 6)
      ).state;
      assert.equal(new Set(randomized.team.map((p) => p.speciesId)).size, 6);
      alice.close();
      const duringSetup = (
        await newBob.inbox.next("state", (m) => m.state.phase === "finished")
      ).state;
      assert.deepEqual(duringSetup.result, {
        winner: "p2",
        reason: "disconnect",
      });
      assert.equal(duringSetup.players[0].teamCount, 0);
      await newBob.inbox.next("opponent_left");
    } finally {
      globalThis.fetch = originalFetch;
      newBob.close();
    }
    const response = await fetch(`http://127.0.0.1:${httpPort}/api/pokemon`, {
      headers: { Origin: config.allowedOrigins[0] },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      config.allowedOrigins[0],
    );
    const body = (await response.json()) as {
      version: string;
      pokemon: unknown[];
    };
    assert.equal(body.version, catalog.version);
    assert.equal(body.pokemon.length, 1025);
    assert.ok(!JSON.stringify(body).includes("https://"));
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${httpPort}/api/pokemon`, {
          headers: { Origin: "http://evil.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${httpPort}/api/pokemon`, {
          method: "POST",
        })
      ).status,
      405,
    );
  } finally {
    await application.close();
  }

  // Partida completa TCP/WebSocket: escolhas, trocas obrigatórias e resultado natural.
  const full = createApplication(settings, () => undefined);
  await full.listen();
  try {
    const a = await tcpPeer((full.addresses().tcp as AddressInfo).port),
      b = await webPeer((full.addresses().websocket as AddressInfo).port);
    a.send(join("Alice"));
    await a.inbox.next("waiting");
    b.send(join("Bob"));
    await a.inbox.next("match_found");
    await b.inbox.next("match_found");
    const team = [
      "smeargle",
      "golem",
      "voltorb",
      "koffing",
      "geodude",
      "graveler",
    ];
    for (const pokemon of team) {
      a.send({ type: "choose_pokemon", pokemon });
      b.send({ type: "choose_pokemon", pokemon });
    }
    await a.inbox.next("state", (m) => m.state.team.length === 6);
    await b.inbox.next("state", (m) => m.state.team.length === 6);
    for (const pokemon of team) {
      a.send({ type: "set_moves", pokemon, moves: ["protect"] });
      b.send({ type: "set_moves", pokemon, moves: ["selfdestruct"] });
    }
    a.send({ type: "accept_team" });
    b.send({ type: "accept_team" });
    const prep = (
      await a.inbox.next("state", (m) => m.state.phase === "preparing")
    ).state;
    await b.inbox.next("state", (m) => m.state.phase === "preparing");
    for (const peer of [a, b])
      peer.send({ type: "battle_ready", preparationId: prep.preparation!.id });
    let views: RoomSnapshot[] = [
      (await a.inbox.next("state", (m) => m.state.phase === "battle")).state,
      (await b.inbox.next("state", (m) => m.state.phase === "battle")).state,
    ];
    for (
      let iteration = 0;
      iteration < 30 && views[0].phase !== "finished";
      iteration++
    ) {
      const sequence = views[0].sequence;
      for (const [index, peer] of [a, b].entries()) {
        const request = views[index].battle?.request;
        if (!request || request.submitted) continue;
        const choice =
          request.kind !== "move"
            ? { type: "switch" as const, combatantId: request.switches[0] }
            : {
                type: "move" as const,
                moveId: request.moves.find(
                  (m) => !m.disabled && (m.pp > 0 || m.id === "struggle"),
                )!.id,
              };
        peer.send({
          type: "action",
          requestId: request.id,
          actionId: `full_${iteration}_${index}`,
          choice,
        });
        await peer.inbox.next("action_ack");
      }
      views = [
        (await a.inbox.next("state", (m) => m.state.sequence > sequence)).state,
        (await b.inbox.next("state", (m) => m.state.sequence > sequence)).state,
      ];
    }
    assert.equal(views[0].phase, "finished");
    assert.equal(views[1].phase, "finished");
    assert.equal(views[0].result!.reason, "knockout");
    assert.deepEqual(views[0].result, views[1].result);
    assert.ok(
      views[0].events.some((e) => e.type === "switch" && e.previous !== null),
    );
    assert.ok(views[0].events.some((e) => e.type === "battle_end"));
    a.close();
    b.close();
  } finally {
    await full.close();
  }

  // Cliente ausente durante o preload não prende a sala indefinidamente.
  const timed = createApplication(
    { ...settings, preparationTimeoutMs: 200 },
    () => undefined,
  );
  await timed.listen();
  try {
    const a = await tcpPeer((timed.addresses().tcp as AddressInfo).port),
      b = await webPeer((timed.addresses().websocket as AddressInfo).port);
    a.send(join("Alice"));
    await a.inbox.next("waiting");
    b.send(join("Bob"));
    await a.inbox.next("match_found");
    await b.inbox.next("match_found");
    for (const peer of [a, b]) {
      peer.send({ type: "random_team", count: 6 });
      await peer.inbox.next("state", (m) => m.state.team.length === 6);
      peer.send({ type: "accept_team" });
    }
    const prep = (
      await a.inbox.next("state", (m) => m.state.phase === "preparing")
    ).state;
    a.send({ type: "battle_ready", preparationId: prep.preparation!.id });
    const ended = (
      await a.inbox.next("state", (m) => m.state.phase === "finished")
    ).state;
    assert.deepEqual(ended.result, {
      winner: "p1",
      reason: "preparation_timeout",
    });
    a.close();
    b.close();
  } finally {
    await timed.close();
  }
  const rateLimited = createApplication(
    { ...settings, maxMessagesPerSecond: 2 },
    () => undefined,
  );
  await rateLimited.listen();
  try {
    const peer = await webPeer(
      (rateLimited.addresses().websocket as AddressInfo).port,
    );
    peer.send(join("Alice"));
    await peer.inbox.next("waiting");
    peer.socket.send("not-json");
    peer.socket.send("not-json");
    assert.equal(
      (await peer.inbox.next("error", (m) => m.code === "RATE_LIMITED")).code,
      "RATE_LIMITED",
    );
  } finally {
    await rateLimited.close();
  }
  const idle = createApplication(
    { ...settings, joinTimeoutMs: 100 },
    () => undefined,
  );
  await idle.listen();
  try {
    assert.equal(
      (
        await (
          await webPeer((idle.addresses().websocket as AddressInfo).port)
        ).inbox.next("error")
      ).code,
      "JOIN_TIMEOUT",
    );
  } finally {
    await idle.close();
  }
  console.log(
    "TCP/WebSocket/HTTP integration passed: private simultaneous choices, retry, full battle, timeout, local data and security.",
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
