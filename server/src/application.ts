import { FORMATS } from "./contracts/formats";
import { TRAINERS } from "./contracts/trainers";
import { createServer, Socket } from "node:net";
import { randomUUID } from "node:crypto";
import {
  createServer as createHttpServer,
  Server as HttpServer,
} from "node:http";
import { StringDecoder } from "node:string_decoder";
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./game/manager";
import { Room } from "./game/room";
import { ClientMessage, ServerMessage } from "./game/types";
import { config, ServerConfig } from "./config";
import { parseClientMessage, readSetupEditId } from "./protocol";
import { catalog } from "./contracts/catalog";
import { BattleRuleError } from "./game/engine";
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
  const identities = new Map<string, string>();
  const peers = new Map<string, string>();
  const receipts = new Map<string, Map<string, string>>();
  const admission = new Map<string, { starts: number; creates: number; joins: number }>();
  const botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const rematchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let housekeeping: ReturnType<typeof setInterval> | null = null;
  const senders = new Map<string, Sender>();
  const joinTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const preparationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const sockets = new Set<Socket>();
  const limits = new ConnectionLimits(
    settings.maxConnections,
    settings.maxConnectionsPerIp,
  );
  const webServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });
  const alive = new WeakMap<WebSocket, boolean>();
  let stopping = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function broadcast(room: Room, edit?: { playerId: string; editId: string }): void {
    room.openRematch();
    scheduleBot(room);
    scheduleRematch(room);
    for (const player of room.state.players)
      senders.get(player.id)?.({
        type: "state",
        state: room.getStateFor(player.id),
        ...(edit?.playerId === player.id ? { editId: edit.editId } : {}),
      });
  }

  function sendMatch(room: Room, command?: { playerId: string; commandId: string }): void {
    for (const player of room.state.players) senders.get(player.id)?.({ type: "match_found", roomId: room.id, state: room.getStateFor(player.id), ...(command?.playerId === player.id ? { commandId: command.commandId } : {}) });
    updatePreparationTimer(room); scheduleBot(room);
  }
  function clearRoomTimers(room: Room): void {
    for (const timers of [preparationTimers, botTimers, rematchTimers]) { const timer = timers.get(room.id); if (timer) clearTimeout(timer); timers.delete(room.id); }
  }
  function scheduleBot(room: Room): void {
    const requestId = room.botRequest;
    if (!requestId || botTimers.has(room.id) || stopping) return;
    const timer = setTimeout(() => {
      void (async () => {
        const unlock = await room.mutex.acquire();
        try {
          if (manager.roomOf(room.state.players[0].id) !== room || stopping || room.botRequest !== requestId) return;
          room.playBot(); broadcast(room);
        } catch (error) {
          trace(`[bot] falha na partida ${room.id}: ${error instanceof Error ? error.message : "erro"}`);
          room.forfeit(room.state.players[1].id); broadcast(room);
        } finally { botTimers.delete(room.id); unlock(); if (manager.roomOf(room.state.players[0].id) === room) scheduleBot(room); }
      })();
    }, 180);
    timer.unref(); botTimers.set(room.id, timer);
  }
  function scheduleRematch(room: Room): void {
    const snapshot = room.getStateFor(room.state.players[0].id);
    if (!snapshot.rematch.expiresAt || !snapshot.rematch.available || rematchTimers.has(room.id)) return;
    const timer = setTimeout(() => {
      void (async () => {
        const unlock = await room.mutex.acquire();
        try { if (manager.roomOf(room.state.players[0].id) === room) { room.expireRematch(); broadcast(room); } }
        finally { rematchTimers.delete(room.id); unlock(); }
      })();
    }, Math.max(0, snapshot.rematch.expiresAt - Date.now()));
    timer.unref(); rematchTimers.set(room.id, timer);
  }
  function limitAdmission(id: string, kind: "creates" | "joins"): void {
    const keys = [`player:${id}`, `ip:${peers.get(id) ?? id}`];
    const now = Date.now();
    for (const key of keys) {
      let entry = admission.get(key);
      if (!entry || now - entry.starts >= 60000) { entry = { starts: now, creates: 0, joins: 0 }; admission.set(key, entry); }
      if (++entry[kind] > (kind === "creates" ? 3 : 10)) throw new Error("Muitas tentativas de convite. Aguarde um minuto.");
    }
  }
  async function depart(id: string): Promise<void> {
    const room = manager.roomOf(id), lobby = manager.lobbyOf(id);
    const members = room?.state.players ?? lobby?.players ?? [];
    const unlock = room ? await room.mutex.acquire() : () => undefined;
    try {
      if (room && manager.roomOf(id) === room) {
        if (room.state.phase !== "finished") { room.forfeit(id); broadcast(room); }
        clearRoomTimers(room);
      }
      manager.remove(id);
      for (const member of members) if (member.id !== id && senders.has(member.id)) {
        senders.get(member.id)?.({ type: "opponent_left", message: "O oponente saiu. A partida foi encerrada." });
        if (lobby) senders.get(member.id)?.({ type: "lobby", lobby: manager.lobbyOf(member.id), message: "O convidado saiu ou a sala foi encerrada." });
      }
    } finally { unlock(); }
  }
  function updatePreparationTimer(room: Room): void {
    if (!room.preparing) {
      const timer = preparationTimers.get(room.id);
      if (timer) clearTimeout(timer);
      preparationTimers.delete(room.id);
      return;
    }
    if (preparationTimers.has(room.id)) return;
    const timer = setTimeout(() => {
      void (async () => {
        const unlock = await room.mutex.acquire();
        try {
          if (manager.roomOf(room.state.players[0].id) !== room || stopping)
            return;
          room.preparationExpired();
          broadcast(room);
        } finally {
          preparationTimers.delete(room.id);
          unlock();
        }
      })();
    }, settings.preparationTimeoutMs);
    timer.unref();
    preparationTimers.set(room.id, timer);
  }

  function fail(
    sender: Sender,
    message: string,
    code = "INVALID_MESSAGE",
    editId?: string,
  ): void {
    sender({ type: "error", code, message, ...(editId ? { editId } : {}) });
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
    identities.delete(playerId); receipts.delete(playerId); peers.delete(playerId);
    await depart(playerId);
  }

  async function handle(
    sender: Sender,
    playerId: string,
    message: ClientMessage,
  ): Promise<void> {
    if (!senders.has(playerId) || stopping) return;
    if (message.type === "join") {
      if (!authenticate(message.token, settings.accessToken)) {
        fail(sender, "Chave de acesso ausente ou inválida.", "UNAUTHORIZED");
        sender.close();
        return;
      }
      clearJoinTimer(playerId);
      if (message.catalogVersion !== catalog.version) {
        fail(
          sender,
          "Catálogo incompatível. Atualize o cliente e o servidor.",
          "CATALOG_MISMATCH",
        );
        sender.close();
        return;
      }
      identities.set(playerId, message.name.slice(0, settings.maxPlayerNameLength));
      sender({ type: "lobby", lobby: manager.lobbyOf(playerId), message: "Escolha como jogar." });
      return;
    }
    if (message.type === "leave") { sender.close(); return; }
    const name = identities.get(playerId);
    if (!name) { fail(sender, "Identifique-se antes de jogar.", "UNAUTHORIZED"); return; }
    if (message.type === "room_leave") {
      await depart(playerId);
      sender({ type: "lobby", lobby: manager.lobbyOf(playerId), message: "Escolha seu próximo desafio." }); return;
    }
    if (message.type === "queue_cancel") {
      if (manager.roomOf(playerId) || manager.lobbyOf(playerId)) throw new Error("Saia da sala atual antes de cancelar uma busca.");
      manager.cancel(playerId); sender({ type: "lobby", lobby: manager.lobbyOf(playerId), message: "Busca cancelada." }); return;
    }
    if (["queue_join", "private_create", "private_join", "pve_start"].includes(message.type) && "commandId" in message) {
      const history = receipts.get(playerId) ?? new Map<string, string>();
      const fingerprint = JSON.stringify(message), previous = history.get(message.commandId);
      if (previous !== undefined) {
        if (previous !== fingerprint) throw new Error("Identificador de comando reutilizado com outro conteúdo.");
        const current = manager.roomOf(playerId), lobby = manager.lobbyOf(playerId);
        if (current) sender({ type: "match_found", roomId: current.id, state: current.getStateFor(playerId), commandId: message.commandId });
        else if (lobby) sender({ type: "lobby", lobby, message: "Aguardando seu amigo.", commandId: message.commandId });
        else if (manager.waitingPosition(playerId)) sender({ type: "waiting", message: "Aguardando oponente neste formato.", commandId: message.commandId });
        else throw new Error("Este comando já foi concluído. Inicie uma nova solicitação.");
        return;
      }
      let found: Room | null = null;
      if (message.type === "queue_join") {
        found = manager.enqueue(playerId, name, message.format);
        if (!found) sender({ type: "waiting", message: `Aguardando oponente neste formato (posição ${manager.waitingPosition(playerId)}).`, commandId: message.commandId });
      } else if (message.type === "private_create") {
        limitAdmission(playerId, "creates");
        sender({ type: "lobby", lobby: manager.createPrivate(playerId, name, message.format), message: "Compartilhe o código para convidar seu amigo.", commandId: message.commandId });
      } else if (message.type === "private_join") {
        limitAdmission(playerId, "joins"); found = manager.joinPrivate(playerId, name, message.code);
      } else if (message.type === "pve_start") {
        found = manager.startPve(playerId, name, message.trainerId, message.difficulty, message.format);
      }
      history.set(message.commandId, fingerprint); if (history.size > 64) history.delete(history.keys().next().value!); receipts.set(playerId, history);
      if (found) sendMatch(found, { playerId, commandId: message.commandId });
      return;
    }
    const room = manager.roomOf(playerId);
    if (!room) {
      fail(sender, "Entre na fila antes de jogar.", "NOT_IN_MATCH", readSetupEditId(message));
      return;
    }
    const unlock = await room.mutex.acquire();
    trace(`[mutex] ${room.id}: lock adquirido por ${playerId}`);
    try {
      if (
        !senders.has(playerId) ||
        manager.roomOf(playerId) !== room ||
        stopping
      )
        return;
      room.assertMatch("matchId" in message ? message.matchId : undefined);
      manager.touch(playerId);
      if (message.type === "rematch") {
        if (!message.accept) { room.expireRematch(); broadcast(room); return; }
        if (room.voteRematch(playerId, message.keepTeam)) { clearRoomTimers(room); sendMatch(manager.rematch(room)); }
        else broadcast(room);
        return;
      }
      if (message.type === "choose_pokemon")
        room.choosePokemon(playerId, message.pokemon);
      else if (message.type === "remove_pokemon")
        room.removePokemon(playerId, message.pokemon);
      else if (message.type === "reorder_team")
        room.reorderTeam(playerId, message.pokemon);
      else if (message.type === "random_team")
        room.randomTeam(playerId, message.count);
      else if (message.type === "set_moves")
        room.setMoves(playerId, message.pokemon, message.moves);
      else if (message.type === "accept_team") room.acceptTeam(playerId);
      else if (message.type === "reset_team") room.resetTeam(playerId);
      else if (message.type === "battle_ready")
        room.battleReady(playerId, message.preparationId);
      else if (message.type === "resync") {
        sender({ type: "state", state: room.getStateFor(playerId) });
        return;
      } else if (message.type === "action") {
        const update = room.applyAction(playerId, message);
        sender({
          type: "action_ack",
          matchId: room.matchId,
          requestId: message.requestId,
          actionId: message.actionId,
          duplicate: update.duplicate,
          resolved: update.resolved,
        });
        if (!update.resolved) {
          sender({ type: "state", state: room.getStateFor(playerId) });
          return;
        }
      }
      updatePreparationTimer(room);
      broadcast(room, "editId" in message && message.editId ? { playerId, editId: message.editId } : undefined);
    } catch (error) {
      if (room.state.phase === "finished") {
        updatePreparationTimer(room);
        broadcast(room);
      }
      throw error;
    } finally {
      unlock();
      trace(`[mutex] ${room.id}: lock liberado`);
    }
  }

  function dispatcher(
    sender: Sender,
    playerId: string,
  ): (raw: string, binary?: boolean) => void {
    let chain = Promise.resolve();
    let pending = 0;
    const budget = new MessageBudget(settings.maxMessagesPerSecond);
    return (raw, binary = false) => {
      if (!senders.has(playerId)) return;
      if (!budget.consume()) {
        fail(
          sender,
          "Muitas mensagens. Reconecte e tente novamente.",
          "RATE_LIMITED",
        );
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
        fail(
          sender,
          error instanceof Error ? error.message : "Mensagem inválida.",
          "INVALID_MESSAGE",
          readSetupEditId(parsed),
        );
        return;
      }
      // Leave não fica preso atrás de comandos pendentes.
      if (message.type === "leave") {
        sender.close();
        return;
      }
      if (pending >= settings.maxPendingMessages) {
        fail(sender, "Fila de mensagens cheia.", "QUEUE_FULL", readSetupEditId(message));
        sender.close();
        return;
      }
      pending++;
      // FIFO por conexão; catálogo e montagem são locais, sem I/O dentro do mutex.
      chain = chain
        .then(() => handle(sender, playerId, message))
        .catch((error) => {
          if (senders.has(playerId))
            sender({
              type: "error",
              code:
                error instanceof BattleRuleError
                  ? error.code
                  : "INVALID_MESSAGE",
              message:
                error instanceof BattleRuleError &&
                error.code === "ENGINE_CONTRACT"
                  ? "A partida foi interrompida por uma falha de execução."
                  : error instanceof Error
                    ? error.message
                    : "Mensagem inválida.",
              ...(message.type === "action"
                ? { actionId: message.actionId }
                : {}),
              ...("editId" in message && message.editId ? { editId: message.editId } : {}),
              ...("commandId" in message ? { commandId: message.commandId } : {}),
            });
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
    peers.set(playerId, socket.remoteAddress ?? "unknown");
    const dispatch = dispatcher(sender, playerId);
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    socket.setKeepAlive(true, 30000);
    sender({
      type: "welcome",
      playerId,
      protocol: settings.protocolVersion,
      catalogVersion: catalog.version,
    });
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
      socket.end(
        "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
      );
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
      peers.set(playerId, request.socket.remoteAddress ?? "unknown");
      alive.set(ws, true);
      ws.on("pong", () => alive.set(ws, true));
      const dispatch = dispatcher(sender, playerId);
      sender({
        type: "welcome",
        playerId,
        protocol: settings.protocolVersion,
        catalogVersion: catalog.version,
      });
      ws.on("message", (raw, binary) => dispatch(raw.toString(), binary));
      ws.on("close", () => {
        release();
        void disconnect(playerId);
      });
      ws.on("error", () => ws.terminate());
    });
  });

  const catalogBody = JSON.stringify({
    version: catalog.version,
    pokemon: catalog.species.map(({ id, num, name }) => ({ id, num, name })),
  });
  const apiServer = createHttpServer((request, response) => {
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
    if (!["/api/pokemon", "/api/game"].includes(pathname)) {
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
    response.writeHead(200);
    response.end(pathname === "/api/game" ? JSON.stringify({ protocol: settings.protocolVersion, formats: FORMATS, trainers: TRAINERS }) : catalogBody);
  });

  for (const listener of [tcpServer, webBridge, apiServer]) {
    listener.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    listener.on("error", (error) =>
      console.error(`[servidor] ${error.message}`),
    );
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
    if (housekeeping) clearInterval(housekeeping);
    for (const timers of [botTimers, rematchTimers]) { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); }
    for (const timer of joinTimers.values()) clearTimeout(timer);
    joinTimers.clear();
    for (const timer of preparationTimers.values()) clearTimeout(timer);
    preparationTimers.clear();
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
    manager.close();
  }
  return {
    async listen(): Promise<void> {
      housekeeping = setInterval(() => {
        for (const id of manager.sweep()) senders.get(id)?.({ type: "lobby", lobby: null, message: "O convite expirou. Crie uma nova sala." });
        for (const [key, entry] of admission) if (Date.now() - entry.starts > 60000) admission.delete(key);
      }, 15000);
      housekeeping.unref();
      const results = await Promise.allSettled([
        bind(tcpServer, settings.tcpPort, settings.tcpHost),
        bind(webBridge, settings.webSocketPort),
        bind(apiServer, settings.httpPort),
      ]);
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
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
