import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, basename, isAbsolute } from "node:path";
import { Room } from "./room";
import { PersistentJsonCache } from "./json-cache";
import { getShowdownMove } from "./showdown-moves";
import { fetchPokemonDetail, MoveData, setPokeApiTransport } from "./pokeapi";
import { FIXTURE_NAMES, fixturePokeApiTransport, installPokeApiFixture } from "./pokeapi.fixture";

installPokeApiFixture();

async function preparedRoom(start = true): Promise<Room> {
  const room = new Room("p1", "p2");
  room.setName("p1", "Alice");
  room.setName("p2", "Bob");
  for (const pokemon of FIXTURE_NAMES.slice(0, 6)) await room.choosePokemon("p1", pokemon);
  for (const pokemon of FIXTURE_NAMES.slice(6)) await room.choosePokemon("p2", pokemon);
  if (start) {
    room.acceptTeam("p1");
    room.acceptTeam("p2");
  }
  room.state.field.terrain = null;
  return room;
}

function equip(room: Room, name: string, extra: Partial<MoveData> = {}): void {
  const actor = room.state.players[room.state.turn];
  const imported = getShowdownMove(name)!;
  const move: MoveData = {
    ...imported,
    name,
    learnMethods: [],
    level: null,
    metaCategory: imported.healing > 0 ? "heal" : "damage",
    selfStatChanges: imported.selfStatChanges ?? [],
    ...extra,
  };
  actor.pokemonData!.moves = [move];
  actor.pokemonData!.selectedMoves = [name];
  actor.pokemonData!.pp = { [name]: move.pp ?? 10 };
}

async function run(): Promise<void> {
  // Preparação e golpes permanecem privados em TODO o payload do adversário.
  const room = await preparedRoom(false);
  assert.equal(room.state.phase, "setup");
  assert.throws(() => room.applyAction("p1", { type: "attack", move: "tackle" }), /confirmarem/i);
  assert.throws(() => room.terastallize("p1"), /confirmarem/i);
  room.setMoves("p2", FIXTURE_NAMES[6], ["growl"]);
  const privateView = room.getStateFor("p1");
  const publicPayload = JSON.stringify({
    log: privateView.log,
    events: privateView.events,
    foe: privateView.players[1],
  });
  for (const pokemon of FIXTURE_NAMES.slice(6))
    assert.ok(!publicPayload.includes(pokemon), `espécie vazou: ${pokemon}`);
  assert.throws(() => room.getStateFor("intruder"), /não pertence/i);
  room.acceptTeam("p1");
  assert.equal(room.state.phase, "setup", "um jogador pronto não inicia o combate");
  assert.throws(() => room.setMoves("p1", FIXTURE_NAMES[0], ["growl"]), /confirmada/i);
  room.resetTeam("p1");
  assert.equal(room.state.players[0].ready, false);
  for (const pokemon of FIXTURE_NAMES.slice(0, 6)) await room.choosePokemon("p1", pokemon);
  room.acceptTeam("p1");
  room.acceptTeam("p2");
  const before = JSON.stringify(room.state);
  assert.throws(() => room.setMoves("p2", FIXTURE_NAMES[6], ["tackle"]), /travados/i);
  assert.equal(JSON.stringify(room.state), before);
  assert.deepEqual(room.state.players[1].pokemonData!.selectedMoves, ["growl"]);

  // A busca não segura o mutex; reset invalida seleções que ainda estavam em voo.
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
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
  const slowRoom = new Room("p1", "p2");
  const pending = slowRoom.preparePokemon("p1", "charizard");
  await startedPromise;
  const unlock = await slowRoom.mutex.acquire();
  slowRoom.resetTeam("p1");
  unlock();
  release();
  const staleSelection = await pending;
  assert.throws(() => slowRoom.commitPokemon(staleSelection), /equipe mudou/i);
  assert.equal(slowRoom.state.players[0].team.length, 0);
  installPokeApiFixture();
  const duplicateRoom = new Room("p1", "p2");
  const selections = await Promise.allSettled([
    duplicateRoom.choosePokemon("p1", "charizard"),
    duplicateRoom.choosePokemon("p1", "charizard"),
  ]);
  assert.equal(selections.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(duplicateRoom.state.players[0].team.length, 1);

  // Desconexão encerra até a preparação e nunca altera um resultado já finalizado.
  const interrupted = new Room("p1", "p2");
  interrupted.forfeit("p2");
  assert.equal(interrupted.state.phase, "finished");
  assert.equal(interrupted.winner, "p1");
  assert.equal(interrupted.state.finishReason, "disconnect");
  assert.deepEqual(interrupted.state.pendingSwitch, [false, false]);
  const finalState = JSON.stringify(interrupted.state);
  interrupted.forfeit("p1");
  assert.equal(JSON.stringify(interrupted.state), finalState);
  await assert.rejects(interrupted.choosePokemon("p1", "charizard"), /travados/i);
  assert.throws(() => interrupted.setMoves("p1", "charizard", ["tackle"]), /travados/i);

  // Overkill, drenagem e multi-hit usam somente HP efetivamente removido.
  const draining = await preparedRoom();
  const actor = draining.state.players[draining.state.turn];
  const foe = draining.state.players[1 - draining.state.turn];
  actor.hp -= 50;
  actor.team.find((member) => member.pokemon === actor.pokemon)!.hp = actor.hp;
  foe.hp = 1;
  foe.team.find((member) => member.pokemon === foe.pokemon)!.hp = 1;
  equip(draining, "absorb", { minHits: 3, maxHits: 3 });
  const previousHp = actor.hp;
  draining.applyAction(actor.id, { type: "attack", move: "absorb" });
  const damage = draining.state.events.find((event) => event.type === "damage")!;
  assert.equal(damage.amount, 1);
  assert.equal(damage.hits, 1);
  assert.equal(actor.hp - previousHp, 1);

  // Rest cura status e HP, mas obriga dois turnos de sono.
  const resting = await preparedRoom();
  const sleeper = resting.state.players[resting.state.turn];
  sleeper.hp -= 60;
  sleeper.pokemonData!.status = "burn";
  equip(resting, "rest");
  resting.applyAction(sleeper.id, { type: "attack", move: "rest" });
  assert.equal(sleeper.hp, sleeper.maxHp);
  assert.equal(sleeper.pokemonData!.status, "sleep");
  assert.equal(sleeper.pokemonData!.sleepTurns, 2);
  assert.equal(sleeper.team.find((member) => member.pokemon === sleeper.pokemon)!.status, "sleep");
  assert.ok(resting.state.events.some((event) => event.type === "status_cure"));
  const opponent = resting.state.players[resting.state.turn];
  opponent.pokemonData!.selectedMoves = ["growl"];
  const ppBefore = sleeper.pokemonData!.pp.rest;
  for (let turn = 0; turn < 2; turn++) {
    resting.applyAction(opponent.id, { type: "attack", move: "growl" });
    resting.applyAction(sleeper.id, { type: "attack", move: "rest" });
  }
  assert.equal(sleeper.pokemonData!.sleepTurns, 0);
  assert.equal(sleeper.pokemonData!.pp.rest, ppBefore, "sono não gasta PP");
  const fullHealth = await preparedRoom();
  const rested = fullHealth.state.players[fullHealth.state.turn];
  equip(fullHealth, "rest");
  fullHealth.applyAction(rested.id, { type: "attack", move: "rest" });
  assert.equal(rested.hp, rested.maxHp);
  assert.equal(rested.pokemonData!.status, null, "Rest com HP cheio deve falhar sem impor sono");
  assert.ok(fullHealth.state.log.some((line) => line.includes("o golpe falhou")));

  // Cura + remoção de status não perde o segundo efeito; alvo de Heal Pulse é o defensor.
  const healing = await preparedRoom();
  const healer = healing.state.players[healing.state.turn];
  healer.hp -= 70;
  healer.pokemonData!.status = "poison";
  equip(healing, "jungle-healing");
  healing.applyAction(healer.id, { type: "attack", move: "jungle-healing" });
  assert.equal(healer.pokemonData!.status, null);
  assert.equal(healer.hp, healer.maxHp - 70 + Math.round(healer.maxHp / 4));
  const composite = await preparedRoom();
  const compositeActor = composite.state.players[composite.state.turn];
  compositeActor.hp -= 60;
  equip(composite, "recover", { statChanges: [{ stat: "attack", change: 1 }] });
  composite.applyAction(compositeActor.id, { type: "attack", move: "recover" });
  assert.equal(compositeActor.hp, compositeActor.maxHp);
  assert.equal(
    compositeActor.pokemonData!.statStages.attack,
    1,
    "cura não interrompe mudanças de atributos",
  );
  const pulse = await preparedRoom();
  const pulseActor = pulse.state.players[pulse.state.turn];
  const pulseFoe = pulse.state.players[1 - pulse.state.turn];
  pulseFoe.hp -= 60;
  const pulseActorHp = pulseActor.hp;
  equip(pulse, "heal-pulse");
  pulse.applyAction(pulseActor.id, { type: "attack", move: "heal-pulse" });
  assert.equal(pulseActor.hp, pulseActorHp);
  assert.equal(pulseFoe.hp, pulseFoe.maxHp);
  assert.equal(pulse.state.events.find((event) => event.type === "heal")!.targetId, pulseFoe.id);

  // Buscas iguais em paralelo compartilham uma chamada; falhas permitem nova tentativa.
  let requests = 0;
  setPokeApiTransport(async (url) => {
    requests++;
    return fixturePokeApiTransport(url);
  });
  await Promise.all(Array.from({ length: 8 }, () => fetchPokemonDetail("charizard")));
  assert.equal(requests, 1);
  let invalidResponse = true;
  setPokeApiTransport(async (url) => {
    if (invalidResponse)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          name: "charizard",
          stats: [null],
          moves: [],
          types: [],
        }),
      };
    return fixturePokeApiTransport(url);
  });
  await assert.rejects(fetchPokemonDetail("charizard"), /Dados inválidos/);
  invalidResponse = false;
  assert.equal(
    (await fetchPokemonDetail("charizard")).name,
    "charizard",
    "dados inválidos não envenenam o cache",
  );

  // O cache persistente continua utilizável numa nova instância sem internet.
  const directory = await mkdtemp(join(tmpdir(), "pokemon-cache-test-"));
  try {
    const cache = new PersistentJsonCache(directory);
    const validate = (value: unknown) => assert.deepEqual(value, { result: "ok" });
    await cache.get("catalog", async () => ({ result: "ok" }), validate);
    const restarted = new PersistentJsonCache(directory);
    assert.deepEqual(
      await restarted.get(
        "catalog",
        async () => {
          throw new Error("offline");
        },
        validate,
      ),
      { result: "ok" },
    );
    const cacheFile = join(
      directory,
      `${createHash("sha256").update("catalog").digest("hex")}.json`,
    );
    await writeFile(cacheFile, JSON.stringify({ result: "corrupted" }));
    let recovered = false;
    const recovery = new PersistentJsonCache(directory);
    assert.deepEqual(
      await recovery.get(
        "catalog",
        async () => {
          recovered = true;
          return { result: "ok" };
        },
        validate,
      ),
      { result: "ok" },
    );
    assert.equal(recovered, true, "cache inválido deve ser substituído pela resposta válida");
    let attempts = 0;
    const memory = new PersistentJsonCache(null);
    const load = async () => {
      if (++attempts === 1) throw new Error("offline");
      return { result: "ok" };
    };
    await assert.rejects(memory.get("retry", load, validate), /offline/);
    assert.deepEqual(await memory.get("retry", load, validate), { result: "ok" });
  } finally {
    const target = await realpath(directory);
    const withinTemp = relative(await realpath(tmpdir()), target);
    assert.ok(
      !withinTemp.startsWith("..") &&
        !isAbsolute(withinTemp) &&
        basename(target).startsWith("pokemon-cache-test-"),
    );
    await rm(target, { recursive: true, force: true });
  }
  console.log("Audit regression tests passed.");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
