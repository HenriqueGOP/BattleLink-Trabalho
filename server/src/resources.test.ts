import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { catalog } from "./contracts/catalog";
import { fixtureRoom } from "./game/room.fixture";
import {
  pokemonAssets,
  safeAsset,
  FALLBACK_SPRITE,
} from "../../client/src/lib/assets";
import { preloadBattle } from "../../client/src/lib/preloadBattle";
import { displayMove } from "../../client/src/lib/catalog";
import { moveEffects } from "../../client/src/lib/moves";
import { ARENA_IDS } from "./contracts/protocol";
import {
  battleBackgrounds,
  markBackgroundFailed,
  resolveBackground,
} from "../../client/src/config/battleBackgrounds";

async function run() {
  assert.equal(
    moveEffects(displayMove("tackle")).some((effect) =>
      effect.label.includes("crítico"),
    ),
    false,
  );
  assert.equal(
    moveEffects(displayMove("leafblade")).some((effect) =>
      effect.label.includes("crítico"),
    ),
    true,
  );
  assert.equal(displayMove("icebeam").ailment, "freeze");
  assert.equal(displayMove("icebeam").ailmentChance, 10);
  assert.equal(displayMove("airslash").flinchChance, 30);
  assert.deepEqual(displayMove("swordsdance").statChanges, [
    { stat: "attack", change: 2 },
  ]);
  assert.equal(displayMove("swordsdance").target, "self");
  const root = resolve(__dirname, "../../client/public");
  const manifest = JSON.parse(
    await readFile(resolve(root, "pokemon/manifest.json"), "utf8"),
  ) as Record<
    string,
    Record<string, { path: string; bytes: number; sha256: string }>
  >;
  let files = 0,
    bytes = 0;
  for (const species of catalog.species) {
    const assets = pokemonAssets(species.id);
    assert.equal(Object.keys(manifest[species.id]).length, 5);
    for (const entry of Object.values(manifest[species.id])) {
      assert.match(
        entry.path,
        /^\/pokemon\/(front|back|shinyFront|shinyBack|cry)\/[0-9]+\.(png|ogg|mp3)$/,
      );
      assert.ok(Object.values(assets).includes(entry.path));
      assert.equal(safeAsset(entry.path), entry.path);
      const buffer = await readFile(resolve(root, `.${entry.path}`));
      assert.equal(buffer.length, entry.bytes);
      assert.equal(
        createHash("sha256").update(buffer).digest("hex"),
        entry.sha256,
      );
      files++;
      bytes += buffer.length;
    }
  }
  assert.equal(files, 5125);
  assert.equal(bytes, 19008688);
  assert.deepEqual(
    battleBackgrounds.map((arena) => arena.id),
    [...ARENA_IDS],
  );
  const arenas = JSON.parse(
    await readFile(resolve(root, "arenas/manifest.json"), "utf8"),
  ) as Record<string, { path: string; bytes: number; sha256: string }>;
  assert.deepEqual(Object.keys(arenas), [...ARENA_IDS]);
  let arenaBytes = 0;
  for (const id of ARENA_IDS) {
    const config = resolveBackground(id);
    const entry = arenas[id];
    assert.equal(config.id, id);
    assert.equal(config.background, entry.path);
    assert.equal(entry.path, `/arenas/${id}.svg`);
    const buffer = await readFile(resolve(root, `.${entry.path}`));
    assert.equal(buffer.length, entry.bytes);
    assert.ok(
      buffer.length <= 600000,
      "Arena deve caber no orçamento de 600 KB",
    );
    assert.equal(
      createHash("sha256").update(buffer).digest("hex"),
      entry.sha256,
    );
    const svg = buffer.toString("utf8");
    assert.match(svg, /viewBox="0 0 1200 700"/);
    assert.doesNotMatch(
      svg,
      /<(script|foreignObject|image)\b|\bon\w+\s*=|(?:href|url)\s*=\s*["'](?:https?:|\/\/)/i,
    );
    assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
    arenaBytes += buffer.length;
  }
  for (const invalid of [
    "../cave.svg",
    "https://evil.test/a.svg",
    "//evil.test",
    "__proto__",
    "constructor",
    null,
  ]) {
    assert.equal(resolveBackground(invalid).id, "forest");
    assert.equal(resolveBackground(invalid).background, "/arenas/forest.svg");
  }
  markBackgroundFailed("https://evil.test/a.svg");
  assert.equal(resolveBackground("forest").background, "/arenas/forest.svg");
  for (const invalid of [
    "https://evil.test/a.png",
    "//evil.test",
    "../pokemon/1.png",
    "javascript:alert(1)",
    "__proto__",
    "constructor",
  ]) {
    assert.equal(safeAsset(invalid), null);
    assert.equal(pokemonAssets(invalid).front, FALLBACK_SPRITE);
  }
  const room = fixtureRoom();
  const snapshot = room.getStateFor("p1");
  assert.equal(snapshot.arena, room.getStateFor("p2").arena);
  room.destroy();
  const originalFetch = globalThis.fetch,
    originalTimeout = globalThis.setTimeout;
  let active = 0,
    maximum = 0;
  const requested = new Set<string>();
  try {
    globalThis.fetch = async (input) => {
      const path = String(input);
      assert.ok(path.startsWith("/") && !path.startsWith("//"));
      requested.add(path);
      maximum = Math.max(maximum, ++active);
      await Promise.resolve();
      active--;
      return new Response(new Uint8Array([1]));
    };
    await preloadBattle(snapshot, new AbortController().signal);
    assert.ok(requested.size >= 30);
    assert.ok(requested.has(resolveBackground(snapshot.arena).background!));
    assert.ok(maximum <= 6);
    const previous = pokemonAssets("smeargle");
    const previousArena = resolveBackground(snapshot.arena);
    const cancelled = new AbortController();
    cancelled.abort();
    await preloadBattle(snapshot, cancelled.signal);
    assert.deepEqual(
      pokemonAssets("smeargle"),
      previous,
      "Desmontagem não invalida recursos de futuras partidas",
    );
    assert.deepEqual(resolveBackground(snapshot.arena), previousArena);
    globalThis.fetch = () => new Promise(() => undefined); // transporte que ignora AbortSignal
    let deadline = 0;
    globalThis.setTimeout = ((callback: () => void, ms?: number) => {
      deadline = ms ?? 0;
      return originalTimeout(callback, 10);
    }) as typeof setTimeout;
    await preloadBattle(snapshot, new AbortController().signal);
    assert.equal(deadline, 3000);
    assert.equal(pokemonAssets("smeargle").front, FALLBACK_SPRITE);
    assert.equal(pokemonAssets("smeargle").cry, null);
    assert.equal(
      resolveBackground(snapshot.arena).background,
      null,
      "Arena lenta adota fallback antes da prontidão",
    );
    markBackgroundFailed("/arenas/cave.svg");
    assert.equal(resolveBackground("cave").id, "cave");
    assert.equal(resolveBackground("cave").background, null);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
  }
  console.log(
    `Resource tests passed: ${files} Pokémon hashes (${bytes} bytes), six original arenas (${arenaBytes} bytes), local whitelist/fallback, six workers, cancellation and three-second deadline.`,
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
