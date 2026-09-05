import { createServer, Socket } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./game/manager";
import { ClientMessage, ServerMessage } from "./game/types";
import { config } from "./config";
import { parseClientMessage } from "./protocol";

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

function broadcast(roomId: string, message: ServerMessage): void {
  for (const [playerId, room] of managerRooms()) {
    if (room?.id === roomId) {
      senders.get(playerId)?.(message);
    }
  }
}

function fail(sender: Sender, message: string, code = "INVALID_MESSAGE"): void {
  sender({ type: "error", code, message });
}

async function handle(sender: Sender, playerId: string, message: ClientMessage): Promise<void> {
  if (message.type === "join") {
    const name = typeof message.name === "string" && message.name.trim() ? message.name.slice(0, config.maxPlayerNameLength) : "Jogador";
    const room = manager.enqueue(playerId, name);
    if (!room) {
      sender({ type: "waiting", message: `Aguardando oponente (posição ${manager.waitingPosition(playerId)}).` });
      console.log(`[fila] ${name} aguardando`);
      return;
    }
    console.log(`[partida] ${room.id}: dois jogadores conectados`);
    broadcast(room.id, { type: "match_found", roomId: room.id, state: room.state });
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
    if (message.type === "choose_pokemon") room.choosePokemon(playerId, message.pokemon);
    else if (message.type === "action") room.applyAction(playerId, message.action);
    else {
      fail(sender, "Mensagem desconhecida ou fora da ordem.");
      return;
    }
    broadcast(room.id, { type: "state", state: room.state });
    if (room.state.phase === "finished") console.log(`[partida] vencedor: ${room.winner}`);
  } catch (cause) {
    fail(sender, cause instanceof Error ? cause.message : "Mensagem inválida.");
  } finally {
    unlock();
    console.log(`[mutex] ${room.id}: lock liberado`);
  }
}

const server = createServer(socket => {
  const playerId = `player-${Math.random().toString(36).slice(2, 10)}`;
  const sender: Sender = message => send(socket, message);
  sender.close = () => socket.end();
  senders.set(playerId, sender);
  let buffer = "";
  send(socket, { type: "welcome", playerId, protocol: "pokemon-battle/1" });
  console.log(`[conexão] ${playerId} conectado via TCP`);

  socket.on("data", data => {
    buffer += data.toString("utf8");
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
});

server.listen(config.tcpPort, config.host, () => {
  console.log(`Servidor TCP Pokémon Battle em ${config.host}:${config.tcpPort}`);
});

const webServer = new WebSocketServer({ port: config.webSocketPort, host: config.host });
webServer.on("connection", ws => {
  const playerId = `web-${Math.random().toString(36).slice(2, 10)}`;
  const sender: Sender = message => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };
  sender.close = () => ws.close();
  senders.set(playerId, sender);
  sender({ type: "welcome", playerId, protocol: "pokemon-battle/1" });
  console.log(`[conexão] ${playerId} conectado via WebSocket`);

  ws.on("message", raw => {
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
});
console.log(`Ponte WebSocket para React em ws://${config.host}:${config.webSocketPort}`);
