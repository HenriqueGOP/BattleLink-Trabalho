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
import type { BattleEventData } from "./game/engine";
import { battleMessage } from "../../client/src/lib/battleMessages";
import {
  animateEvent,
  buildLogEntries,
} from "../../client/src/lib/eventEngine";
import { presentSnapshot } from "../../client/src/lib/battleView";
import { TRAINER_TIMINGS, trainerFramePosition } from "../../client/src/lib/presentation/trainerMotion";
import { TRAINER_FRAME, TRAINER_POSES } from "../../client/src/lib/trainerAssets";
import { visibleStatStages } from "../../client/src/lib/presentation/statStages";

function messageTests() {
  const room = fixtureRoom();
  const original = room.getStateFor("p1");
  const wire: RoomSnapshot = {
    ...original,
    battle: {
      ...original.battle!,
      ownTeam: original.battle!.ownTeam.map((pokemon, index) =>
        index === 0 ? { ...pokemon, speciesId: "blastoise" } : pokemon,
      ),
    },
  };
  let sequence = wire.sequence;
  const event = (data: BattleEventData): CanonicalEvent => ({
    ...data,
    sequence: ++sequence,
    round: 1,
    audience: "public",
  });
  const effect = (operation: string, effectId: string | null) =>
    event({
      type: "effect",
      operation,
      effectId,
      target: "p1s0",
      side: "p1",
    });
  const protect = effect("singleturn", "protect");
  const examples: readonly [CanonicalEvent, string][] = [
    [protect, "Blastoise se protegeu!"],
    [effect("activate", "protect"), "Blastoise bloqueou o golpe!"],
    [effect("start", "confusion"), "Blastoise ficou confuso!"],
    [effect("end", "confusion"), "Blastoise saiu da confusão!"],
    [effect("start", "substitute"), "Blastoise criou um substituto!"],
    [effect("end", "substitute"), "Blastoise perdeu seu substituto!"],
    [effect("mustrecharge", null), "Blastoise precisa recuperar energia!"],
    [effect("prepare", "solarblade"), "Blastoise está preparando Solar Blade!"],
    [effect("fail", null), "O golpe falhou!"],
    [
      event({ type: "status", target: "p1s0", status: "brn" }),
      "Blastoise ficou com uma queimadura!",
    ],
    [
      event({ type: "status", target: "p1s0", status: "slp" }),
      "Blastoise adormeceu!",
    ],
    [
      event({ type: "unable", actor: "p1s0", reason: "par" }),
      "Blastoise está paralisado e não conseguiu se mover!",
    ],
    [
      event({
        type: "boost",
        target: "p1s0",
        stat: "atk",
        before: 0,
        after: 2,
      }),
      "O Ataque de Blastoise aumentou bastante!",
    ],
    [
      event({
        type: "boost",
        target: "p1s0",
        stat: "def",
        before: 0,
        after: -1,
      }),
      "A Defesa de Blastoise diminuiu!",
    ],
    [
      event({ type: "hit_count", target: "p1s0", hits: 3 }),
      "O golpe atingiu Blastoise 3 vezes!",
    ],
  ];
  for (const [canonical, expected] of examples) {
    const untouched = JSON.stringify({ canonical, wire });
    assert.equal(battleMessage(canonical, wire), expected);
    assert.equal(
      animateEvent(canonical, presentSnapshot(wire), 0)?.message,
      expected,
    );
    assert.equal(
      JSON.stringify({ canonical, wire }),
      untouched,
      "Texto local não altera o evento nem o snapshot autoritativo",
    );
  }
  const internalOperations = [
    "start",
    "end",
    "singleturn",
    "singlemove",
    "activate",
    "prepare",
    "mustrecharge",
    "fail",
    "block",
    "notarget",
    "sidestart",
    "sideend",
    "fieldstart",
    "fieldend",
    "fieldactivate",
    "cureteam",
    "ohko",
    "nothing",
    "swapboost",
    "copyboost",
    "clearboost",
    "clearallboost",
    "clearpositiveboost",
    "clearnegativeboost",
    "invertboost",
    "setboost",
    "candynamax",
  ];
  for (const operation of internalOperations) {
    const text = battleMessage(
      effect(operation, "unknown_internal_effect"),
      wire,
    );
    assert.ok(
      text &&
        !text.includes(operation) &&
        !text.includes("unknown_internal_effect"),
      `Operação ${operation} nunca aparece como texto técnico`,
    );
  }
  for (const id of [
    "../asset",
    "https://evil.test/animation",
    "__proto__",
    "constructor",
  ]) {
    assert.equal(
      battleMessage(
        event({ type: "move", actor: "p1s0", target: "p2s0", moveId: id }),
        wire,
      ),
      "Blastoise usou um golpe!",
    );
    assert.equal(
      battleMessage(event({ type: "unable", actor: "p1s0", reason: id }), wire),
      "Blastoise não conseguiu agir!",
    );
    assert.ok(!battleMessage(effect("start", id), wire).includes(id));
  }
  const hidden = event({ type: "faint", target: "p2s1" });
  assert.equal(
    battleMessage(hidden, wire),
    "O Pokémon foi nocauteado!",
    "Nome de Pokémon oculto não é inferido da equipe ou de escolhas pendentes",
  );
  const entries = buildLogEntries(
    presentSnapshot({ ...wire, events: [protect] }),
    0,
  );
  assert.equal(entries.at(-1)?.text, "Blastoise se protegeu!");
  assert.equal(
    entries.at(-1)?.id,
    protect.sequence,
    "Identificador de log continua canônico",
  );
  room.destroy();
}

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
  const oldIdentity = presentSnapshot(shown).players[1].pokemonData!.id;
  const sameStatusSwitch: CanonicalEvent = {
    type: 'switch', target: 'p2s1', previous: 'p2s0', forced: false,
    pokemon: { ...enemy, id: 'p2s1' }, sequence: shown.sequence + 1, round: 1, audience: 'public',
  };
  const replacementView = presentSnapshot(applyPresentedEvent(shown, sameStatusSwitch));
  assert.equal(replacementView.players[1].pokemonData!.status, 'burn');
  assert.equal(replacementView.players[1].pokemonData!.id, 'p2s1');
  assert.notEqual(replacementView.players[1].pokemonData!.id, oldIdentity, 'Troca conserva identidade distinta mesmo com espécie e status iguais; chave da aura é reiniciada');
  const activeStages = presentSnapshot(shown).players[0].pokemonData!.statStages;
  assert.deepEqual(visibleStatStages(activeStages).map(stage => [stage.stat, stage.value]), [['attack', 2]], 'Buff do jogador permanece enquanto estiver no snapshot apresentado');
  const foeBoost: CanonicalEvent = { type: 'boost', target: 'p2s0', stat: 'def', before: 0, after: -1, sequence: shown.sequence + 1, round: 1, audience: 'public' };
  shown = applyPresentedEvent(shown, foeBoost);
  assert.deepEqual(visibleStatStages(presentSnapshot(shown).players[1].pokemonData!.statStages).map(stage => [stage.stat, stage.value]), [['defense', -1]], 'Debuff do adversário tem o próprio alvo');
  const cleared: CanonicalEvent = { type: 'state_sync', sequence: shown.sequence + 1, round: 1, audience: 'public', active: shown.battle!.ownTeam.slice(0, 1).map(pokemon => ({ ...pokemon, boosts: {} })), sideConditions: shown.battle!.sideConditions, fieldConditions: shown.battle!.fieldConditions };
  shown = applyPresentedEvent(shown, cleared);
  assert.equal(visibleStatStages(presentSnapshot(shown).players[0].pokemonData!.statStages).length, 0, 'A limpeza real remove o indicador imediatamente');
  assert.equal(visibleStatStages(activeStages, true).length, 0, 'Pokémon nocauteado não mantém indicadores');
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
  propertyWrites: { key: string; value: string; pose: string }[] = [];
  style = { setProperty: (key: string, value: string) => { (this.style as Record<string, unknown>)[key] = value; this.propertyWrites.push({ key, value, pose: this.dataset.pose }); } } as Record<string, unknown> & { setProperty: (key: string, value: string) => void; };
  dataset: Record<string, string> = {};
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
async function until(check: () => boolean, limit = 100) {
  for (let i = 0; !check() && i < limit; i++) await delay(5);
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
      "Conclusão cancelada não remove efeitos do próximo impacto",
    );
    assert.equal(
      FakeNode.created.filter((node) => node.className === "battle-particle")
        .length,
      0,
      "Arte CSS removida; limite e liberação dos clips estão cobertos em sprite-animation.test",
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
    const completedSwitchBefore = FakeNode.animations.length;
    const completedSwitch = director.run(
      switching,
      switchWire,
      new AbortController().signal,
      () => commits++,
    );
    FakeNode.animations[completedSwitchBefore].finish();
    await until(() => FakeNode.animations.length > completedSwitchBefore + 1);
    assert.equal(
      commits,
      4,
      "Troca completa confirma no limite entre saída e entrada",
    );
    for (const animation of FakeNode.animations.slice(completedSwitchBefore))
      animation.finish();
    await completedSwitch;
    assert.equal(
      commits,
      4,
      "Entrada concluída não confirma o mesmo evento outra vez",
    );
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
    // Every authored frame finishes before any creature enter animation starts.
    const intro = new FakeNode(), trainer = new FakeNode();
    stage.selectors.set('[data-trainer-intro]', intro);
    intro.selectors.set('[data-trainer-sprite]', trainer);
    const start: CanonicalEvent = { type: 'battle_start', sequence: 0, round: 0, audience: 'public' };
    const introBefore = FakeNode.animations.length;
    const trainerWire: RoomSnapshot = { ...wire, trainerId: 'vespera' };
    const entered = director.run(start, trainerWire, new AbortController().signal, () => commits++);
    await until(() => FakeNode.animations.length > introBefore);
    assert.equal(stage.dataset.trainerPhase, 'idle');
    FakeNode.animations[introBefore].finish();
    await until(() => stage.dataset.trainerPhase === 'prepare', 300);
    assert.equal(FakeNode.animations.length, introBefore + 1, 'No Pokémon animation during prepare');
    await until(() => stage.dataset.trainerPhase === 'throw', 300);
    assert.equal(trainer.style['--trainer-y'], '-400px');
    await until(() => stage.dataset.trainerPhase === 'follow', 300);
    assert.equal(FakeNode.animations.length, introBefore + 1, 'No Pokémon appears before follow-through finishes');
    await until(() => FakeNode.animations.length > introBefore + 1, 300);
    assert.equal(stage.dataset.trainerPhase, 'complete');
    assert.equal(intro.style.opacity, '1', 'Trainer remains in the dedicated arena area');
    for (const pose of ['idle', 'prepare', 'throw', 'follow']) {
      assert.equal(new Set(trainer.propertyWrites.filter(write => write.pose === pose && write.key === '--trainer-x').map(write => write.value)).size, TRAINER_FRAME.columns, `${pose} presents every distinct authored frame`);
    }
    assert.equal(stage.dataset.trainerSummon, undefined);
    for (const animation of FakeNode.animations.slice(introBefore + 1)) animation.finish();
    await entered;
    assert.equal(trainer.dataset.controlled, undefined);
    const abortIntro = new AbortController();
    const cancelledIntro = director.run(start, trainerWire, abortIntro.signal, () => commits++);
    abortIntro.abort();
    await cancelledIntro;
    assert.equal(stage.dataset.trainerPhase, 'complete', 'Skip releases hidden creatures');
    assert.equal(intro.style.opacity, '1');
    assert.equal(stage.dataset.trainerSummon, undefined);

    // Forced opponent replacement must wait for a fresh full throw before commit.
    const foeSwitch: CanonicalEvent = { ...switching, type: 'switch', target: 'p2s1', previous: 'p2s0', forced: true, pokemon: { ...('pokemon' in switching ? switching.pokemon : trainerWire.battle!.ownTeam[1]), id: 'p2s1' } };
    const faintedWire: RoomSnapshot = { ...trainerWire, battle: { ...trainerWire.battle!, opponentTeam: trainerWire.battle!.opponentTeam.map(pokemon => pokemon.id === 'p2s0' && !('hidden' in pokemon) ? { ...pokemon, fainted: true, hp: 0 } : pokemon) } };
    const beforeReplace = FakeNode.animations.length;
    let replacementCommitted = false;
    const replaced = director.run(foeSwitch, faintedWire, new AbortController().signal, () => { replacementCommitted = true; });
    await until(() => stage.dataset.trainerPhase === 'prepare');
    assert.equal(stage.dataset.trainerSummon, 'opponent');
    assert.equal(replacementCommitted, false);
    await until(() => stage.dataset.trainerPhase === 'throw', 300);
    assert.equal(replacementCommitted, false);
    await until(() => stage.dataset.trainerPhase === 'follow', 300);
    assert.equal(replacementCommitted, false);
    await until(() => replacementCommitted, 300);
    await until(() => FakeNode.animations.length > beforeReplace);
    assert.equal(stage.dataset.trainerSummon, undefined, 'Replacement becomes visible only after the throw');
    for (const animation of FakeNode.animations.slice(beforeReplace)) animation.finish();
    await replaced;
    const interruptedReplace = new AbortController();
    let lateCommit = false;
    const replaceAborted = director.run(foeSwitch, faintedWire, interruptedReplace.signal, () => { lateCommit = true; });
    await until(() => stage.dataset.trainerPhase === 'prepare');
    interruptedReplace.abort();
    await replaceAborted;
    assert.equal(lateCommit, false);
    assert.equal(stage.dataset.trainerSummon, undefined, 'Skip releases a pending replacement');

    // Trainer reactions use the target/source, and result uses the winner side.
    const ownKo: CanonicalEvent = { ...damage, target: 'p1s0', source: 'p2s0', hpAfter: 0 };
    const koBefore = FakeNode.animations.length;
    const koDamage = director.run(ownKo, trainerWire, new AbortController().signal, () => {});
    for (const animation of FakeNode.animations.slice(koBefore)) animation.finish();
    await koDamage;
    const faint: CanonicalEvent = { type: 'faint', target: 'p1s0', sequence: 15, audience: 'public', round: 1 };
    const faintBefore = FakeNode.animations.length;
    let fallCommitted = false;
    const faintPlay = director.run(faint, trainerWire, new AbortController().signal, () => { fallCommitted = true; });
    for (const animation of FakeNode.animations.slice(faintBefore)) animation.finish();
    await until(() => trainer.dataset.pose === 'celebrate');
    assert.equal(fallCommitted, true, 'A queda já foi aplicada e o sprite não reaparece durante a comemoração');
    await faintPlay;
    assert.equal(new Set(trainer.propertyWrites.filter(write => write.pose === 'celebrate' && write.key === '--trainer-x').map(write => write.value)).size, TRAINER_FRAME.columns);
    const wrongFaintBefore = trainer.propertyWrites.length;
    const foeFaint: CanonicalEvent = { ...faint, target: 'p2s0' };
    const wrongBefore = FakeNode.animations.length;
    const wrongPlay = director.run(foeFaint, trainerWire, new AbortController().signal, () => {});
    for (const animation of FakeNode.animations.slice(wrongBefore)) animation.finish();
    await wrongPlay;
    assert.equal(trainer.propertyWrites.length, wrongFaintBefore, 'Trainer never celebrates its own Pokémon fainting');
    const endBefore = FakeNode.animations.length;
    const trainerLoss: CanonicalEvent = { type: 'battle_end', result: { winner: 'p1', reason: 'knockout' }, sequence: 20, round: 1, audience: 'public' };
    const ending = director.run(trainerLoss, trainerWire, new AbortController().signal, () => {});
    for (const animation of FakeNode.animations.slice(endBefore)) animation.finish();
    await until(() => trainer.dataset.pose === 'defeated');
    await ending;
    assert.equal(new Set(trainer.propertyWrites.filter(write => write.pose === 'defeated' && write.key === '--trainer-x').map(write => write.value)).size, TRAINER_FRAME.columns);
    const victoryBefore = FakeNode.animations.length;
    const trainerVictory: CanonicalEvent = { ...trainerLoss, result: { winner: 'p2', reason: 'knockout' } };
    const victory = director.run(trainerVictory, trainerWire, new AbortController().signal, () => {});
    for (const animation of FakeNode.animations.slice(victoryBefore)) animation.finish();
    await until(() => trainer.dataset.pose === 'celebrate');
    await victory;
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
    assert.equal(commits, 6);
    await reduced.run(start, trainerWire, new AbortController().signal, () => commits++);
    assert.equal(stage.dataset.trainerPhase, 'complete');
    assert.equal(FakeNode.animations.length, reducedBefore);
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
  for (const pose of TRAINER_POSES) {
    assert.ok(TRAINER_TIMINGS[pose] >= 900, `${pose} is slow enough to read`);
    assert.equal(new Set(Array.from({ length: TRAINER_FRAME.columns }, (_, frame) => trainerFramePosition(pose, frame).x)).size, 6);
  }
  const a = visualRandom(8),
    b = visualRandom(8);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
}
// An unresolved mock animation must fail instead of letting Node exit silently.
const completionDeadline = setTimeout(() => {
  console.error('Presentation tests did not complete within 60 seconds');
  process.exitCode = 1;
}, 60_000);
void (async () => {
  messageTests();
  await queueTests();
  await directorTests();
  console.log(
    "Presentation tests passed: queued snapshots, per-hit HP, KO/switch/result, skip, hidden tab, stale completion, effect cleanup and reduced motion.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => clearTimeout(completionDeadline));
