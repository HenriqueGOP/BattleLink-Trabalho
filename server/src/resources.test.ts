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
  resolveBattleSprite,
  animatedPokemonAssets,
  markAssetFailed,
  markAssetLoaded,
} from "../../client/src/lib/assets";
import { preloadBattle } from "../../client/src/lib/preloadBattle";
import { displayMove } from "../../client/src/lib/catalog";
import { moveEffects } from "../../client/src/lib/moves";
import { ARENA_IDS } from "./contracts/protocol";
import {
  battleBackgrounds,
  markBackgroundFailed,
  markBackgroundLoaded,
  resolveBackground,
} from "../../client/src/config/battleBackgrounds";

function gifFrames(buffer: Buffer): number {
  assert.match(buffer.toString("ascii", 0, 6), /^GIF8[79]a$/);
  let offset = 13 + (buffer[10] & 128 ? 3 * 2 ** ((buffer[10] & 7) + 1) : 0);
  let frames = 0;
  const blocks = () => {
    while (offset < buffer.length) {
      const size = buffer[offset++];
      if (size === 0) return;
      offset += size;
      assert.ok(offset <= buffer.length, "GIF sub-block deve estar completo");
    }
    assert.fail("GIF sem terminador de sub-block");
  };
  while (offset < buffer.length) {
    const token = buffer[offset++];
    if (token === 0x3b) return frames;
    if (token === 0x21) {
      offset++;
      blocks();
    } else if (token === 0x2c) {
      const packed = buffer[offset + 8];
      offset += 9;
      if (packed & 128) offset += 3 * 2 ** ((packed & 7) + 1);
      offset++;
      blocks();
      frames++;
    } else assert.fail("Bloco GIF desconhecido");
  }
  assert.fail("GIF sem trailer");
}

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
  for (const id of ["beatup", "dragonrage", "fissure", "heatcrash"]) {
    const move = displayMove(id);
    assert.equal(
      move.power,
      null,
      "Poder variável/fixo não vira valor inventado",
    );
    assert.deepEqual(
      moveEffects(move),
      [{ label: "Causa dano", tone: "info" }],
      `${id}: a categoria distingue ataques de golpes de status`,
    );
  }
  for (const move of catalog.moves.filter((move) => move.category !== "Status"))
    assert.ok(
      !moveEffects(displayMove(move.id)).some(
        (effect) => effect.label === "Golpe de status",
      ),
      `${move.id}: nenhum ataque recebe descrição de status por ter poder zero`,
    );
  assert.deepEqual(moveEffects(displayMove("howl")), [
    { label: "Aumenta o Ataque do usuário e dos aliados", tone: "buff" },
  ]);
  assert.ok(
    moveEffects(displayMove("crunch")).some(
      (effect) => effect.label === "Pode reduzir a Defesa do oponente",
    ),
  );
  assert.deepEqual(moveEffects(displayMove("swordsdance")), [
    { label: "Aumenta o Ataque do usuário", tone: "buff" },
  ]);
  assert.ok(
    moveEffects(displayMove("closecombat")).some(
      (effect) => effect.label === "Reduz a Defesa do usuário",
    ),
  );
  const allyBoost = displayMove("howl");
  for (const [target, suffix] of [
    ["adjacentAlly", "do aliado"],
    ["adjacentAllyOrSelf", "do usuário ou de um aliado"],
    ["allySide", "da equipe"],
    ["allAdjacent", "de todos os alvos"],
  ])
    assert.equal(
      moveEffects({ ...allyBoost, target })[0].label,
      `Aumenta o Ataque ${suffix}`,
    );
  assert.equal(
    moveEffects({ ...allyBoost, statChance: 20 })[0].label,
    "Pode aumentar o Ataque do usuário e dos aliados",
  );
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
  const animations = JSON.parse(
    await readFile(resolve(root, "pokemon/animated/manifest.json"), "utf8"),
  ) as Record<
    string,
    Record<
      string,
      {
        path: string;
        bytes: number;
        sha256: string;
        frames: number;
        width: number;
        height: number;
        durationMs: number;
        upstreamPath: string;
        upstreamBlob: string;
      }
    >
  >;
  let animatedFiles = 0,
    animatedBytes = 0;
  for (const [speciesId, variants] of Object.entries(animations)) {
    assert.ok(catalog.species.some((species) => species.id === speciesId));
    for (const [kind, entry] of Object.entries(variants)) {
      assert.match(kind, /^(front|back|shinyFront|shinyBack)$/);
      assert.match(
        entry.path,
        /^\/pokemon\/animated\/(front|back|shinyFront|shinyBack)\/[0-9]+\.gif$/,
      );
      assert.equal(safeAsset(entry.path), entry.path);
      const buffer = await readFile(resolve(root, `.${entry.path}`));
      assert.equal(buffer.length, entry.bytes);
      assert.ok(
        buffer.length <= 512 * 1024,
        "Cada sprite animado respeita 512 KiB",
      );
      assert.equal(
        createHash("sha256").update(buffer).digest("hex"),
        entry.sha256,
      );
      assert.equal(
        createHash("sha1")
          .update(`blob ${buffer.length}\0`)
          .update(buffer)
          .digest("hex"),
        entry.upstreamBlob,
        "GIF conserva exatamente os bytes upstream",
      );
      assert.equal(gifFrames(buffer), entry.frames);
      assert.ok(entry.frames > 1 && entry.durationMs > 0);
      assert.equal(buffer.readUInt16LE(6), entry.width);
      assert.equal(buffer.readUInt16LE(8), entry.height);
      assert.match(
        entry.upstreamPath,
        /^sprites\/pokemon\/versions\/generation-v\/black-white\/animated\/(?:back\/|shiny\/|back\/shiny\/)?[0-9]+\.gif$/,
      );
      const registered =
        animatedPokemonAssets(speciesId)[
          kind as keyof ReturnType<typeof animatedPokemonAssets>
        ];
      assert.equal(registered?.path, entry.path);
      assert.equal(registered?.frames, entry.frames);
      animatedFiles++;
      animatedBytes += buffer.length;
    }
  }
  assert.equal(Object.keys(animations).length, 868);
  assert.equal(animatedFiles, 3368);
  assert.equal(animatedBytes, 165270133);
  assert.equal(
    resolveBattleSprite("pikachu", true, false).src,
    animations.pikachu.front.path,
  );
  assert.equal(
    resolveBattleSprite("pikachu", false, true).src,
    animations.pikachu.shinyBack.path,
  );
  assert.equal(
    resolveBattleSprite("greninja", false, false).mirrored,
    false,
    "Back estático tem prioridade sobre GIF da vista oposta",
  );
  assert.equal(
    resolveBattleSprite("greninja", false, false).staticMirrored,
    false,
    "Back PNG preserva orientação própria em movimento reduzido",
  );
  assert.equal(resolveBattleSprite("pecharunt", false, false).animated, false);
  assert.equal(
    resolveBattleSprite("pecharunt", false, false).src,
    pokemonAssets("pecharunt").back,
  );
  assert.deepEqual(
    battleBackgrounds.map((arena) => arena.id),
    [...ARENA_IDS],
  );
  const arenas = JSON.parse(
    await readFile(resolve(root, "arenas/manifest.json"), "utf8"),
  ) as Record<
    string,
    {
      path: string;
      bytes: number;
      sha256: string;
      width: number;
      height: number;
      fallback: { path: string; bytes: number; sha256: string };
    }
  >;
  assert.deepEqual(Object.keys(arenas), [...ARENA_IDS]);
  let arenaBytes = 0;
  for (const id of ARENA_IDS) {
    const config = resolveBackground(id);
    const entry = arenas[id];
    assert.equal(config.id, id);
    assert.equal(config.background, entry.path);
    assert.equal(entry.path, `/arenas/${id}.webp`);
    assert.equal(config.primary, entry.path);
    assert.equal(config.fallback, entry.fallback.path);
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
    assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
    assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
    assert.equal(buffer.readUInt32LE(4) + 8, buffer.length);
    assert.ok(entry.width >= 1200 && entry.height >= 700);
    const fallback = await readFile(resolve(root, `.${entry.fallback.path}`));
    assert.equal(entry.fallback.path, `/arenas/${id}.svg`);
    assert.equal(fallback.length, entry.fallback.bytes);
    assert.equal(
      createHash("sha256").update(fallback).digest("hex"),
      entry.fallback.sha256,
    );
    const svg = fallback.toString("utf8");
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
    assert.equal(resolveBackground(invalid).background, "/arenas/forest.webp");
  }
  markBackgroundFailed("https://evil.test/a.svg");
  assert.equal(resolveBackground("forest").background, "/arenas/forest.webp");
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
    assert.equal(
      resolveBattleSprite(invalid, true, false).src,
      FALLBACK_SPRITE,
    );
    assert.equal(resolveBattleSprite(invalid, true, false).animated, false);
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
  const ordered: string[] = [];
  try {
    globalThis.fetch = async (input) => {
      const path = String(input);
      assert.ok(path.startsWith("/") && !path.startsWith("//"));
      requested.add(path);
      ordered.push(path);
      maximum = Math.max(maximum, ++active);
      await Promise.resolve();
      active--;
      return new Response(new Uint8Array([1]));
    };
    await preloadBattle(snapshot, new AbortController().signal);
    assert.ok(requested.size >= 30);
    assert.ok(requested.has(resolveBackground(snapshot.arena).background!));
    assert.ok(maximum <= 6);
    assert.equal(ordered[0], FALLBACK_SPRITE);
    assert.equal(ordered[1], resolveBackground(snapshot.arena).primary);
    assert.ok(
      ordered.indexOf("/battle-vfx/attacks.webp") <
        ordered.findIndex((path) => /\.(ogg|mp3)$/.test(path)),
      "Atlas é carregado antes de gritos opcionais",
    );
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
    // Intentional correction: deadline proves only that preload is incomplete,
    // not that the files are absent. Preserve cancellation/deadline coverage.
    assert.deepEqual(
      pokemonAssets("smeargle"),
      previous,
      "Deadline não bane sprites ou áudio da sessão",
    );
    assert.deepEqual(
      resolveBackground(snapshot.arena),
      previousArena,
      "Deadline não impede arena de carregar pelo DOM",
    );
    globalThis.setTimeout = originalTimeout;
    const attempts = new Map<string, number>();
    globalThis.fetch = async (input) => {
      const path = String(input);
      const count = (attempts.get(path) ?? 0) + 1;
      attempts.set(path, count);
      return count === 1
        ? new Response(null, { status: 503 })
        : new Response(new Uint8Array([1]));
    };
    await preloadBattle(snapshot, new AbortController().signal);
    assert.ok(
      [...attempts.values()].every((count) => count === 2),
      "Falha transitória recebe no máximo uma nova tentativa",
    );
    assert.deepEqual(
      resolveBackground(snapshot.arena),
      previousArena,
      "Falha seguida de sucesso recupera arena sem reload",
    );
    const image = pokemonAssets("smeargle").front;
    markAssetFailed(image);
    assert.equal(pokemonAssets("smeargle").front, FALLBACK_SPRITE);
    markAssetLoaded(image);
    assert.equal(
      pokemonAssets("smeargle").front,
      image,
      "Imagem recupera no mesmo aplicativo após sucesso",
    );
    markBackgroundFailed("/arenas/cave.webp");
    assert.equal(resolveBackground("cave").id, "cave");
    assert.equal(
      resolveBackground("cave").background,
      "/arenas/cave.svg",
      "Falha de WebP mantém SVG original como fallback",
    );
    markBackgroundLoaded("/arenas/cave.webp");
    assert.equal(
      resolveBackground("cave").background,
      "/arenas/cave.webp",
      "Arena primária recupera após sucesso sem nova sessão",
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
  }
  console.log(
    `Resource tests passed: ${files} original Pokémon hashes (${bytes} bytes), ${animatedFiles} real animated GIFs (${animatedBytes} bytes), six original WebP arenas and SVG fallbacks (${arenaBytes} bytes), local whitelist, priority, six workers, transient recovery, cancellation and three-second deadline.`,
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
