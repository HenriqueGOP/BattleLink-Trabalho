import { randomBytes, randomUUID } from "node:crypto";
import { formatKey, validateFormat, type FormatChoice } from "../contracts/formats";
import { trainerById, type Difficulty } from "../contracts/trainers";
import type { PrivateLobbySnapshot } from "../contracts/protocol";
import { Room } from "./room";

interface PrivateRoom { id: string; code: string; host: { id: string; name: string }; guest?: { id: string; name: string }; format: FormatChoice; touched: number }
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export class RoomManager {
  private queue: Array<{ id: string; name: string; format: FormatChoice }> = [];
  private rooms = new Map<string, Room>();
  private privateRooms = new Map<string, PrivateRoom>();
  private memberships = new Map<string, PrivateRoom>();
  constructor(private readonly now: () => number = Date.now) {}
  private available(id: string): void {
    if (this.rooms.has(id) || this.memberships.has(id) || this.queue.some(player => player.id === id)) throw new Error("Saia da sala ou fila atual antes de continuar.");
  }
  private attach(room: Room): Room { for (const player of room.state.players) this.rooms.set(player.id, room); return room; }
  enqueue(id: string, name: string, requested: FormatChoice = { id: "classic" }): Room | null {
    if (this.queue.some(player => player.id === id)) return null;
    this.available(id);
    const format = validateFormat(requested);
    const index = this.queue.findIndex(player => formatKey(player.format) === formatKey(format));
    if (index < 0) { this.queue.push({ id, name, format }); return null; }
    const opponent = this.queue.splice(index, 1)[0];
    const room = new Room(opponent.id, id, undefined, { format, mode: "automatic" });
    room.setName(opponent.id, opponent.name); room.setName(id, name);
    return this.attach(room);
  }
  createPrivate(id: string, name: string, requested: FormatChoice): PrivateLobbySnapshot {
    this.available(id);
    let code: string;
    do { code = [...randomBytes(8)].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join(""); } while (this.privateRooms.has(code));
    const lobby: PrivateRoom = { id: `room-${randomUUID()}`, code, host: { id, name }, format: validateFormat(requested), touched: this.now() };
    this.privateRooms.set(code, lobby); this.memberships.set(id, lobby);
    return this.lobbyOf(id)!;
  }
  joinPrivate(id: string, name: string, code: string): Room {
    this.available(id);
    const lobby = this.privateRooms.get(code);
    if (!lobby || this.now() - lobby.touched >= 900000 || lobby.guest) throw new Error("Sala indisponível: confira o código ou peça um novo convite.");
    lobby.guest = { id, name }; lobby.touched = this.now(); this.memberships.set(id, lobby);
    const room = new Room(lobby.host.id, id, undefined, { id: lobby.id, format: lobby.format, mode: "private", inviteCode: code });
    room.setName(lobby.host.id, lobby.host.name); room.setName(id, name);
    return this.attach(room);
  }
  startPve(id: string, name: string, trainerId: string, difficulty: Difficulty, requested: FormatChoice): Room {
    this.available(id);
    const trainer = trainerById(trainerId), format = validateFormat(requested);
    if (!trainer || !["easy", "normal", "hard"].includes(difficulty) || (format.id === "monotype" && format.type !== trainer.type)) throw new Error("Desafio inválido.");
    const room = new Room(id, `bot-${randomUUID()}`, undefined, { format, mode: "pve", trainerId, difficulty });
    room.setName(id, name); return this.attach(room);
  }
  rematch(previous: Room): Room {
    if (this.roomOf(previous.state.players[0].id) !== previous) throw new Error("Partida expirada.");
    const players = previous.state.players;
    const preserved = players.map(player => previous.rematchTeam(player.id));
    const room = new Room(players[0].id, players[1].id, undefined, { ...previous.options, id: previous.id, format: previous.format });
    for (const [index, player] of players.entries()) {
      room.setName(player.id, player.name);
      if (index === 1 && previous.options.mode === "pve") continue;
      if (preserved[index]) { room.loadTeam(player.id, preserved[index]!); room.acceptTeam(player.id); }
    }
    previous.destroy(); this.attach(room); this.touch(players[0].id); return room;
  }
  lobbyOf(id: string): PrivateLobbySnapshot | null {
    const lobby = this.memberships.get(id);
    return lobby ? { roomId: lobby.id, code: lobby.code, hostId: lobby.host.id, format: lobby.format, players: [lobby.host, ...(lobby.guest ? [lobby.guest] : [])] } : null;
  }
  touch(id: string): void { const lobby = this.memberships.get(id); if (lobby) lobby.touched = this.now(); }
  cancel(id: string): void { this.queue = this.queue.filter(player => player.id !== id); }
  roomOf(id: string): Room | undefined { return this.rooms.get(id); }
  remove(id: string): Room | undefined {
    const room = this.rooms.get(id); this.cancel(id);
    if (room) { for (const player of room.state.players) this.rooms.delete(player.id); room.destroy(); }
    const lobby = this.memberships.get(id);
    if (lobby) {
      this.memberships.delete(id);
      if (lobby.host.id === id) { this.privateRooms.delete(lobby.code); if (lobby.guest) this.memberships.delete(lobby.guest.id); }
      else { lobby.guest = undefined; lobby.touched = this.now(); }
    }
    return room;
  }
  sweep(): string[] {
    const expired: string[] = [];
    for (const lobby of this.privateRooms.values()) if (this.now() - lobby.touched >= 900000) {
      const room = this.rooms.get(lobby.host.id);
      if (room && room.state.phase !== "setup" && room.state.phase !== "finished") continue;
      expired.push(lobby.host.id, ...(lobby.guest ? [lobby.guest.id] : [])); this.remove(lobby.host.id);
    }
    return expired;
  }
  waitingPosition(id: string): number {
    const player = this.queue.find(player => player.id === id);
    return player ? this.queue.filter(candidate => formatKey(candidate.format) === formatKey(player.format)).findIndex(candidate => candidate.id === id) + 1 : 0;
  }
  close(): void { for (const room of new Set(this.rooms.values())) room.destroy(); this.rooms.clear(); this.queue = []; this.privateRooms.clear(); this.memberships.clear(); }
}
