import assert from "node:assert/strict";
import { Room } from "./room";
import type { BattleChoice, SideId } from "./engine";

export const TEAM = [
  "smeargle",
  "eevee",
  "bulbasaur",
  "squirtle",
  "pikachu",
  "magikarp",
];
export function fixtureRoom(
  left = ["tackle", "splash"],
  right = ["splash"],
  start = true,
  lead2 = "smeargle",
): Room {
  const room = new Room("p1", "p2", [1, 2, 3, 4]);
  room.setName("p1", "Alice");
  room.setName("p2", "Bob");
  for (const id of TEAM) room.choosePokemon("p1", id);
  for (const id of [...new Set([lead2, ...TEAM, "charizard"])].slice(0, 6))
    room.choosePokemon("p2", id);
  room.setMoves("p1", TEAM[0], left);
  room.setMoves("p2", lead2, right);
  if (start) {
    room.acceptTeam("p1");
    room.acceptTeam("p2");
    assert.equal(room.state.phase, "preparing");
    const preparation = room.getStateFor("p1").preparation!.id;
    room.battleReady("p1", preparation);
    room.battleReady("p2", preparation);
  }
  return room;
}
export function act(
  room: Room,
  side: SideId,
  choice: string | BattleChoice,
  actionId?: string,
) {
  const request = room.getStateFor(side).battle?.request;
  assert.ok(request, `${side} deve ter uma solicitação`);
  return room.applyAction(side, {
    type: "action",
    requestId: request.id,
    actionId: actionId ?? `${side}_${request.id}`,
    choice:
      typeof choice === "string" ? { type: "move", moveId: choice } : choice,
  });
}
export function turn(room: Room, left: string, right: string) {
  const after = room.getStateFor("p1").sequence;
  act(room, "p1", left);
  act(room, "p2", right);
  return room
    .getStateFor("p1")
    .events.filter((event) => event.sequence > after);
}
