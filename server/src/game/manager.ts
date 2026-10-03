// src/game/manager.ts
import { Room } from "./room";
import { PlayerId } from "./types";

export class RoomManager {
  private queue: Array<{ id: PlayerId; name: string }> = [];
  private rooms = new Map<PlayerId, Room>(); // socketId -> sala

  /** Jogador entra na fila. Retorna a sala se formou um par, senão null. */
  public enqueue(playerId: PlayerId, name: string): Room | null {
    if (
      this.queue.some((player) => player.id === playerId) ||
      this.rooms.has(playerId)
    )
      return null;

    const opponent = this.queue.shift();
    if (!opponent) {
      this.queue.push({ id: playerId, name });
      return null;
    }

    const room = new Room(opponent.id, playerId);
    room.setName(opponent.id, opponent.name);
    room.setName(playerId, name);
    this.rooms.set(opponent.id, room);
    this.rooms.set(playerId, room);
    return room;
  }

  public cancel(playerId: PlayerId): void {
    this.queue = this.queue.filter((player) => player.id !== playerId);
  }

  public roomOf(playerId: PlayerId): Room | undefined {
    return this.rooms.get(playerId);
  }

  public remove(playerId: PlayerId): Room | undefined {
    const room = this.rooms.get(playerId);
    this.rooms.delete(playerId);
    this.cancel(playerId);
    if (room) {
      const other = room.state.players.find((p) => p.id !== playerId);
      if (other) this.rooms.delete(other.id);
      room.destroy();
    }
    return room;
  }

  public waitingPosition(playerId: PlayerId): number {
    const index = this.queue.findIndex((player) => player.id === playerId);
    return index < 0 ? 0 : index + 1;
  }

  public close(): void {
    for (const room of new Set(this.rooms.values())) room.destroy();
    this.rooms.clear();
    this.queue = [];
  }
}
