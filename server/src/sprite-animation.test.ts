import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  VFX_ATLASES,
  SPRITE_CLIPS,
  attackClip,
  attackVisualType,
  TYPE_VISUALS,
  statusClip,
} from "../../client/src/lib/presentation/spriteRegistry";
import type { SpriteClipId } from "../../client/src/lib/presentation/spriteRegistry";
import type { SpriteClip } from "../../client/src/lib/presentation/spriteRegistry";
import { MOVE_TYPE_GLYPHS } from '../../client/src/components/MoveIdentity/moveTypeGlyphs';
import {
  frameRect,
  markVfxFailed,
  playSprite,
  spriteStats,
} from "../../client/src/lib/presentation/SpriteRenderer";

interface AtlasEntry {
  id: keyof typeof VFX_ATLASES | 'impacts' | 'legacy-attacks';
  path: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  framesPerClip: number;
  bytes: number;
  sha256: string;
  source: string;
}

// Cabeçalho VP8X: https://developers.google.com/speed/webp/docs/riff_container
function webpSize(buffer: Buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  assert.equal(buffer.readUInt32LE(4) + 8, buffer.length);
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= buffer.length);
    if (kind === "VP8X") {
      assert.equal(size, 10);
      return {
        width: buffer.readUIntLE(offset + 12, 3) + 1,
        height: buffer.readUIntLE(offset + 15, 3) + 1,
        alpha: Boolean(buffer[offset + 8] & 0x10),
      };
    }
    offset += 8 + size + (size & 1);
  }
  throw new Error("Atlas deve conter cabeçalho WebP VP8X com transparência.");
}

async function assetTests() {
  const root = resolve(__dirname, "../../client/public");
  const manifest = JSON.parse(
    await readFile(resolve(root, "battle-vfx/manifest.json"), "utf8"),
  ) as AtlasEntry[];
  for (const path of Object.values(VFX_ATLASES))
    assert.equal(manifest.filter(entry => entry.path === path).length, 1, `${path} has exactly one authoritative asset record`);
  let totalBytes = 0;
  for (const entry of manifest) {
    assert.match(
      entry.path,
      /^\/battle-vfx\/(attacks|impacts|statuses|transitions|frozen)\.webp$/,
    );
    const buffer = await readFile(resolve(root, `.${entry.path}`));
    const actual = webpSize(buffer);
    assert.equal(actual.width, entry.width);
    assert.equal(actual.height, entry.height);
    assert.equal(actual.alpha, true, "Spritesheet possui canal alfa real");
    assert.equal(entry.columns, 8);
    assert.equal(entry.rows, entry.id === 'frozen' ? 1 : 8);
    assert.equal(entry.framesPerClip, 8);
    assert.equal(buffer.length, entry.bytes);
    assert.equal(
      createHash("sha256").update(buffer).digest("hex"),
      entry.sha256,
    );
    assert.match(entry.source, /original project artwork/);
    totalBytes += buffer.length;
  }
  assert.ok(totalBytes <= 4 * 1024 * 1024, "Conjunto VFX deve caber em 4 MiB");
  assert.equal(Object.keys(SPRITE_CLIPS).length, 25);
  for (const atlas of Object.keys(VFX_ATLASES)) {
    const clips = Object.values(SPRITE_CLIPS).filter(
      (value) => value.atlas === atlas,
    );
    assert.deepEqual(
      clips.map((value) => value.row).sort(),
      atlas === 'frozen' ? [0] : [0, 1, 2, 3, 4, 5, 6, 7],
    );
    for (const clip of clips as SpriteClip[]) {
      assert.equal(clip.frames, 8);
      assert.ok(clip.fps > 0 && clip.fps <= 24);
      assert.ok(clip.size >= 44);
      for (let index = 0; index < clip.frames; index++) {
        const rect = frameRect(1254, 1254, clip, index);
        assert.equal(rect.width, 156.75);
        assert.equal(
          rect.height,
          (1254 / (clip.rows ?? 8)) * (1 - (clip.cropTop ?? 0) - (clip.cropBottom ?? 0)),
        );
        assert.equal(rect.x, index * 156.75);
        assert.equal(rect.y, (clip.row + (clip.cropTop ?? 0)) * (1254 / (clip.rows ?? 8)));
        assert.ok((clip.cropTop ?? 0) >= 0 && (clip.cropBottom ?? 0) >= 0);
        assert.ok(
          (clip.cropTop ?? 0) + (clip.cropBottom ?? 0) <= 0.25,
          "Recorte conserva pelo menos75% da célula e evita pixels da família vizinha",
        );
        assert.ok(rect.x >= 0 && rect.x + rect.width <= 1254);
        assert.ok(rect.y >= 0 && rect.y + rect.height <= 1254);
      }
    }
  }
  assert.equal(attackClip("tackle"), "impact");
  assert.equal(attackClip("slash"), "slash");
  assert.equal(attackClip("flamethrower"), "fire");
  assert.equal(attackClip("surf"), "water");
  assert.equal(attackClip("thunderbolt"), "electric");
  assert.equal(attackClip("bulletseed"), "grass");
  assert.equal(attackClip("icebeam"), "ice");
  assert.equal(attackClip("shadowball"), "shadow");
  assert.equal(attackClip("psychic"), "psychic");
  assert.equal(attackClip("protect"), null);
  assert.equal(Object.keys(TYPE_VISUALS).length, 18);
  assert.deepEqual(Object.keys(TYPE_VISUALS).sort(), Object.keys(MOVE_TYPE_GLYPHS).sort());
  const tokens = await readFile(resolve(__dirname, '../../client/src/styles/tokens.css'), 'utf8');
  for (const [type, visual] of Object.entries(TYPE_VISUALS)) {
    assert.ok(SPRITE_CLIPS[visual.clip]);
    assert.ok(tokens.includes(`--type-${type}: ${visual.color}`), 'Paleta corresponde ao tipo existente');
    assert.ok(MOVE_TYPE_GLYPHS[type as keyof typeof MOVE_TYPE_GLYPHS].length > 10);
  }
  assert.equal(attackVisualType('thunderbolt'), 'electric');
  assert.equal(attackVisualType('protect'), undefined);
  assert.equal(attackVisualType('../fire'), undefined);
  for (const invalid of [
    "https://evil.test/a.webp",
    "//evil.test",
    "../attacks",
    "__proto__",
    "constructor",
    "unknown",
  ]) {
    assert.equal(
      attackClip(invalid),
      null,
      "Golpe desconhecido não determina caminhos de assets",
    );
  }
  assert.equal(statusClip("burn"), "burn");
  assert.equal(statusClip("poison"), "poison");
  assert.equal(statusClip("bad_poison"), "poison");
  assert.equal(statusClip("paralysis"), "electric");
  assert.equal(statusClip("sleep"), "sleep");
  assert.equal(statusClip("freeze"), "frozen");
  assert.equal(statusClip(null), null);
  assert.equal(statusClip(undefined), null);
  return totalBytes;
}

class ControlledCanvas {
  static created: ControlledCanvas[] = [];
  width = 0;
  height = 0;
  className = "";
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  parent: ControlledParent | null = null;
  draws: unknown[][] = [];
  tints: string[] = [];
  context = {
    fillStyle: '',
    save() {}, restore() {}, translate() {}, scale() {}, fill() {},
    fillRect: () => this.tints.push(this.context.fillStyle),
    clearRect() {},
    drawImage: (...args: unknown[]) => this.draws.push(args),
  };
  constructor() {
    ControlledCanvas.created.push(this);
  }
  getContext() {
    return this.context;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  remove() {
    this.parent?.children.delete(this);
    this.parent = null;
  }
}
class ControlledParent {
  children = new Set<ControlledCanvas>();
  rect = { left: 0, top: 0, width: 100, height: 100 };
  stage: ControlledParent | null = null;
  clientLeft = 0;
  clientTop = 0;
  closest(selector: string) {
    if (selector === '[data-scene-side]') return null;
    assert.equal(selector, "[data-fx-stage]");
    return this.stage;
  }
  getBoundingClientRect() {
    return this.rect;
  }
  appendChild(canvas: ControlledCanvas) {
    canvas.remove();
    canvas.parent = this;
    this.children.add(canvas);
    return canvas;
  }
}
class ControlledImage {
  static created: ControlledImage[] = [];
  naturalWidth = 1254;
  naturalHeight = 1254;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    ControlledImage.created.push(this);
  }
  load() {
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}
const asElement = (parent: ControlledParent) =>
  parent as unknown as HTMLElement;
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function rendererTests() {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const frameCallbacks = new Map<number, FrameRequestCallback>();
  const timeouts = new Map<number, { callback: () => void; ms: number }>();
  let nextFrame = 1,
    nextTimeout = 1;
  const fakeGlobals = {
    document: {
      createElement: (tag: string) => {
        assert.equal(tag, "canvas");
        return new ControlledCanvas();
      },
    },
    window: { devicePixelRatio: 3 },
    Path2D: class { constructor(readonly path: string) {} },
    Image: ControlledImage,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frameCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => frameCallbacks.delete(id),
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextTimeout++;
      timeouts.set(id, { callback, ms });
      return id;
    },
    clearTimeout: (id: number) => timeouts.delete(id),
  };
  for (const [key, value] of Object.entries(fakeGlobals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const tick = (now: number) => {
    assert.ok(
      frameCallbacks.size <= 1,
      "Todos os clips compartilham um único RAF",
    );
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    for (const callback of callbacks) callback(now);
  };
  const assertIdle = () => {
    assert.equal(spriteStats().active, 0);
    assert.equal(spriteStats().framesPending, 0);
    assert.equal(frameCallbacks.size, 0);
  };
  try {
    const cancelledBefore = new AbortController();
    cancelledBefore.abort();
    await playSprite(asElement(new ControlledParent()), "impact", {
      signal: cancelledBefore.signal,
    });
    await playSprite(null, "impact", { signal: new AbortController().signal });
    assert.equal(ControlledImage.created.length, 0);
    assert.equal(ControlledCanvas.created.length, 0);

    const abandoned = new ControlledParent(),
      active = new ControlledParent();
    const first = new AbortController(),
      second = new AbortController();
    const abandonedPlay = playSprite(asElement(abandoned), "impact", {
      signal: first.signal,
    });
    const finitePlay = playSprite(asElement(active), "fire", {
      signal: second.signal,
      size: 100,
      visualType: 'dragon',
    });
    let finiteFinished = false;
    void finitePlay.then(() => {
      finiteFinished = true;
    });
    assert.equal(
      ControlledImage.created.length,
      1,
      "Dois clips compartilham o carregamento do atlas",
    );
    assert.equal(ControlledImage.created[0].src, VFX_ATLASES.attacks);
    first.abort();
    await abandonedPlay;
    assert.equal(abandoned.children.size, 0);
    assert.notEqual(
      ControlledImage.created[0].onload,
      null,
      "Abort de um cliente não cancela o atlas compartilhado",
    );
    ControlledImage.created[0].load();
    await flush();
    assert.equal(active.children.size, 1);
    assert.equal(spriteStats().active, 1);
    const canvas = [...active.children][0];
    assert.equal(canvas.width, 200, "Device pixel ratio limitado a dois");
    assert.equal(canvas.height, 200);
    assert.equal(canvas.style.width, "100px");
    assert.equal(
      canvas.style.maxWidth,
      "none",
      "Reset global não comprime canvas no holder do Pokémon",
    );
    assert.equal(canvas.attributes.get("aria-hidden"), "true");
    tick(0);
    assert.equal(canvas.attributes.get('data-visual-type'), 'dragon');
    assert.deepEqual(canvas.tints, [TYPE_VISUALS.dragon.color]);
    assert.deepEqual(canvas.draws[0].slice(1, 5), [0, 313.5, 156.75, 156.75]);
    tick(20);
    assert.equal(
      canvas.draws.length,
      1,
      "Frame igual não redesenha nem recria DOM",
    );
    tick(90);
    assert.equal(canvas.draws.length, 2);
    assert.equal(canvas.draws[1][1], 156.75);
    tick(650);
    assert.equal(canvas.draws.at(-1)![1], 1097.25);
    assert.equal(finiteFinished, false);
    tick(700);
    await finitePlay;
    assert.equal(finiteFinished, true);
    assert.equal(active.children.size, 0);
    assert.equal(
      ControlledCanvas.created.length,
      1,
      "Frames usam o mesmo canvas imperativo",
    );
    assertIdle();

    const reverseParent = new ControlledParent(),
      reverseController = new AbortController();
    const reversePlay = playSprite(asElement(reverseParent), "slash", {
      signal: reverseController.signal,
      reverse: true,
      delay: 100,
    });
    await flush();
    const reverseCanvas = [...reverseParent.children][0];
    tick(1000);
    tick(1099);
    assert.equal(reverseCanvas.draws.length, 0, "Atraso adia o primeiro frame");
    tick(1100);
    assert.equal(reverseCanvas.draws[0][1], 1097.25);
    tick(1190);
    assert.equal(reverseCanvas.draws[1][1], 940.5);
    reverseController.abort();
    await reversePlay;
    assert.equal(reverseParent.children.size, 0);
    const drawCount = reverseCanvas.draws.length;
    tick(1500);
    assert.equal(
      reverseCanvas.draws.length,
      drawCount,
      "Abort não permite frames tardios",
    );
    assertIdle();

    const loopParent = new ControlledParent(),
      loopController = new AbortController();
    const loopPlay = playSprite(asElement(loopParent), "sleep", {
      signal: loopController.signal,
      loop: true,
      position: "above",
    });
    const statusImage = ControlledImage.created.find(
      (image) => image.src === VFX_ATLASES.statuses,
    )!;
    statusImage.load();
    await flush();
    const loopCanvas = [...loopParent.children][0];
    assert.match(loopCanvas.className, /battle-sprite-fx-above/);
    tick(2000);
    tick(2875);
    assert.equal(loopCanvas.draws.at(-1)![1], 1097.25);
    tick(3000);
    assert.equal(
      loopCanvas.draws.at(-1)![1],
      0,
      "Loop volta ao frame inicial pelo relógio",
    );
    assert.equal(loopParent.children.size, 1);
    loopController.abort();
    await loopPlay;
    assert.equal(loopParent.children.size, 0);
    assertIdle();

    const stillParent = new ControlledParent(),
      stillController = new AbortController();
    const stillPlay = playSprite(asElement(stillParent), "burn", {
      signal: stillController.signal,
      static: true,
    });
    await flush();
    const stillCanvas = [...stillParent.children][0];
    assert.equal(stillCanvas.draws.length, 1);
    assert.equal(stillCanvas.draws[0][1], 470.25);
    assert.equal(
      spriteStats().active,
      1,
      "Arte estática participa do limite de efeitos vivos",
    );
    assert.equal(
      spriteStats().framesPending,
      0,
      "Movimento reduzido não agenda RAF",
    );
    tick(4000);
    assert.equal(stillCanvas.draws.length, 1);
    stillController.abort();
    await stillPlay;
    assert.equal(stillParent.children.size, 0);
    assertIdle();

    const allParent = new ControlledParent(),
      allController = new AbortController();
    const all = (Object.keys(SPRITE_CLIPS) as SpriteClipId[]).filter(id => id !== 'frozen').map((id) =>
      playSprite(asElement(allParent), id, {
        signal: allController.signal,
        loop: true,
      }),
    );
    const transitionImage = ControlledImage.created.find(
      (image) => image.src === VFX_ATLASES.transitions,
    )!;
    transitionImage.load();
    await flush();
    assert.equal(
      allParent.children.size,
      24,
      "Todos os clips têm atlas e renderização disponíveis",
    );
    assert.equal(spriteStats().active, 24);
    assert.equal(spriteStats().cached, 3);
    assert.equal(spriteStats().framesPending, 1);
    tick(5000);
    assert.ok([...allParent.children].every((item) => item.draws.length === 1));
    const limitedParent = new ControlledParent();
    await playSprite(asElement(limitedParent), "impact", {
      signal: new AbortController().signal,
    });
    assert.equal(
      limitedParent.children.size,
      0,
      "Efeito excedente respeita limite de 24",
    );
    allController.abort();
    await Promise.all(all);
    assert.equal(allParent.children.size, 0);
    assertIdle();

    const iceParent = new ControlledParent(), iceController = new AbortController();
    const icePlay = playSprite(asElement(iceParent), 'frozen', {signal: iceController.signal, loop: true});
    const iceImage = ControlledImage.created.find(image => image.src === VFX_ATLASES.frozen)!;
    iceImage.naturalWidth = 2048;
    iceImage.naturalHeight = 256;
    iceImage.load();
    await flush();
    assert.equal(iceParent.children.size, 1, 'Dedicated ice aura renders separately within the 24-instance budget');
    tick(5100);
    assert.equal([...iceParent.children][0].draws.length, 1);
    assert.equal(spriteStats().cached, 4);
    iceController.abort();
    await icePlay;
    assertIdle();

    const staticParent = new ControlledParent(),
      staticController = new AbortController();
    const statics = Array.from({ length: 24 }, () =>
      playSprite(asElement(staticParent), "burn", {
        signal: staticController.signal,
        static: true,
      }),
    );
    await flush();
    assert.equal(spriteStats().active, 24);
    assert.equal(staticParent.children.size, 24);
    assert.equal(spriteStats().framesPending, 0);
    const rejected = new ControlledParent();
    await playSprite(asElement(rejected), "burn", {
      signal: new AbortController().signal,
      static: true,
    });
    assert.equal(
      rejected.children.size,
      0,
      "Efeitos estáticos também respeitam o limite",
    );
    staticController.abort();
    await Promise.all(statics);
    assert.equal(staticParent.children.size, 0);
    assertIdle();

    markVfxFailed("https://evil.test/attacks.webp");
    const guarded = new ControlledParent(),
      guardedController = new AbortController();
    const guardedPlay = playSprite(asElement(guarded), "impact", {
      signal: guardedController.signal,
    });
    await flush();
    assert.equal(
      guarded.children.size,
      1,
      "Caminho externo não invalida assets locais",
    );
    guardedController.abort();
    await guardedPlay;

    const travelling = new ControlledParent(),
      destination = new ControlledParent();
    destination.rect = { left: 300, top: -150, width: 200, height: 100 };
    const travelController = new AbortController();
    const travelPlay = playSprite(asElement(travelling), "fire", {
      signal: travelController.signal,
      travelTo: asElement(destination),
    });
    await flush();
    const travelCanvas = [...destination.children][0];
    assert.equal(travelling.children.size, 0, 'Golpe nunca cria efeito sobre o atacante');
    assert.equal(travelCanvas.style.left, '100px');
    assert.equal(travelCanvas.style.top, '50px');
    tick(7000);
    const targetPosition = { left: travelCanvas.style.left, top: travelCanvas.style.top, transform: travelCanvas.style.transform };
    tick(7650);
    assert.deepEqual({ left: travelCanvas.style.left, top: travelCanvas.style.top, transform: travelCanvas.style.transform }, targetPosition, 'Efeito nasce e permanece no alvo, sem viajar');
    tick(7700);
    await travelPlay;
    assert.equal(travelling.children.size, 0);
    assertIdle();

    const pausedParent = new ControlledParent(),
      pausedController = new AbortController();
    let paused = false,
      pauseFinished = false;
    const pausePlay = playSprite(asElement(pausedParent), "impact", {
      signal: pausedController.signal,
      paused: () => paused,
    });
    void pausePlay.then(() => {
      pauseFinished = true;
    });
    await flush();
    const pausedCanvas = [...pausedParent.children][0];
    tick(8000);
    tick(8090);
    assert.equal(pausedCanvas.draws.at(-1)![1], 156.75);
    paused = true;
    tick(8100);
    tick(8600);
    assert.equal(
      pausedCanvas.draws.length,
      2,
      "Hit-stop conserva o frame atual mesmo com relógio avançando",
    );
    assert.equal(pauseFinished, false);
    paused = false;
    tick(8670);
    assert.equal(
      pausedCanvas.draws.length,
      2,
      "Retomar não consome o último intervalo ainda pausado",
    );
    tick(8750);
    assert.equal(pausedCanvas.draws.at(-1)![1], 313.5);
    assert.equal(pauseFinished, false);
    tick(9300);
    await pausePlay;
    assert.equal(pauseFinished, true, "Conclusão desconta o tempo de pausa");
    assert.equal(pausedParent.children.size, 0);
    assertIdle();

    const plane = new ControlledParent(),
      anchor = new ControlledParent(),
      beamTarget = new ControlledParent();
    plane.rect = { left: 20, top: 40, width: 600, height: 300 };
    anchor.rect = { left: 120, top: 120, width: 100, height: 100 };
    beamTarget.rect = { left: 420, top: 50, width: 100, height: 100 };
    anchor.stage = plane;
    beamTarget.stage = plane;
    const beamController = new AbortController();
    const beamPlay = playSprite(asElement(anchor), "fire", {
      signal: beamController.signal,
      presentation: "beam",
      travelTo: asElement(beamTarget),
    });
    await flush();
    assert.equal(
      anchor.children.size,
      0,
      "Efeito transitório sai do stacking context da criatura",
    );
    const beam = [...plane.children][0];
    assert.equal(beam.style.left, "450px");
    assert.equal(beam.style.top, "60px");
    assert.equal(beam.style.zIndex, "var(--z-effects, 30)");
    assert.equal(beam.style.width, "180px", 'Feixe é um impacto no alvo, sem comprimento entre os atores');
    tick(10000);
    tick(10300);
    assert.match(beam.style.transform, /^translate\(-50%, -50%\) rotate\(0deg\)/);
    assert.ok(
      Number(beam.style.opacity) > 0.9,
      "Feixe mantém arte perceptível no centro do efeito",
    );
    tick(10700);
    await beamPlay;
    assert.equal(plane.children.size, 0);
    assertIdle();

    const powderController = new AbortController();
    const powderPlay = playSprite(asElement(anchor), "poison", {
      signal: powderController.signal,
      presentation: "powder",
      travelTo: asElement(beamTarget),
    });
    await flush();
    const powder = [...plane.children][0];
    assert.equal(powder.style.left, "450px");
    assert.equal(powder.style.top, "60px");
    tick(12000);
    tick(12875);
    assert.equal(
      powder.style.transform,
      "translate(-50%, -50%) scale(1)",
      "Pó permanece no alvo sem antecipar confirmação de status",
    );
    tick(13000);
    await powderPlay;
    assertIdle();

    const areaController = new AbortController();
    const areaPlay = playSprite(asElement(anchor), "water", {
      signal: areaController.signal,
      presentation: "area",
    });
    await flush();
    const area = [...plane.children][0];
    assert.equal(area.style.left, "150px");
    assert.equal(area.style.top, "130px");
    assert.equal(area.style.width, "180px");
    tick(14000);
    tick(14700);
    await areaPlay;
    assert.equal(plane.children.size, 0);
    assertIdle();

    markVfxFailed(VFX_ATLASES.statuses);
    const fallback = new ControlledParent(),
      fallbackController = new AbortController();
    const fallbackPlay = playSprite(asElement(fallback), "protect", {
      signal: fallbackController.signal,
    });
    await flush();
    tick(6000);
    const fallbackCanvas = [...fallback.children][0];
    assert.equal(
      (fallbackCanvas.draws[0][0] as ControlledImage).src,
      VFX_ATLASES.attacks,
    );
    assert.equal(
      fallbackCanvas.draws[0][2],
      0,
      "Atlas ausente usa efeito neutro da linha zero",
    );
    fallbackController.abort();
    await fallbackPlay;
    markVfxFailed(VFX_ATLASES.attacks);
    await playSprite(asElement(new ControlledParent()), "protect", {
      signal: new AbortController().signal,
    });
    assertIdle();
    assert.equal(
      ControlledImage.created.length,
      4,
      "Cache só admite os quatro caminhos locais fixos",
    );
    assert.equal(
      timeouts.size,
      0,
      "Carregamentos concluídos liberam seus temporizadores",
    );
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

/** Processo separado conserva o cache de produção e exercita falhas desde um carregamento frio. */
async function failureTests() {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextTimer = 1,
    nextFrame = 1;
  const originalNow = Date.now;
  let clock = 10000;
  Date.now = () => clock;
  const globals = {
    document: { createElement: () => new ControlledCanvas() },
    window: { devicePixelRatio: 1 },
    Image: ControlledImage,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      callbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => callbacks.delete(id),
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextTimer++;
      timers.set(id, { callback, ms });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  try {
    const failedParent = new ControlledParent(),
      deadlineParent = new ControlledParent();
    const failedController = new AbortController(),
      deadlineController = new AbortController();
    const failedPlay = playSprite(asElement(failedParent), "protect", {
      signal: failedController.signal,
    });
    const deadlinePlay = playSprite(asElement(deadlineParent), "summon", {
      signal: deadlineController.signal,
    });
    assert.equal(ControlledImage.created.length, 2);
    const pending = [...timers.values()];
    assert.deepEqual(
      pending.map((timer) => timer.ms),
      [1500, 1500],
    );
    ControlledImage.created[0].fail();
    await flush();
    assert.equal(
      ControlledImage.created.length,
      3,
      "Erro de rede inicia o fallback neutro local",
    );
    assert.equal(ControlledImage.created[2].src, VFX_ATLASES.attacks);
    assert.equal(ControlledImage.created[0].onload, null);
    assert.equal(ControlledImage.created[0].onerror, null);
    pending[1].callback();
    await flush();
    assert.equal(
      ControlledImage.created.length,
      3,
      "Timeout usa o fallback compartilhado",
    );
    assert.equal(ControlledImage.created[1].onload, null);
    assert.equal(ControlledImage.created[1].onerror, null);
    const cancelledParent = new ControlledParent(),
      cancelled = new AbortController();
    const cancelledPlay = playSprite(asElement(cancelledParent), "burn", {
      signal: cancelled.signal,
    });
    await flush();
    cancelled.abort();
    await cancelledPlay;
    assert.equal(cancelledParent.children.size, 0);
    ControlledImage.created[2].load();
    await flush();
    assert.equal(
      cancelledParent.children.size,
      0,
      "Fallback tardio não revive efeito cancelado",
    );
    assert.equal(failedParent.children.size, 1);
    assert.equal(deadlineParent.children.size, 1);
    const frame = [...callbacks.values()];
    callbacks.clear();
    for (const callback of frame) callback(0);
    for (const parent of [failedParent, deadlineParent]) {
      const draw = [...parent.children][0].draws[0];
      assert.equal((draw[0] as ControlledImage).src, VFX_ATLASES.attacks);
      assert.equal(draw[2], 0);
    }
    failedController.abort();
    deadlineController.abort();
    await Promise.all([failedPlay, deadlinePlay]);
    assert.equal(spriteStats().active, 0);
    assert.equal(spriteStats().framesPending, 0);
    assert.equal(callbacks.size, 0);
    assert.equal(timers.size, 0);
    clock += 1001;
    const recovered = new ControlledParent(),
      recoveryController = new AbortController();
    const recoveryPlay = playSprite(asElement(recovered), "protect", {
      signal: recoveryController.signal,
    });
    assert.equal(
      ControlledImage.created.length,
      4,
      "Erro não permanece como promessa null na cache da sessão",
    );
    ControlledImage.created[3].load();
    await flush();
    assert.equal(
      recovered.children.size,
      1,
      "Atlas volta a ser desenhado no mesmo aplicativo após cooldown",
    );
    const recoveryFrames = [...callbacks.values()];
    callbacks.clear();
    for (const callback of recoveryFrames) callback(0);
    assert.equal(
      ([...recovered.children][0].draws[0][0] as ControlledImage).src,
      VFX_ATLASES.statuses,
    );
    recoveryController.abort();
    await recoveryPlay;
    const afterDeadline = new ControlledParent(),
      afterDeadlineController = new AbortController();
    const afterDeadlinePlay = playSprite(asElement(afterDeadline), "summon", {
      signal: afterDeadlineController.signal,
    });
    assert.equal(
      ControlledImage.created.length,
      5,
      "Timeout transitório permite nova tentativa sem reload",
    );
    ControlledImage.created[4].load();
    await flush();
    assert.equal(afterDeadline.children.size, 1);
    afterDeadlineController.abort();
    await afterDeadlinePlay;
    assert.equal(spriteStats().active, 0);
    assert.equal(callbacks.size, 0);
    assert.equal(timers.size, 0);
    console.log(
      "Sprite cold-load failures: error, 1500 ms deadline, shared fallback, cancellation and recovery without reload passed.",
    );
  } finally {
    Date.now = originalNow;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

async function run() {
  if (process.argv.includes("--cold-failures")) {
    await failureTests();
    return;
  }
  const bytes = await assetTests();
  await rendererTests();
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, __filename, "--cold-failures"],
    {
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(
    child.status,
    0,
    `${child.stdout}\n${child.stderr}\n${child.error ?? ""}`,
  );
  assert.match(child.stdout, /cold-load failures: .* passed/);
  console.log(
    `Sprite animation: 25 clips, all local transparent WebP hashes (${bytes} bytes), real 8×8 geometry, shared clock/cache, limits, cancellation, loops, reduced motion, target-only effects, pause clock, cold-load deadline and fallback passed.`,
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
