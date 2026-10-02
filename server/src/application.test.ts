import assert from "node:assert/strict";
import { createConnection } from "node:net";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { createApplication } from "./application";
import { config } from "./config";
import type { ClientMessage, ServerMessage } from "./game/types";
import {
  FIXTURE_NAMES,
  fixturePokeApiTransport,
  installPokeApiFixture,
} from "./game/pokeapi.fixture";
import { setPokeApiTransport } from "./game/pokeapi";

type OfType<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;
class Inbox {
  readonly history: ServerMessage[] = [];
  private messages: ServerMessage[] = [];
  private listeners = new Set<() => void>();
  receive(message: ServerMessage): void {
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
    for (const line of lines.filter(Boolean)) inbox.receive(JSON.parse(line) as ServerMessage);
  });
  const welcome = await inbox.next("welcome");
  return {
    inbox,
    id: welcome.playerId,
    send: (message: ClientMessage) => socket.write(`${JSON.stringify(message)}\n`),
    close: () => socket.destroy(),
  };
}

async function webPeer(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: config.allowedOrigins[0] });
  const inbox = new Inbox();
  socket.on("error", () => undefined);
  socket.on("message", (raw) => inbox.receive(JSON.parse(raw.toString()) as ServerMessage));
  const welcome = await inbox.next("welcome");
  return {
    inbox,
    id: welcome.playerId,
    socket,
    send: (message: ClientMessage) => socket.send(JSON.stringify(message)),
    close: () => socket.terminate(),
  };
}

function rejectedUpgrade(port: number, origin: string | undefined, status: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
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
  installPokeApiFixture();
  const settings = {
    ...config,
    host: "127.0.0.1",
    tcpPort: 0,
    webSocketPort: 0,
    httpPort: 0,
    accessToken: "test-access-key",
    maxConnections: 2,
    maxConnectionsPerIp: 2,
  };
  const application = createApplication(settings, () => undefined);
  await application.listen();
  const addresses = application.addresses();
  const tcpPort = (addresses.tcp as AddressInfo).port;
  const webPort = (addresses.websocket as AddressInfo).port;
  const httpPort = (addresses.http as AddressInfo).port;
  const join = (name: string): ClientMessage => ({
    type: "join",
    name,
    token: settings.accessToken,
  });
  try {
    await rejectedUpgrade(webPort, "http://evil.test", 403);
    await rejectedUpgrade(webPort, undefined, 403);
    const forbidden = await webPeer(webPort);
    const forbiddenClosed = new Promise<void>((resolve) =>
      forbidden.socket.once("close", () => resolve()),
    );
    forbidden.send({ type: "join", name: "Intruder" });
    assert.equal((await forbidden.inbox.next("error")).code, "UNAUTHORIZED");
    await forbiddenClosed;

    const alice = await tcpPeer(tcpPort);
    const bob = await webPeer(webPort);
    await rejectedUpgrade(webPort, config.allowedOrigins[0], 503);
    alice.send(join("Alice"));
    await alice.inbox.next("waiting");
    bob.send(join("Bob"));
    assert.equal((await alice.inbox.next("match_found")).state.phase, "setup");
    await bob.inbox.next("match_found");
    for (const pokemon of FIXTURE_NAMES.slice(0, 6))
      alice.send({ type: "choose_pokemon", pokemon });
    for (const pokemon of FIXTURE_NAMES.slice(6)) bob.send({ type: "choose_pokemon", pokemon });
    const readyAlice = await alice.inbox.next(
      "state",
      (message) => message.state.players[0].team.length === 6,
    );
    const readyBob = await bob.inbox.next(
      "state",
      (message) => message.state.players[1].team.length === 6,
    );
    assert.equal(readyAlice.state.phase, "setup");
    assert.equal(readyBob.state.phase, "setup");
    for (const pokemon of FIXTURE_NAMES.slice(6))
      assert.ok(!readyAlice.state.log.some((line) => line.includes(pokemon)));
    alice.send({ type: "set_moves", pokemon: FIXTURE_NAMES[0], moves: ["tackle"] });
    alice.send({ type: "accept_team" });
    const onlyAliceReady = await alice.inbox.next(
      "state",
      (message) => message.state.players[0].ready,
    );
    assert.equal(onlyAliceReady.state.phase, "setup");
    bob.send({ type: "set_moves", pokemon: FIXTURE_NAMES[6], moves: ["growl"] });
    bob.send({ type: "accept_team" });
    const battle = await alice.inbox.next("state", (message) => message.state.phase === "battle");
    await bob.inbox.next("state", (message) => message.state.phase === "battle");
    assert.equal(battle.state.players[0].pokemonData!.selectedMoves[0], "tackle");
    bob.send({ type: "set_moves", pokemon: FIXTURE_NAMES[6], moves: ["tackle"] });
    assert.match((await bob.inbox.next("error")).message, /travados/);
    alice.send({ type: "action", action: { type: "attack", move: "tackle" } });
    await alice.inbox.next("state", (message) =>
      message.state.events.some((event) => event.type === "damage"),
    );
    bob.close();
    const ended = await alice.inbox.next("state", (message) => message.state.phase === "finished");
    assert.equal(ended.state.winner, alice.id);
    assert.equal(ended.state.finishReason, "disconnect");
    await alice.inbox.next("opponent_left");
    // O sobrevivente pode entrar novamente na fila na mesma conexão.
    alice.send(join("Alice"));
    await alice.inbox.next("waiting");
    const newBob = await webPeer(webPort);
    newBob.send(join("Bob"));
    await newBob.inbox.next("match_found");
    await alice.inbox.next("match_found");

    // API lenta de Alice não impede reset de Bob nem o resultado da desconexão.
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setPokeApiTransport(async (url) => {
      if (url.endsWith("/pokemon/charizard")) {
        started();
        await gate;
      }
      return fixturePokeApiTransport(url);
    });
    alice.send({ type: "choose_pokemon", pokemon: "charizard" });
    await began;
    newBob.send({ type: "reset_team" });
    const unblocked = await newBob.inbox.next("state", (message) =>
      message.state.log.some((line) => line.includes("vai refazer")),
    );
    assert.equal(unblocked.state.phase, "setup");
    alice.close();
    const duringSetup = await newBob.inbox.next(
      "state",
      (message) => message.state.phase === "finished",
    );
    assert.equal(duringSetup.state.winner, newBob.id);
    assert.equal(duringSetup.state.players[0].team.length, 0);
    release();
    await newBob.inbox.next("opponent_left");
    newBob.close();
    installPokeApiFixture();
    const catalog = await fetch(`http://127.0.0.1:${httpPort}/api/pokemon`, {
      headers: { Origin: config.allowedOrigins[0] },
    });
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers.get("access-control-allow-origin"), config.allowedOrigins[0]);
    assert.equal(
      ((await catalog.json()) as { pokemon: unknown[] }).pokemon.length,
      FIXTURE_NAMES.length,
    );
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${httpPort}/api/pokemon`, {
          headers: { Origin: "http://evil.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(`http://127.0.0.1:${httpPort}/api/pokemon`, { method: "POST" })).status,
      405,
    );
  } finally {
    await application.close();
  }

  // Frequência e fila de comandos têm limites independentes do tamanho da mensagem.
  const rateLimited = createApplication({ ...settings, maxMessagesPerSecond: 2 }, () => undefined);
  await rateLimited.listen();
  try {
    const port = (rateLimited.addresses().websocket as AddressInfo).port;
    const peer = await webPeer(port);
    peer.send(join("Alice"));
    await peer.inbox.next("waiting");
    peer.socket.send("not-json");
    peer.socket.send("not-json");
    assert.equal(
      (await peer.inbox.next("error", (message) => message.code === "RATE_LIMITED")).code,
      "RATE_LIMITED",
    );
  } finally {
    await rateLimited.close();
  }
  const idle = createApplication({ ...settings, joinTimeoutMs: 100 }, () => undefined);
  await idle.listen();
  try {
    const peer = await webPeer((idle.addresses().websocket as AddressInfo).port);
    assert.equal((await peer.inbox.next("error")).code, "JOIN_TIMEOUT");
  } finally {
    await idle.close();
  }
  console.log("TCP/WebSocket/HTTP integration tests passed.");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
