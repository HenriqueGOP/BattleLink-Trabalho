import { createServer, createConnection, Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./game/manager";
import { Room } from "./game/room";
import { ClientMessage, ServerMessage } from "./game/types";
import { config } from "./config";
import { parseClientMessage } from "./protocol";
import { ensureCatalog } from "./game/pokeapi";

const httpPort = Number(process.env.HTTP_PORT ?? 3003);
const CATALOG_LIMIT = 1025;
const CATALOG_TTL_MS = 10 * 60 * 1000;
const MAX_TCP_BUFFER_BYTES = 64 * 1024;
const MAX_WEBSOCKET_MESSAGE_BYTES = 64 * 1024;

const manager = new RoomManager();
type Sender = ((message: ServerMessage) => void) & { close?: () => void };
const senders = new Map<string, Sender>();

function send(socket: Socket, message: ServerMessage): void {
  socket.write(`${JSON.stringify(message)}\n`);
}

function managerRooms(): Array<[string, ReturnType<RoomManager["roomOf"]>]> {
  const result: Array<[string, ReturnType<RoomManager["roomOf"]>]> = [];
  for (const playerId of senders.keys()) {
    const room = manager.roomOf(playerId);
    if (room) result.push([playerId, room]);
  }
  return result;
}

/**
 * Entrega a CADA jogador da sala o snapshot na visao dele (room.getStateFor).
 * Antes mandava o mesmo `room.state` cru para os dois, o que revelava a equipe
 * completa, os golpes e o PP do adversario.
 */
function broadcast(roomId: string, build: (viewerId: string, room: Room) => ServerMessage): void {
  for (const [playerId, room] of managerRooms()) {
    if (room && room.id === roomId) senders.get(playerId)?.(build(playerId, room));
  }
}

function fail(sender: Sender, message: string, code = "INVALID_MESSAGE"): void {
  sender({ type: "error", code, message });
}

async function handle(sender: Sender, playerId: string, message: ClientMessage): Promise<void> {
  if (message.type === "join") {
    const name = typeof message.name === "string" && message.name.trim() ? message.name.slice(0, config.maxPlayerNameLength) : "Jogador";
    // join repetido de quem ja esta em partida: reenvia o snapshot em vez de
    // responder "Aguardando oponente (posição 0)", que nao queria dizer nada.
    const current = manager.roomOf(playerId);
    if (current) {
      sender({ type: "match_found", roomId: current.id, state: current.getStateFor(playerId) });
      return;
    }
    const room = manager.enqueue(playerId, name);
    if (!room) {
      sender({ type: "waiting", message: `Aguardando oponente (posição ${manager.waitingPosition(playerId)}).` });
      console.log(`[fila] ${name} aguardando`);
      return;
    }
    console.log(`[partida] ${room.id}: dois jogadores conectados`);
    broadcast(room.id, (viewerId, current2) => ({ type: "match_found", roomId: current2.id, state: current2.getStateFor(viewerId) }));
    return;
  }

  if (message.type === "leave") {
    sender.close?.();
    return;
  }

  const room = manager.roomOf(playerId);
  if (!room) {
    fail(sender, "Entre em uma partida enviando {\"type\":\"join\",\"name\":\"...\"}.", "NOT_IN_MATCH");
    return;
  }

  const unlock = await room.mutex.acquire();
  console.log(`[mutex] ${room.id}: lock adquirido por ${playerId}`);
  try {
    if (message.type === "choose_pokemon") await room.choosePokemon(playerId, message.pokemon);
    else if (message.type === "set_moves") room.setMoves(playerId, message.pokemon, message.moves);
    else if (message.type === "reset_team") room.resetTeam(playerId);
    else if (message.type === "terastallize") room.terastallize(playerId);
    else if (message.type === "switch_pokemon") room.switchPokemon(playerId, message.pokemon);
    else if (message.type === "action") room.applyAction(playerId, message.action);
    else {
      fail(sender, "Mensagem desconhecida ou fora da ordem.");
      return;
    }
    broadcast(room.id, (viewerId, current) => ({ type: "state", state: current.getStateFor(viewerId) }));
    if (room.state.phase === "finished") console.log(`[partida] vencedor: ${room.winner}`);
  } catch (cause) {
    fail(sender, cause instanceof Error ? cause.message : "Mensagem inválida.");
  } finally {
    unlock();
    console.log(`[mutex] ${room.id}: lock liberado`);
  }
}

const server = createServer(socket => {
  const playerId = `player-${randomUUID()}`;
  const sender: Sender = message => send(socket, message);
  sender.close = () => socket.end();
  senders.set(playerId, sender);
  let buffer = "";
  send(socket, { type: "welcome", playerId, protocol: "pokemon-battle/1" });
  console.log(`[conexão] ${playerId} conectado via TCP`);

  socket.on("data", data => {
    buffer += data.toString("utf8");
    if (Buffer.byteLength(buffer, "utf8") > MAX_TCP_BUFFER_BYTES) {
      fail(sender, "Mensagem grande demais.", "PAYLOAD_TOO_LARGE");
      socket.end();
      return;
    }
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      try {
        void handle(sender, playerId, parseClientMessage(JSON.parse(line)));
      } catch {
        fail(sender, "JSON inválido. Envie uma mensagem por linha.", "MALFORMED_JSON");
      }
    }
  });

  socket.on("close", () => {
    const room = manager.roomOf(playerId);
    const opponent = room?.state.players.find(player => player.id !== playerId)?.id;
    if (opponent) {
      senders.get(opponent)?.({ type: "opponent_left", message: "O oponente desconectou." });
    }
    manager.remove(playerId);
    senders.delete(playerId);
    console.log(`[desconexão] ${playerId}`);
  });
  socket.on("error", error => console.warn(`[tcp] ${playerId}: ${error.message}`));
});

// ---------- API HTTP (catálogo de Pokémon para o front React) ----------

let catalogCache: { at: number; body: string } | null = null;

async function catalogBody(): Promise<string> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.body;
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${CATALOG_LIMIT}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`PokeAPI respondeu ${response.status}`);
  const list = (await response.json()) as { results: Array<{ name: string }> };
  const body = JSON.stringify({
    pokemon: list.results.map((entry, index) => ({
      id: index + 1,
      name: entry.name,
      image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${index + 1}.png`,
    })),
  });
  catalogCache = { at: Date.now(), body };
  return body;
}

const apiServer = createHttpServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  const pathname = (request.url ?? "").split("?")[0];
  if (pathname === "/api/pokemon") {
    try {
      const body = await catalogBody();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(body);
    } catch (error) {
      console.error("[api] falhou ao buscar o catálogo:", error);
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Falha ao contatar a PokeAPI." }));
    }
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Rota não encontrada." }));
});

// ---------- pre-flight: porta ocupada? Avisa com o comando pronto ----------

function checkPortFree(port: number, host: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = createConnection({ port, host }, () => {
      probe.destroy();
      const howTo =
        process.platform === "win32"
          ? `  netstat -ano | findstr :${port}\n  taskkill /PID <PID> /F`
          : `  lsof -i :${port}\n  kill -9 <PID>`;
      reject(new Error(`${label}: a porta ${host}:${port} já está ocupada (provavelmente um servidor antigo rodando). Descubra o PID e encerre com:\n${howTo}`));
    });
    probe.on("error", () => resolve());
  });
}

async function main(): Promise<void> {
  await checkPortFree(config.tcpPort, config.host, "TCP");
  await checkPortFree(config.webSocketPort, config.host, "WebSocket");
  await checkPortFree(httpPort, config.host, "HTTP");

  const webServer = new WebSocketServer({ port: config.webSocketPort, host: config.host, maxPayload: MAX_WEBSOCKET_MESSAGE_BYTES });
  webServer.on("connection", ws => {
    const playerId = `web-${randomUUID()}`;
    const sender: Sender = message => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    };
    sender.close = () => ws.close();
    senders.set(playerId, sender);
    sender({ type: "welcome", playerId, protocol: "pokemon-battle/1" });
    console.log(`[conexão] ${playerId} conectado via WebSocket`);

    ws.on("message", raw => {
      const rawSize = Array.isArray(raw)
        ? raw.reduce((total, chunk) => total + chunk.length, 0)
        : raw instanceof ArrayBuffer ? raw.byteLength : raw.length;
      if (rawSize > MAX_WEBSOCKET_MESSAGE_BYTES) {
        fail(sender, "Mensagem grande demais.", "PAYLOAD_TOO_LARGE");
        ws.close(1009, "Mensagem grande demais");
        return;
      }
      try {
        void handle(sender, playerId, parseClientMessage(JSON.parse(raw.toString())));
      } catch {
        fail(sender, "JSON inválido.", "MALFORMED_JSON");
      }
    });
    ws.on("close", () => {
      const room = manager.roomOf(playerId);
      const opponent = room?.state.players.find(player => player.id !== playerId)?.id;
      if (opponent) senders.get(opponent)?.({ type: "opponent_left", message: "O oponente desconectou." });
      manager.remove(playerId);
      senders.delete(playerId);
      console.log(`[desconexão] ${playerId}`);
    });
    ws.on("error", error => console.warn(`[websocket] ${playerId}: ${error.message}`));
  });
  webServer.on("error", error => console.error(`[websocket] ${error.message}`));
  console.log(`Ponte WebSocket para React em ws://${config.host}:${config.webSocketPort}`);

  server.listen(config.tcpPort, config.host, () => {
    console.log(`Servidor TCP Pokémon Battle em ${config.host}:${config.tcpPort}`);
  });

  apiServer.listen(httpPort, config.host, () => {
    console.log(`API HTTP do catálogo em http://${config.host}:${httpPort}/api/pokemon`);
  });
  server.on("error", error => console.error(`[tcp] ${error.message}`));
  apiServer.on("error", error => console.error(`[http] ${error.message}`));

  void ensureCatalog()
    .then(() => console.log("Catálogo PokéAPI carregado: todos os 1025 Pokémon liberados."))
    .catch(() => console.warn("Aviso: não consegui pré-carregar a PokéAPI — tentarei sob demanda."));
}

main().catch(error => {
  console.error(`\n[erro fatal] ${error.message}\n`);
  process.exit(1);
});
