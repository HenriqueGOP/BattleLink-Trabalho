import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { fixtureRoom, turn, act } from "./game/room.fixture";
import {
  BattleEventQueue,
  applyPresentedEvent,
} from "../../client/src/lib/presentation/BattleEventQueue";
import type { EventRunner } from "../../client/src/lib/presentation/BattleEventQueue";
import { AnimationDirector } from "../../client/src/lib/presentation/AnimationDirector";
import {
  FlashBudget,
  IMPACT,
  visualRandom,
} from "../../client/src/lib/presentation/impact";
import type {
  CanonicalEvent,
  RoomSnapshot,
} from "../../client/src/types/protocol";

class ManualRunner implements EventRunner {
  pending: {
    event: CanonicalEvent;
    complete: () => void;
    signal: AbortSignal;
  }[] = [];
  history: number[] = [];
  run(
    event: CanonicalEvent,
    _wire: RoomSnapshot,
    signal: AbortSignal,
    commit: () => void,
  ) {
    this.history.push(event.sequence);
    return new Promise<void>((resolve) => {
      const finish = () => {
        commit();
        resolve();
      };
      this.pending.push({ event, complete: finish, signal });
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }
  async next() {
    this.pending.shift()!.complete();
    await Promise.resolve();
    await Promise.resolve();
  }
}
async function drain(queue: BattleEventQueue, runner: ManualRunner) {
  for (let i = 0; queue.getSnapshot().busy && i < 500; i++) await runner.next();
  assert.equal(queue.getSnapshot().busy, false);
}
async function queueTests() {
  const entering = fixtureRoom(["bulletseed"], ["splash"], false);
  entering.acceptTeam("p1");
  entering.acceptTeam("p2");
  const preparing = entering.getStateFor("p1"),
    preparationId = preparing.preparation!.id;
  const entryRunner = new ManualRunner(),
    entryQueue = new BattleEventQueue(entryRunner);
  entryQueue.ingest(preparing);
  entering.battleReady("p1", preparationId);
  entering.battleReady("p2", preparationId);
  turn(entering, "bulletseed", "splash");
  const entered = entering.getStateFor("p1");
  entryQueue.ingest(entered);
  assert.equal(entryRunner.pending[0].event.type, "battle_start");
  const entryWire = entryQueue.getSnapshot().wire!;
  assert.equal(entryWire.phase, "battle", "Cena montada antes da entrada");
  assert.deepEqual(entryWire.battle!.active, { p1: "p1s0", p2: "p2s0" });
  const initialFoe = entryWire.battle!.opponentTeam[0];
  assert.ok(
    !("hidden" in initialFoe) && initialFoe.hp === initialFoe.maxHp,
    "Render agrupado não antecipa dano da rodada seguinte",
  );
  assert.ok(
    entryWire
      .battle!.opponentTeam.slice(1)
      .every((pokemon) => "hidden" in pokemon),
  );
  assert.deepEqual(entryWire.events, preparing.events);
  await drain(entryQueue, entryRunner);
  assert.deepEqual(entryQueue.getSnapshot().wire, entered);
  assert.equal(
    entryRunner.history.filter((sequence) => sequence === 0).length,
    1,
    "Entrada visual apresentada uma vez, sem duplicar o histórico canônico",
  );
  entryQueue.dispose();
  entering.destroy();
  const room = fixtureRoom(["bulletseed", "seismictoss"], ["splash"]);
  const initial = room.getStateFor("p1");
  const untouched = JSON.stringify(initial);
  const runner = new ManualRunner(),
    queue = new BattleEventQueue(runner);
  queue.ingest(initial);
  turn(room, "bulletseed", "splash");
  const first = room.getStateFor("p1");
  queue.ingest(first);
  assert.equal(queue.getSnapshot().wire!.battle!.opponentTeam[0].id, "p2s0");
  const hp = (wire: RoomSnapshot) => {
    const pokemon = wire.battle!.opponentTeam[0];
    return "hidden" in pokemon ? -1 : pokemon.hp;
  };
  assert.equal(
    hp(queue.getSnapshot().wire!),
    hp(initial),
    "Snapshot não antecipa dano",
  );
  while (runner.pending[0].event.type !== "damage") await runner.next();
  const hit = runner.pending[0].event;
  assert.equal(hit.type, "damage");
  if (hit.type !== "damage") throw Error("fixture");
  assert.equal(hp(queue.getSnapshot().wire!), hit.hpBefore);
  await runner.next();
  assert.equal(
    hp(queue.getSnapshot().wire!),
    hit.hpAfter,
    "HP confirmado somente ao concluir o hit",
  );
  turn(room, "seismictoss", "splash");
  const latest = room.getStateFor("p1");
  queue.ingest(latest); // chega antes de terminar a animação da rodada anterior
  queue.ingest(latest); // duplicata não reapresenta fatos
  await drain(queue, runner);
  assert.deepEqual(queue.getSnapshot().wire, latest);
  assert.equal(new Set(runner.history).size, runner.history.length);
  assert.equal(
    queue.getSnapshot().totals.dealt,
    latest.events
      .filter((event) => event.type === "damage" && event.source === "p1s0")
      .reduce((sum, event) => sum + ("amount" in event ? event.amount : 0), 0),
  );
  assert.equal(
    JSON.stringify(initial),
    untouched,
    "Reducer não modifica o snapshot de entrada",
  );

  turn(room, "seismictoss", "splash");
  queue.ingest(room.getStateFor("p1"));
  const abandoned = runner.pending[0];
  queue.skip();
  assert.equal(abandoned.signal.aborted, true);
  const skipped = queue.getSnapshot().wire;
  abandoned.complete();
  await Promise.resolve();
  assert.equal(
    queue.getSnapshot().wire,
    skipped,
    "Conclusão obsoleta não sobrescreve o skip",
  );
  queue.setHidden(true);
  // Solicitação forçada é resolvida no servidor e aplicada sem animação na aba oculta.
  if (room.getStateFor("p2").battle?.request?.kind === "switch")
    act(room, "p2", { type: "switch", combatantId: "p2s1" });
  const hidden = room.getStateFor("p1");
  queue.ingest(hidden);
  assert.deepEqual(queue.getSnapshot().wire, hidden);
  assert.equal(queue.getSnapshot().busy, false);
  queue.setHidden(false);
  queue.ingest({
    ...hidden,
    sequence: hidden.sequence + 1,
    eventFloor: hidden.sequence + 1,
    events: [],
  });
  assert.equal(
    queue.getSnapshot().wire!.sequence,
    hidden.sequence + 1,
    "Lacuna aplica snapshot",
  );
  queue.ingest(initial);
  assert.equal(
    queue.getSnapshot().wire!.sequence,
    hidden.sequence + 1,
    "Snapshot antigo ignorado",
  );
  queue.dispose();
  queue.activate(); // reexecução de effects em StrictMode
  queue.ingest({ ...hidden, roomId: "outra-sala" });
  assert.equal(queue.getSnapshot().totals.dealt, 0);
  queue.dispose();
  room.destroy();

  const knockout = fixtureRoom(["seismictoss"], ["splash"]);
  const before = knockout.getStateFor("p1");
  const run2 = new ManualRunner(),
    queue2 = new BattleEventQueue(run2);
  queue2.ingest(before);
  for (let i = 0; i < 3; i++) turn(knockout, "seismictoss", "splash");
  const afterKo = knockout.getStateFor("p1");
  act(knockout, "p2", { type: "switch", combatantId: "p2s1" });
  const afterSwitch = knockout.getStateFor("p1");
  queue2.ingest(afterKo);
  queue2.ingest(afterSwitch);
  while (run2.pending[0].event.type !== "faint") await run2.next();
  const victim = queue2.getSnapshot().wire!.battle!.opponentTeam[0];
  assert.ok(
    !("hidden" in victim) && victim.hp === 0 && !victim.fainted,
    "Queda não antecede evento faint",
  );
  assert.equal(queue2.getSnapshot().wire!.battle!.active.p2, "p2s0");
  await run2.next();
  while (run2.pending.at(0)?.event.type !== "switch") await run2.next();
  assert.equal(
    queue2.getSnapshot().wire!.battle!.active.p2,
    "p2s0",
    "Substituto aguarda saída",
  );
  await run2.next();
  assert.equal(queue2.getSnapshot().wire!.battle!.active.p2, "p2s1");
  await drain(queue2, run2);
  knockout.forfeit("p2");
  const result = knockout.getStateFor("p1");
  queue2.ingest(result);
  assert.equal(
    queue2.getSnapshot().wire!.phase,
    "battle",
    "Resultado aguarda apresentação",
  );
  await drain(queue2, run2);
  assert.equal(queue2.getSnapshot().wire!.phase, "finished");
  queue2.dispose();
  knockout.destroy();

  const statusRoom = fixtureRoom(["swordsdance", "willowisp"], ["splash"]);
  const baseline = statusRoom.getStateFor("p1");
  turn(statusRoom, "swordsdance", "splash");
  turn(statusRoom, "willowisp", "splash");
  let shown = baseline;
  for (const event of statusRoom
    .getStateFor("p1")
    .events.filter((event) => event.sequence > baseline.sequence))
    shown = applyPresentedEvent(shown, event);
  assert.equal(shown.battle!.ownTeam[0].boosts.atk, 2);
  const enemy = shown.battle!.opponentTeam[0];
  assert.ok(!("hidden" in enemy) && enemy.status === "brn");
  statusRoom.destroy();
}

class FakeAnimation {
  finished: Promise<void>;
  private resolve!: () => void;
  private reject!: (error: Error) => void;
  cancelled = false;
  settled = false;
  playState = "running";
  pause() {
    this.playState = "paused";
  }
  play() {
    this.playState = "running";
  }
  constructor() {
    this.finished = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
  finish() {
    if (!this.settled) {
      this.playState = "finished";
      this.settled = true;
      this.resolve();
    }
  }
  cancel() {
    this.cancelled = true;
    if (!this.settled) {
      this.settled = true;
      const e = new Error("cancelled");
      e.name = "AbortError";
      this.reject(e);
    }
  }
}
class FakeNode {
  static animations: FakeAnimation[] = [];
  static frames: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] =
    [];
  static created: FakeNode[] = [];
  children = new Set<FakeNode>();
  parent: FakeNode | null = null;
  style: Record<string, string> = {};
  className = "";
  textContent = "";
  selectors = new Map<string, FakeNode>();
  setAttribute() {}
  appendChild(node: FakeNode) {
    node.remove();
    node.parent = this;
    this.children.add(node);
  }
  remove() {
    this.parent?.children.delete(this);
    this.parent = null;
  }
  querySelector(selector: string) {
    return this.selectors.get(selector) ?? null;
  }
  animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = new FakeAnimation();
    FakeNode.animations.push(animation);
    FakeNode.frames.push({ frames, options });
    return animation;
  }
}
async function until(check: () => boolean) {
  for (let i = 0; !check() && i < 100; i++) await delay(5);
  assert.ok(check());
}
async function directorTests() {
  const originalDocument = globalThis.document,
    originalWindow = globalThis.window,
    originalRaf = globalThis.requestAnimationFrame,
    originalCancelRaf = globalThis.cancelAnimationFrame;
  try {
    globalThis.document = {
      createElement: () => {
        const node = new FakeNode();
        FakeNode.created.push(node);
        return node;
      },
    } as unknown as Document;
    globalThis.window = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window & typeof globalThis;
    globalThis.requestAnimationFrame = (callback) =>
      setTimeout(() => callback(performance.now()), 0) as unknown as number;
    globalThis.cancelAnimationFrame = (frame) => clearTimeout(frame);
    const stage = new FakeNode(),
      me = new FakeNode(),
      foe = new FakeNode(),
      hud = new FakeNode(),
      fill = new FakeNode(),
      ghost = new FakeNode();
    stage.selectors.set('[data-hud-side="opponent"]', hud);
    hud.selectors.set("[data-hp-fill]", fill);
    hud.selectors.set("[data-hp-ghost]", ghost);
    const room = fixtureRoom(),
      wire = room.getStateFor("p1");
    room.destroy();
    const damage: CanonicalEvent = {
      type: "damage",
      sequence: 10,
      round: 1,
      audience: "public",
      target: "p2s0",
      source: "p1s0",
      cause: "tackle",
      hpBefore: 130,
      hpAfter: 100,
      maxHp: 130,
      amount: 30,
    };
    const director = new AnimationDirector({
      stage: () => stage as unknown as HTMLElement,
      sprite: (side) => (side === "me" ? me : foe) as unknown as HTMLElement,
    });
    let commits = 0;
    const play = director.run(
      damage,
      wire,
      new AbortController().signal,
      () => commits++,
    );
    await until(() => FakeNode.animations.length > 0);
    assert.equal(commits, 0);
    assert.equal(
      FakeNode.created.filter(
        (node) => node.className === "battle-float battle-float-damage",
      ).length,
      1,
      "Um número por hit",
    );
    assert.ok(foe.children.size <= IMPACT.particleLimit + 2);
    assert.ok(
      FakeNode.frames.some(
        (value) => value.options.delay === IMPACT.ghostDelay,
      ),
    );
    for (const animation of FakeNode.animations) animation.finish();
    await play;
    assert.equal(commits, 1);
    assert.equal(foe.children.size, 0, "Efeitos removidos na conclusão");
    const particleCount = FakeNode.created.filter(
      (node) => node.className === "battle-particle",
    ).length;
    const controller = new AbortController(),
      before = FakeNode.animations.length;
    const cancelled = director.run(
      { ...damage, sequence: 11 },
      wire,
      controller.signal,
      () => commits++,
    );
    await until(() => FakeNode.animations.length > before);
    controller.abort();
    const replacementBefore = FakeNode.animations.length;
    const replacement = director.run(
      { ...damage, sequence: 12 },
      wire,
      new AbortController().signal,
      () => commits++,
    );
    await cancelled;
    assert.equal(commits, 1);
    assert.ok(
      foe.children.size > 0,
      "Conclusão cancelada não remove partículas reutilizadas pelo próximo impacto",
    );
    assert.equal(
      FakeNode.created.filter((node) => node.className === "battle-particle")
        .length,
      particleCount,
      "Pool reutilizado",
    );
    assert.ok(
      FakeNode.animations
        .slice(before, replacementBefore)
        .every((animation) => animation.cancelled),
    );
    for (const animation of FakeNode.animations.slice(replacementBefore))
      animation.finish();
    await replacement;
    assert.equal(commits, 2);
    assert.equal(foe.children.size, 0);
    // Saída e entrada da troca devem compartilhar cancelamento e confirmar o novo ativo no meio.
    const switchRoom = fixtureRoom(),
      switchWire = switchRoom.getStateFor("p1");
    act(switchRoom, "p1", { type: "switch", combatantId: "p1s1" });
    act(switchRoom, "p2", { type: "move", moveId: "splash" });
    const switching = switchRoom
      .getStateFor("p1")
      .events.find(
        (event) => event.type === "switch" && event.target === "p1s1",
      )!;
    switchRoom.destroy();
    const switchBefore = FakeNode.animations.length;
    const switchController = new AbortController();
    const switched = director.run(
      switching,
      switchWire,
      switchController.signal,
      () => commits++,
    );
    assert.equal(commits, 2);
    FakeNode.animations[switchBefore].finish();
    await until(() => FakeNode.animations.length > switchBefore + 1);
    assert.equal(
      commits,
      3,
      "Troca confirma o novo ativo depois da saída e antes da entrada",
    );
    switchController.abort();
    await switched;
    assert.equal(commits, 3, "Entrada cancelada não confirma duas vezes");
    assert.equal(me.children.size, 0);
    assert.ok(
      FakeNode.frames.every((value) =>
        value.frames.every((frame) =>
          Object.keys(frame).every((key) =>
            ["opacity", "transform", "offset"].includes(key),
          ),
        ),
      ),
    );
    director.dispose();
    let reducedSounds = 0;
    const reduced = new AnimationDirector({
      stage: () => stage as unknown as HTMLElement,
      sprite: () => foe as unknown as HTMLElement,
      reducedMotion: () => true,
      sound: () => reducedSounds++,
    });
    const reducedBefore = FakeNode.animations.length;
    await reduced.run(
      damage,
      wire,
      new AbortController().signal,
      () => commits++,
    );
    assert.equal(FakeNode.animations.length, reducedBefore);
    assert.equal(
      reducedSounds,
      1,
      "Movimento reduzido preserva a escolha explícita de áudio",
    );
    assert.equal(commits, 4);
    reduced.dispose();
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  }
  const flash = new FlashBudget();
  assert.equal(flash.allow(0), true);
  assert.equal(flash.allow(100), true);
  assert.equal(flash.allow(200), false);
  assert.equal(flash.allow(1000), true);
  assert.ok(IMPACT.hitStop >= 60 && IMPACT.criticalHitStop <= 90);
  const a = visualRandom(8),
    b = visualRandom(8);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
}
void (async () => {
  await queueTests();
  await directorTests();
  console.log(
    "Presentation tests passed: queued snapshots, per-hit HP, KO/switch/result, skip, hidden tab, stale completion, cleanup, pooled effects and reduced motion.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
