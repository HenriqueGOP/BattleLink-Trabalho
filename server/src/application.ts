import { createServer, Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, Server as HttpServer } from "node:http";
import { StringDecoder } from "node:string_decoder";
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./game/manager";
import { Room } from "./game/room";
import { ClientMessage, ServerMessage } from "./game/types";
import { config, ServerConfig } from "./config";
import { parseClientMessage } from "./protocol";
import { fetchPokemonCatalog } from "./game/pokeapi";
import {
  authenticate,
  ConnectionLimits,
  isAllowedOrigin,
  MessageBudget,
  validateServerConfig,
} from "./security";

const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_OUTBOUND_BYTES = 512 * 1024;
type Sender = ((message: ServerMessage) => void) & { close: () => void };

/** Os três transportes compartilham validação, fila de comandos e ciclo de sala. */
export function createApplication(
  settings: ServerConfig = config,
  trace: (message: string) => void = console.log,
) {
  validateServerConfig(settings);
  const manager = new RoomManager();
  const senders = new Map<string, Sender>();
  const joinTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const sockets = new Set<Socket>();
  const limits = new ConnectionLimits(settings.maxConnections, settings.maxConnectionsPerIp);
  const webServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();
  let stopping = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function broadcast(room: Room): void {
    for (const player of room.state.players)
      senders.get(player.id)?.({ type: "state", state: room.getStateFor(player.id) });
  }

  function fail(sender: Sender, message: string, code = "INVALID_MESSAGE"): void {
    sender({ type: "error", code, message });
  }

  function register(playerId: string, sender: Sender): void {
    senders.set(playerId, sender);
    const timer = setTimeout(() => {
      fail(sender, "Tempo para entrar na fila esgotado.", "JOIN_TIMEOUT");
      sender.close();
    }, settings.joinTimeoutMs);
    timer.unref();
    joinTimers.set(playerId, timer);
  }

  function clearJoinTimer(playerId: string): void {
    const timer = joinTimers.get(playerId);
    if (timer) clearTimeout(timer);
    joinTimers.delete(playerId);
  }

  async function disconnect(playerId: string): Promise<void> {
    // Cancela também os comandos enfileirados, antes de aguardar o mutex.
    if (!senders.delete(playerId)) return;
    trace(`[desconexão] ${playerId}`);
    clearJoinTimer(playerId);
    const room = manager.roomOf(playerId);
    if (!room) {
      manager.remove(playerId);
      return;
    }
    const unlock = await room.mutex.acquire();
    try {
      if (manager.roomOf(playerId) !== room) return;
      if (room.state.phase !== "finished") {
        room.forfeit(playerId);
        broadcast(room);
        const opponent = room.state.players.find((player) => player.id !== playerId)!;
        senders.get(opponent.id)?.({
          type: "opponent_left",
          message: "O oponente desconectou. Você venceu por desistência.",
        });
      }
    } finally {
      manager.remove(playerId);
      unlock();
    }
  }

  async function handle(sender: Sender, playerId: string, message: ClientMessage): Promise<void> {
    if (!senders.has(playerId) || stopping) return;
    if (message.type === "join") {
      if (!authenticate(message.token, settings.accessToken)) {
        fail(sender, "Chave de acesso ausente ou inválida.", "UNAUTHORIZED");
        sender.close();
        return;
      }
      clearJoinTimer(playerId);
      const current = manager.roomOf(playerId);
      if (current) {
        sender({ type: "match_found", roomId: current.id, state: current.getStateFor(playerId) });
        return;
      }
      const room = manager.enqueue(playerId, message.name.slice(0, settings.maxPlayerNameLength));
      if (!room) {
        sender({
          type: "waiting",
          message: `Aguardando oponente (posição ${manager.waitingPosition(playerId)}).`,
        });
        return;
      }
      trace(`[partida] ${room.id}: dois jogadores conectados`);
      for (const player of room.state.players)
        senders.get(player.id)?.({
          type: "match_found",
          roomId: room.id,
          state: room.getStateFor(player.id),
        });
      return;
    }
    if (message.type === "leave") {
      sender.close();
      return;
    }
    const room = manager.roomOf(playerId);
    if (!room) {
      fail(sender, "Entre na fila antes de jogar.", "NOT_IN_MATCH");
      return;
    }
    // HTTP ocorre fora da região crítica. A confirmação revalida fase, equipe e sala.
    const prepared =
      message.type === "choose_pokemon"
        ? await room.preparePokemon(playerId, message.pokemon)
        : null;
    const unlock = await room.mutex.acquire();
    trace(`[mutex] ${room.id}: lock adquirido por ${playerId}`);
    try {
      if (!senders.has(playerId) || manager.roomOf(playerId) !== room || stopping) return;
      if (prepared) room.commitPokemon(prepared);
      else if (message.type === "set_moves")
        room.setMoves(playerId, message.pokemon, message.moves);
      else if (message.type === "accept_team") room.acceptTeam(playerId);
      else if (message.type === "reset_team") room.resetTeam(playerId);
      else if (message.type === "terastallize") room.terastallize(playerId);
      else if (message.type === "switch_pokemon") room.switchPokemon(playerId, message.pokemon);
      else if (message.type === "action") room.applyAction(playerId, message.action);
      broadcast(room);
    } finally {
      unlock();
      trace(`[mutex] ${room.id}: lock liberado`);
    }
  }

  function dispatcher(sender: Sender, playerId: string): (raw: string, binary?: boolean) => void {
    let chain = Promise.resolve();
    let pending = 0;
    const budget = new MessageBudget(settings.maxMessagesPerSecond);
    return (raw, binary = false) => {
      if (!senders.has(playerId)) return;
      if (!budget.consume()) {
        fail(sender, "Muitas mensagens. Reconecte e tente novamente.", "RATE_LIMITED");
        sender.close();
        return;
      }
      if (binary) {
        fail(sender, "Envie mensagens JSON em texto.");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        fail(sender, "JSON inválido.", "MALFORMED_JSON");
        return;
      }
      let message: ClientMessage;
      try {
        message = parseClientMessage(parsed);
      } catch (error) {
        fail(sender, error instanceof Error ? error.message : "Mensagem inválida.");
        return;
      }
      // Leave não fica preso atrás de uma busca externa pendente.
      if (message.type === "leave") {
        sender.close();
        return;
      }
      if (pending >= settings.maxPendingMessages) {
        fail(sender, "Fila de mensagens cheia.", "QUEUE_FULL");
        sender.close();
        return;
      }
      pending++;
      // FIFO por conexão, sem impedir o outro jogador de usar a sala durante HTTP.
      chain = chain
        .then(() => handle(sender, playerId, message))
        .catch((error) => {
          if (senders.has(playerId))
            fail(sender, error instanceof Error ? error.message : "Mensagem inválida.");
        })
        .finally(() => {
          pending--;
        });
    };
  }

  const tcpServer = createServer((socket) => {
    const release = limits.acquire(socket.remoteAddress);
    if (!release || stopping) {
      release?.();
      socket.destroy();
      return;
    }
    const playerId = `player-${randomUUID()}`;
    const sender: Sender = Object.assign(
      (message: ServerMessage) => {
        if (socket.destroyed || !socket.writable) return;
        if (socket.writableLength > MAX_OUTBOUND_BYTES) {
          sender.close();
          return;
        }
        socket.write(`${JSON.stringify(message)}\n`);
      },
      {
        close: () => {
          void disconnect(playerId);
          socket.end();
          socket.setTimeout(1000, () => socket.destroy());
        },
      },
    );
    register(playerId, sender);
    const dispatch = dispatcher(sender, playerId);
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    socket.setKeepAlive(true, 30000);
    sender({ type: "welcome", playerId, protocol: settings.protocolVersion });
    socket.on("data", (data) => {
      buffer += decoder.write(data);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
          fail(sender, "Mensagem grande demais.", "PAYLOAD_TOO_LARGE");
          sender.close();
          return;
        }
        if (line.trim()) dispatch(line);
        if (!senders.has(playerId)) return;
      }
      if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
        fail(sender, "Mensagem grande demais.", "PAYLOAD_TOO_LARGE");
        sender.close();
      }
    });
    socket.on("close", () => {
      release();
      void disconnect(playerId);
    });
    socket.on("error", () => socket.destroy());
  });

  const webBridge = createHttpServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  webBridge.on("upgrade", (request, socket, head) => {
    socket.on("error", () => socket.destroy());
    if (
      stopping ||
      request.url !== "/" ||
      !isAllowedOrigin(request.headers.origin, settings.allowedOrigins)
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const release = limits.acquire(request.socket.remoteAddress);
    if (!release) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      return;
    }
    socket.once("close", release);
    webServer.handleUpgrade(request, socket, head, (ws) => {
      const playerId = `web-${randomUUID()}`;
      const sender: Sender = Object.assign(
        (message: ServerMessage) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (ws.bufferedAmount > MAX_OUTBOUND_BYTES) {
            sender.close();
            return;
          }
          ws.send(JSON.stringify(message));
        },
        {
          close: () => {
            void disconnect(playerId);
            ws.close(1000);
            const timer = setTimeout(() => ws.terminate(), 1000);
            timer.unref();
            ws.once("close", () => clearTimeout(timer));
          },
        },
      );
      register(playerId, sender);
      alive.set(ws, true);
      ws.on("pong", () => alive.set(ws, true));
      const dispatch = dispatcher(sender, playerId);
      sender({ type: "welcome", playerId, protocol: settings.protocolVersion });
      ws.on("message", (raw, binary) => dispatch(raw.toString(), binary));
      ws.on("close", () => {
        release();
        void disconnect(playerId);
      });
      ws.on("error", () => ws.terminate());
    });
  });

  let catalogBody: Promise<string> | null = null;
  const apiServer = createHttpServer(async (request, response) => {
    const origin = request.headers.origin;
    response.setHeader("Vary", "Origin");
    if (origin && !isAllowedOrigin(origin, settings.allowedOrigins)) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    const pathname = (request.url ?? "").split("?")[0];
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (pathname !== "/api/pokemon") {
      response.writeHead(404);
      response.end(JSON.stringify({ error: "Rota não encontrada." }));
      return;
    }
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "GET");
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET, OPTIONS");
      response.writeHead(405);
      response.end();
      return;
    }
    try {
      if (!catalogBody)
        catalogBody = fetchPokemonCatalog()
          .then((pokemon) => JSON.stringify({ pokemon }))
          .catch((error) => {
            catalogBody = null;
            throw error;
          });
      const body = await catalogBody;
      response.writeHead(200);
      response.end(body);
    } catch {
      response.writeHead(502);
      response.end(
        JSON.stringify({
          error: "Catálogo indisponível. Conecte à internet para preencher o cache local.",
        }),
      );
    }
  });

  for (const listener of [tcpServer, webBridge, apiServer]) {
    listener.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    listener.on("error", (error) => console.error(`[servidor] ${error.message}`));
  }
  function bind(
    listener: typeof tcpServer | HttpServer,
    port: number,
    host = settings.host,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        listener.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        listener.off("error", onError);
        resolve();
      };
      listener.once("error", onError);
      listener.once("listening", onListening);
      listener.listen(port, host);
    });
  }
  async function close(): Promise<void> {
    stopping = true;
    if (heartbeat) clearInterval(heartbeat);
    for (const timer of joinTimers.values()) clearTimeout(timer);
    joinTimers.clear();
    for (const ws of webServer.clients) ws.terminate();
    for (const socket of sockets) socket.destroy();
    await Promise.all(
      [tcpServer, webBridge, apiServer].map(
        (listener) =>
          new Promise<void>((resolve) => {
            if (!listener.listening) {
              resolve();
              return;
            }
            listener.close(() => resolve());
          }),
      ),
    );
    await new Promise<void>((resolve) => webServer.close(() => resolve()));
  }
  return {
    async listen(): Promise<void> {
      const results = await Promise.allSettled([
        bind(tcpServer, settings.tcpPort, settings.tcpHost),
        bind(webBridge, settings.webSocketPort),
        bind(apiServer, settings.httpPort),
      ]);
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure) {
        await close();
        throw failure.reason;
      }
      heartbeat = setInterval(() => {
        for (const ws of webServer.clients) {
          if (!alive.get(ws)) {
            ws.terminate();
            continue;
          }
          alive.set(ws, false);
          ws.ping();
        }
      }, 30000);
      heartbeat.unref();
    },
    close,
    addresses: () => ({
      tcp: tcpServer.address(),
      websocket: webBridge.address(),
      http: apiServer.address(),
    }),
  };
}
