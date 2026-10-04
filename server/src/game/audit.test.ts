import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, basename, isAbsolute } from "node:path";
import { Room } from "./room";
import { fixtureRoom, TEAM, turn } from "./room.fixture";
import { BattleRuleError, BattleSession } from "./engine";
import { decodeServerMessage } from "../contracts/decode";
import { PersistentJsonCache } from "./json-cache";
import { fetchPokemonDetail, setPokeApiTransport } from "./pokeapi";
import {
  fixturePokeApiTransport,
  installPokeApiFixture,
} from "./pokeapi.fixture";

async function run(): Promise<void> {
  const room = fixtureRoom(["tackle"], ["growl"], false, "charizard");
  assert.throws(
    () =>
      room.applyAction("p1", {
        type: "action",
        requestId: 1,
        actionId: "early",
        choice: { type: "move", moveId: "tackle" },
      }),
    /confirmarem/i,
  );
  const publicPayload = JSON.stringify(room.getStateFor("p1"));
  assert.ok(
    !publicPayload.includes("charizard") && !publicPayload.includes("growl"),
  );
  assert.throws(() => room.getStateFor("intruder"), /não pertence/i);
  room.acceptTeam("p1");
  assert.equal(room.state.phase, "setup");
  assert.throws(
    () => room.setMoves("p1", "smeargle", ["growl"]),
    /confirmada/i,
  );
  const confirmed = room.getStateFor("p1");
  // Acceptance now locks every setup command, including the legacy reset path.
  assert.throws(() => room.resetTeam("p1"), /confirmada/i);
  assert.deepEqual(room.getStateFor("p1"), confirmed);
  room.acceptTeam("p2");
  const before = room.getStateFor("p2");
  assert.throws(
    () => room.setMoves("p2", "charizard", ["tackle"]),
    /travados/i,
  );
  assert.deepEqual(room.getStateFor("p2"), before);
  assert.deepEqual(before.team[0].moves, ["growl"]);
  room.destroy();

  // Catálogo local elimina a seleção assíncrona obsoleta: escolher/resetar é atômico.
  const local = new Room("p1", "p2");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Seleção não pode acessar a rede");
  };
  try {
    local.choosePokemon("p1", "charizard");
    local.resetTeam("p1");
    assert.equal(local.getStateFor("p1").team.length, 0);
    const selections = await Promise.allSettled(
      [1, 2].map(() =>
        Promise.resolve().then(() => local.choosePokemon("p1", "charizard")),
      ),
    );
    assert.equal(
      selections.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(local.getStateFor("p1").team.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    local.destroy();
  }

  const interrupted = new Room("p1", "p2");
  interrupted.forfeit("p2");
  const finalState = interrupted.getStateFor("p1");
  assert.equal(finalState.phase, "finished");
  assert.deepEqual(finalState.result, { winner: "p1", reason: "disconnect" });
  interrupted.forfeit("p1");
  assert.deepEqual(interrupted.getStateFor("p1"), finalState);
  assert.throws(
    () => interrupted.choosePokemon("p1", "charizard"),
    /travados/i,
  );
  assert.throws(
    () => interrupted.setMoves("p1", "charizard", ["tackle"]),
    /travados/i,
  );
  interrupted.destroy();

  const expired = fixtureRoom(["splash"], ["splash"], false);
  expired.acceptTeam("p1");
  expired.acceptTeam("p2");
  expired.battleReady("p1", expired.getStateFor("p1").preparation!.id);
  expired.preparationExpired();
  assert.deepEqual(expired.getStateFor("p1").result, {
    winner: "p1",
    reason: "preparation_timeout",
  });
  expired.destroy();

  const broken = fixtureRoom();
  const last = broken.getStateFor("p1");
  const originalSubmit = BattleSession.prototype.submit;
  BattleSession.prototype.submit = () => {
    throw new Error("Detalhe privado interno");
  };
  try {
    assert.throws(
      () =>
        broken.applyAction("p1", {
          type: "action",
          requestId: last.battle!.request!.id,
          actionId: "fault",
          choice: { type: "move", moveId: "tackle" },
        }),
      (error) =>
        error instanceof BattleRuleError &&
        error.code === "ENGINE_CONTRACT" &&
        !error.message.includes("privado"),
    );
    const final = broken.getStateFor("p1");
    assert.equal(final.phase, "finished");
    assert.equal(final.sequence, last.sequence);
    assert.deepEqual(final.result, { winner: null, reason: "engine_error" });
    decodeServerMessage({ type: "state", state: final });
  } finally {
    BattleSession.prototype.submit = originalSubmit;
    broken.destroy();
  }

  // Reproduz a regressão original de dreno multi-hit fatal com uma extensão confiável.
  const draining = new BattleSession(
    {
      seed: [1, 2, 3, 4],
      teams: [
        [
          {
            speciesId: "smeargle",
            level: 100,
            moves: ["substitute", "falseswipe", "auditdrain"],
          },
        ],
        [{ speciesId: "smeargle", level: 1, moves: ["splash"] }],
      ],
    },
    {
      additionalMoves: [
        {
          id: "auditdrain",
          name: "Audit Drain",
          type: "grass",
          category: "Special",
          basePower: 100,
          accuracy: true,
          pp: 10,
          multihit: [3, 3],
          drain: [1, 2],
        },
      ],
    },
  );
  const drainRound = (moveId: string) => {
    for (const side of ["p1", "p2"] as const) {
      const requestId = draining.getView(side).request!.id;
      draining.submit({
        side,
        requestId,
        actionId: `${side}_${requestId}`,
        choice: { type: "move", moveId: side === "p1" ? moveId : "splash" },
      });
    }
  };
  drainRound("substitute");
  drainRound("falseswipe");
  assert.equal(draining.getView("p2").ownTeam[0].hp, 1);
  const drainBefore = draining.getView("p1");
  drainRound("auditdrain");
  const drainEvents = draining.getEvents("p1", drainBefore.sequence);
  const damages = drainEvents.filter(
    (e) => e.type === "damage" && e.target === "p2s0",
  );
  assert.equal(damages.length, 1);
  assert.equal("amount" in damages[0] && damages[0].amount, 1);
  assert.equal(
    draining.getView("p1").ownTeam[0].hp - drainBefore.ownTeam[0].hp,
    1,
  );
  assert.equal(drainEvents.filter((e) => e.type === "faint").length, 1);
  draining.destroy();

  // Regressões de cura usam golpes nativos, sem mutar o estado privado do motor.
  const resting = fixtureRoom(["rest", "splash"], ["willowisp", "splash"]);
  turn(resting, "splash", "willowisp");
  assert.equal(resting.getStateFor("p1").battle!.ownTeam[0].status, "brn");
  const healed = turn(resting, "rest", "splash");
  const sleeper = resting.getStateFor("p1").battle!.ownTeam[0];
  assert.equal(sleeper.hp, sleeper.maxHp);
  assert.equal(sleeper.status, "slp");
  assert.ok(
    healed.some(
      (event) =>
        event.type === "status" &&
        event.target === "p1s0" &&
        event.status === "slp",
    ),
    "Rest substitui queimadura por sono no mesmo evento nativo",
  );
  const pp = sleeper.moves.find((move) => move.id === "rest")!.pp;
  for (let i = 0; i < 2; i++)
    assert.ok(
      turn(resting, "rest", "splash").some(
        (event) => event.type === "unable" && event.actor === "p1s0",
      ),
    );
  assert.equal(
    resting
      .getStateFor("p1")
      .battle!.ownTeam[0].moves.find((move) => move.id === "rest")!.pp,
    pp,
  );
  resting.destroy();
  const full = fixtureRoom(["rest"], ["splash"]);
  const failed = turn(full, "rest", "splash");
  assert.equal(full.getStateFor("p1").battle!.ownTeam[0].status, null);
  assert.ok(
    failed.some(
      (event) => event.type === "effect" && event.operation === "fail",
    ),
  );
  full.destroy();

  const healing = fixtureRoom(
    ["junglehealing", "splash", "strengthsap"],
    ["toxic", "splash"],
  );
  turn(healing, "splash", "toxic");
  const poisoned = healing.getStateFor("p1").battle!.ownTeam[0];
  assert.equal(poisoned.status, "tox");
  turn(healing, "junglehealing", "splash");
  const cured = healing.getStateFor("p1").battle!.ownTeam[0];
  assert.equal(cured.status, null);
  assert.equal(
    cured.hp,
    Math.min(cured.maxHp, poisoned.hp + Math.round(cured.maxHp / 4)),
  );
  turn(healing, "splash", "toxic");
  const combo = turn(healing, "strengthsap", "splash");
  assert.ok(
    combo.some((event) => event.type === "heal" && event.target === "p1s0"),
  );
  assert.ok(
    combo.some(
      (event) =>
        event.type === "boost" &&
        event.target === "p2s0" &&
        event.stat === "atk" &&
        event.after === -1,
    ),
  );
  healing.destroy();
  const pulse = fixtureRoom(["healpulse", "seismictoss"], ["splash"]);
  turn(pulse, "seismictoss", "splash");
  const actorHp = pulse.getStateFor("p1").battle!.ownTeam[0].hp;
  const pulseEvents = turn(pulse, "healpulse", "splash");
  assert.equal(pulse.getStateFor("p1").battle!.ownTeam[0].hp, actorHp);
  const defender = pulse.getStateFor("p2").battle!.ownTeam[0];
  assert.equal(defender.hp, defender.maxHp);
  assert.ok(
    pulseEvents.some(
      (event) => event.type === "heal" && event.target === "p2s0",
    ),
  );
  pulse.destroy();

  // Dreno/recuo fatal, multi-hit e críticos por hit permanecem em battle.test.ts.
  installPokeApiFixture();
  // Buscas iguais em paralelo compartilham uma chamada; falhas permitem nova tentativa.
  let requests = 0;
  setPokeApiTransport(async (url) => {
    requests++;
    return fixturePokeApiTransport(url);
  });
  await Promise.all(
    Array.from({ length: 8 }, () => fetchPokemonDetail("charizard")),
  );
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
    const validate = (value: unknown) =>
      assert.deepEqual(value, { result: "ok" });
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
    assert.equal(
      recovered,
      true,
      "cache inválido deve ser substituído pela resposta válida",
    );
    let attempts = 0;
    const memory = new PersistentJsonCache(null);
    const load = async () => {
      if (++attempts === 1) throw new Error("offline");
      return { result: "ok" };
    };
    await assert.rejects(memory.get("retry", load, validate), /offline/);
    assert.deepEqual(await memory.get("retry", load, validate), {
      result: "ok",
    });
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
