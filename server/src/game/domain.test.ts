import assert from "node:assert/strict";
import { AsyncMutex } from "./mutex";
import { act, fixtureRoom, TEAM, turn } from "./room.fixture";
import { catalog, speciesById } from "../contracts/catalog";
import { Room } from "./room";

async function run(): Promise<void> {
  assert.equal(catalog.species.length, 1025);
  assert.equal(speciesById("pikachu")?.stats.hp, 110);
  const originalFetch = globalThis.fetch,
    originalRandom = Math.random;
  globalThis.fetch = () => {
    throw new Error("Rede externa proibida");
  };
  Math.random = () => {
    throw new Error("Aleatoriedade global proibida");
  };
  try {
    const room = fixtureRoom();
    const alice = room.getStateFor("p1"),
      bob = room.getStateFor("p2");
    assert.equal(alice.phase, "battle");
    assert.equal(alice.team.length, 6);
    assert.equal(alice.players[0].name, "Alice");
    assert.equal(bob.players[1].name, "Bob");
    assert.equal(
      alice.battle!.ownTeam.every((member) => member.maxHp > 0),
      true,
    );
    assert.throws(() => room.resetTeam("p1"), /já começou/);
    assert.throws(() => room.setMoves("p1", "smeargle", ["growl"]), /travados/);
    assert.throws(() => act(room, "p1", "growl"), /indisponível/);
    assert.deepEqual(
      room.getStateFor("p1"),
      alice,
      "Ação inválida não muda estado",
    );
    assert.equal(act(room, "p1", "tackle").resolved, false);
    assert.deepEqual(
      room.getStateFor("p2"),
      bob,
      "Escolha privada não altera a perspectiva adversária",
    );
    assert.equal(act(room, "p2", "splash").resolved, true);
    assert.equal("moves" in alice.battle!.opponentTeam[0], false);
    assert.equal("stats" in alice.battle!.opponentTeam[0], false);
    assert.deepEqual(alice.battle!.opponentTeam[1], {
      id: "p2s1",
      hidden: true,
    });
    room.destroy();
    const pp = fixtureRoom(["spite"], ["splash"]);
    for (let i = 0; i < 10; i++)
      turn(pp, "spite", pp.getStateFor("p2").battle!.request!.moves[0].id);
    const before = pp.getStateFor("p1");
    assert.equal(before.battle!.request!.moves[0].id, "struggle");
    assert.throws(() => act(pp, "p1", "spite"), /indisponível/);
    assert.deepEqual(pp.getStateFor("p1"), before);
    pp.destroy();
    const sleep = fixtureRoom(["spore", "splash"], ["splash"]);
    // Empate de velocidade pode permitir a primeira ação; uma rodada seguinte dormindo não gasta PP.
    for (
      let i = 0;
      i < 10 && sleep.getStateFor("p2").battle!.ownTeam[0].status !== "slp";
      i++
    )
      turn(sleep, "spore", "splash");
    const events = turn(sleep, "spore", "splash");
    assert.ok(
      events.some((event) => event.type === "unable" && event.reason === "slp"),
    );
    sleep.destroy();
    const residual = fixtureRoom(
      ["willowisp", "superfang", "splash"],
      ["splash"],
    );
    turn(residual, "willowisp", "splash");
    for (
      let i = 0;
      i < 20 && residual.getStateFor("p2").battle!.request?.kind === "move";
      i++
    )
      turn(residual, "superfang", "splash");
    const dead = residual.getStateFor("p2");
    assert.equal(dead.battle!.request!.kind, "switch");
    assert.equal(residual.getStateFor("p1").battle!.request, null);
    assert.throws(
      () =>
        residual.applyAction("p1", {
          type: "action",
          requestId: dead.battle!.request!.id,
          actionId: "cannot",
          choice: { type: "move", moveId: "splash" },
        }),
      /aguardar/,
    );
    act(residual, "p2", { type: "switch", combatantId: "p2s1" });
    assert.equal(residual.getStateFor("p2").battle!.active.p2, "p2s1");
    residual.destroy();
    const a = new Room("a", "b", [5, 6, 7, 8]),
      b = new Room("a", "b", [5, 6, 7, 8]);
    a.randomTeam("a", 6);
    a.randomTeam("b", 6);
    b.randomTeam("b", 6);
    b.randomTeam("a", 6);
    for (const id of ["a", "b"]) {
      assert.deepEqual(
        a.getStateFor(id).team.map((p) => p.speciesId),
        b.getStateFor(id).team.map((p) => p.speciesId),
      );
      assert.equal(
        new Set(a.getStateFor(id).team.map((p) => p.speciesId)).size,
        6,
      );
    }
    a.destroy();
    b.destroy();
    const seed: [number, number, number, number] = [1, 2, 3, 4];
    const isolated = new Room("p1", "p2", seed),
      reference = new Room("p1", "p2", [...seed]);
    seed.fill(65535);
    for (const room of [isolated, reference]) {
      for (const side of ["p1", "p2"]) {
        for (const pokemon of TEAM) room.choosePokemon(side, pokemon);
        room.setMoves(side, "smeargle", ["tackle"]);
        room.acceptTeam(side);
      }
      const prep = room.getStateFor("p1").preparation!.id;
      room.battleReady("p1", prep);
      room.battleReady("p2", prep);
      turn(room, "tackle", "tackle");
    }
    assert.deepEqual(
      isolated.getStateFor("p1").battle,
      reference.getStateFor("p1").battle,
    );
    assert.deepEqual(
      isolated.getStateFor("p1").events,
      reference.getStateFor("p1").events,
    );
    isolated.destroy();
    reference.destroy();
  } finally {
    globalThis.fetch = originalFetch;
    Math.random = originalRandom;
  }
  const mutex = new AsyncMutex(),
    order: number[] = [];
  await Promise.all([
    mutex.acquire().then(async (unlock) => {
      order.push(1);
      await Promise.resolve();
      order.push(2);
      unlock();
    }),
    mutex.acquire().then((unlock) => {
      order.push(3);
      unlock();
    }),
  ]);
  assert.deepEqual(order, [1, 2, 3]);
  console.log(
    "Domain tests passed: local catalog, private simultaneous actions, PP, switches, RNG and mutex.",
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
