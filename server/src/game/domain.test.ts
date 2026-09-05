import assert from "node:assert/strict";
import { Room } from "./room";
import { AsyncMutex } from "./mutex";

async function run(): Promise<void> {
  const room = new Room("p1", "p2");
  room.setName("p1", "Alice");
  room.setName("p2", "Bob");
  room.choosePokemon("p1", "charizard");
  room.choosePokemon("p2", "blastoise");

  assert.equal(room.state.players[0].name, "Alice");
  assert.equal(room.state.players[1].pokemon, "blastoise");
  assert.equal(room.state.turn, 0);

  room.applyAction("p1", { type: "attack", move: "flamethrower" });
  assert.equal(room.state.players[1].hp, 95);
  assert.equal(room.state.turn, 1);
  assert.throws(() => room.applyAction("p1", { type: "attack" }), /Não é sua vez/);

  const mutex = new AsyncMutex();
  const order: number[] = [];
  const first = mutex.acquire().then(async unlock => {
    order.push(1);
    await Promise.resolve();
    order.push(2);
    unlock();
  });
  const second = mutex.acquire().then(unlock => {
    order.push(3);
    unlock();
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2, 3]);

  console.log("Domain tests passed.");
}

void run();
