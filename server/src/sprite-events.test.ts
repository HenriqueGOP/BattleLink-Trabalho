import assert from "node:assert/strict";
import { BattleSession } from "./game/engine";
import type { BattleEvent, SideId, TeamSet } from "./game/engine";
import type { RNG, RngSeed } from "./game/engine/types";
import type { RoomSnapshot } from "./contracts/protocol";
import { AnimationDirector } from "../../client/src/lib/presentation/AnimationDirector";
import { applyPresentedEvent } from "../../client/src/lib/presentation/BattleEventQueue";
import { isChargingMove } from "../../client/src/lib/presentation/spriteRegistry";
import { IMPACT } from "../../client/src/lib/presentation/impact";
import { SCENE_LAYOUT } from "../../client/src/lib/presentation/sceneLayout";
import {
  actionVector,
  moveProfile,
} from "../../client/src/lib/presentation/moveProfiles";
import { motionProfile } from "../../client/src/lib/presentation/motionProfiles";
import {
  emissionClip,
  projectileMove,
} from "../../client/src/lib/presentation/spriteRegistry";
import {
  reducedMotion,
  setMotionPreference,
  getMotionPreference,
  subscribeMotionPreference,
  MOTION_PREFERENCE_KEY,
  syncMotionPreferenceRoot,
} from "../../client/src/lib/presentation/motionPreference";

function profileTests() {
  const { trainer, opponent } = SCENE_LAYOUT;
  assert.ok(trainer.x > opponent.x && trainer.x < 90,
    "Treinador fica ao lado do adversário, com margem na arena");
  assert.ok(Math.abs(trainer.y - opponent.y) <= 5,
    "Pés do treinador ficam próximos ao piso do Pokémon");
  assert.ok(Math.hypot(trainer.x - opponent.x, trainer.y - opponent.y) < 20,
    "Treinador permanece próximo ao Pokémon adversário");
  for (const [id, family] of [
    ["tackle", "contact"],
    ["slash", "slash"],
    ["bulletseed", "projectile"],
    ["shadowball", "projectile"],
    ["flamethrower", "beam"],
    ["icebeam", "beam"],
    ["hypervoice", "wave"],
    ["psychicnoise", "wave"],
    ["surf", "area"],
    ["earthquake", "area"],
    ["spore", "powder"],
    ["sleeppowder", "powder"],
    ["calmmind", "status"],
    ["protect", "status"],
    ["waterfall", "contact"],
  ] as const) {
    const profile = moveProfile(id);
    assert.equal(
      profile?.family,
      family,
      `${id}: família artística específica`,
    );
    assert.ok(profile && profile.anticipation > 0 && profile.recovery > 0);
  }
  assert.equal(
    projectileMove("hypervoice"),
    false,
    "Golpe especial de onda não é um orb",
  );
  assert.equal(
    projectileMove("flamethrower"),
    false,
    "Feixe usa geometria distinta do orb",
  );
  assert.equal(projectileMove("shadowball"), true);
  assert.equal(moveProfile("flamethrower")?.specialMove, true);
  assert.equal(moveProfile("airslash")?.specialMove, true);
  assert.equal(moveProfile("tackle")?.specialMove, false);
  assert.equal(
    emissionClip("calmmind"),
    "psychic",
    "Status também prepara/emite sem antecipar sua aplicação",
  );
  assert.equal(emissionClip("willowisp"), "fire");
  for (const id of [
    "https://evil.test/a",
    "../beam",
    "__proto__",
    "constructor",
    "unknown",
  ]) {
    assert.equal(moveProfile(id), null);
    assert.equal(emissionClip(id), null);
  }
  const a = { left: 0, top: 180, width: 100, height: 100 };
  const b = { left: 300, top: 20, width: 100, height: 100 };
  const vector = actionVector(a, b, 1);
  assert.ok(
    vector.x > 0 && vector.y < 0,
    "Aproximação percorre a diagonal real",
  );
  assert.ok(Math.hypot(vector.x, vector.y) <= 82);
  assert.ok(Math.abs(vector.y) <= 22);
  const reverse = actionVector(b, a, -1);
  assert.equal(reverse.x, -vector.x);
  assert.equal(reverse.y, -vector.y);
  assert.deepEqual(actionVector(a, a, 1), { x: 0, y: 0 });
  assert.deepEqual(actionVector(null, null, -1), { x: -34, y: -10 });
  assert.equal(motionProfile("snorlax"), "heavy");
  assert.equal(motionProfile("haunter"), "floating");
  assert.equal(motionProfile("butterfree"), "flying");
  assert.equal(motionProfile("arbok"), "low");
  assert.equal(motionProfile("unknown"), "light");
}

function preferenceTests() {
  const original = globalThis.window;
  const saved = new Map<string, string>();
  const events = new Map<string, EventListener>();
  const mediaEvents = new Set<() => void>();
  let matches = true,
    changes = 0;
  try {
    globalThis.window = {
      localStorage: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
      },
      matchMedia: () => ({
        matches,
        addEventListener: (_: string, listener: () => void) =>
          mediaEvents.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          mediaEvents.delete(listener),
      }),
      addEventListener: (name: string, listener: EventListener) =>
        events.set(name, listener),
      removeEventListener: (name: string) => events.delete(name),
    } as unknown as Window & typeof globalThis;
    setMotionPreference("system");
    assert.equal(getMotionPreference(), "system");
    assert.equal(reducedMotion(), true);
    const unsubscribe = subscribeMotionPreference(() => changes++);
    setMotionPreference("full");
    assert.equal(
      reducedMotion(),
      false,
      "Preferência explícita completa supera a preferência do sistema",
    );
    assert.equal(saved.get(MOTION_PREFERENCE_KEY), "full");
    const root = { dataset: {} as DOMStringMap };
    const restore = syncMotionPreferenceRoot(root, getMotionPreference());
    assert.equal(
      root.dataset.motionPreference,
      "full",
      "CSS recebe a escolha Completo mesmo com redução de movimento do sistema",
    );
    restore();
    assert.equal(
      root.dataset.motionPreference,
      undefined,
      "Desmontagem limpa o marcador global que o hook adicionou",
    );
    root.dataset.motionPreference = "system";
    const restoreExisting = syncMotionPreferenceRoot(root, "reduced");
    assert.equal(root.dataset.motionPreference, "reduced");
    restoreExisting();
    assert.equal(root.dataset.motionPreference, "system");
    setMotionPreference("reduced");
    assert.equal(reducedMotion(), true);
    saved.set(MOTION_PREFERENCE_KEY, "system");
    events.get("storage")?.({ key: MOTION_PREFERENCE_KEY } as unknown as Event);
    assert.equal(
      getMotionPreference(),
      "system",
      "Outra aba sincroniza a preferência",
    );
    matches = false;
    for (const listener of mediaEvents) listener();
    assert.equal(reducedMotion(), false);
    setMotionPreference("reduced");
    assert.equal(
      reducedMotion(),
      true,
      "Escolha Reduzido reduz movimento mesmo quando o sistema permite animações",
    );
    setMotionPreference("full");
    assert.equal(
      reducedMotion(),
      false,
      "Escolha Completo permite movimento quando o sistema também permite",
    );
    assert.ok(changes >= 4);
    unsubscribe();
    assert.equal(mediaEvents.size, 0);
    assert.equal(events.size, 0);
    setMotionPreference("system");
  } finally {
    globalThis.window = original;
  }
}

const SEED: RngSeed = [1, 2, 3, 4];
class FixedRng implements RNG {
  word = 0;
  nextUint32() {
    return this.word;
  }
  snapshot() {
    return { algorithm: "showdown-gen5" as const, seed: SEED };
  }
}
const set = (moves: readonly string[]): TeamSet => ({
  speciesId: "smeargle",
  moves,
});
function battle(left: readonly string[], right: readonly string[]) {
  return new BattleSession(
    { seed: SEED, teams: [[set(left)], [set(right)]] },
    { rng: new FixedRng() },
  );
}
function submit(session: BattleSession, side: SideId, moveId: string) {
  const request = session.getView(side).request;
  assert.ok(request);
  session.submit({
    side,
    requestId: request.id,
    actionId: `${side}_${request.id}`,
    choice: { type: "move", moveId },
  });
}
function round(
  session: BattleSession,
  left: string,
  right: string,
): readonly BattleEvent[] {
  const after = session.getView("p1").sequence;
  submit(session, "p1", left);
  submit(session, "p2", right);
  return session.getEvents("p1", after);
}
function snapshot(session: BattleSession): RoomSnapshot {
  const view = session.getView("p1");
  return {
    matchId: "match-fixture", format: { id: "classic" }, mode: "automatic", inviteCode: null, trainerId: null, difficulty: null, rematch: { expiresAt: null, votes: [false, false], available: false },
    roomId: "sprite-events-real-engine",
    phase: "battle",
    viewer: "p1",
    arena: "forest",
    players: [
      { id: "p1", name: "Alice", ready: true, teamCount: 1 },
      { id: "p2", name: "Bob", ready: true, teamCount: 1 },
    ],
    team: view.ownTeam.map((pokemon) => ({
      id: pokemon.id,
      speciesId: pokemon.speciesId,
      moves: pokemon.moves.map((move) => move.id),
      shiny: false,
    })),
    battle: view,
    events: session.getEvents("p1"),
    eventFloor: 0,
    sequence: view.sequence,
    revealedShiny: {},
    preparation: null,
    result: null,
    log: [],
  };
}

/** Assertions use native emitted tokens, including the absence of HP damage to a Substitute. */
function nativeTokenTests() {
  const protect = battle(["tackle"], ["protect"]);
  try {
    const events = round(protect, "tackle", "protect");
    assert.ok(
      events.some(
        (event) =>
          event.type === "effect" &&
          event.operation === "singleturn" &&
          event.effectId === "protect",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === "effect" &&
          event.operation === "activate" &&
          event.effectId === "protect",
      ),
    );
    assert.ok(!events.some((event) => event.type === "damage"));
  } finally {
    protect.destroy();
  }

  for (const [move, status] of [
    ["spore", "slp"],
    ["thunderwave", "par"],
  ] as const) {
    const session = battle([move], ["splash"]);
    try {
      const events = round(session, move, "splash");
      assert.ok(
        events.some(
          (event) => event.type === "status" && event.status === status,
        ),
        `${move}: status nativo ${status}`,
      );
      assert.ok(
        events.some(
          (event) => event.type === "unable" && event.reason === status,
        ),
        `${move}: cant usa reason ${status}`,
      );
    } finally {
      session.destroy();
    }
  }

  // Slower Ice Beam lands after the target acts; forcing the next round's RNG
  // high keeps it frozen instead of legitimately triggering an immediate thaw.
  const freezeRng = new FixedRng();
  const freeze = new BattleSession(
    {
      seed: SEED,
      teams: [[{ ...set(["icebeam", "splash"]), level: 1 }], [set(["splash"])]],
    },
    { rng: freezeRng },
  );
  try {
    const first = round(freeze, "icebeam", "splash");
    assert.ok(
      first.some((event) => event.type === "status" && event.status === "frz"),
    );
    freezeRng.word = 0xffffffff;
    assert.ok(
      round(freeze, "splash", "splash").some(
        (event) => event.type === "unable" && event.reason === "frz",
      ),
    );
  } finally {
    freeze.destroy();
  }

  const confusion = battle(["confuseray"], ["splash"]);
  try {
    const events = round(confusion, "confuseray", "splash");
    assert.ok(
      events.some(
        (event) =>
          event.type === "effect" &&
          event.operation === "start" &&
          event.effectId === "confusion",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === "effect" &&
          event.operation === "activate" &&
          event.effectId === "confusion",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === "damage" &&
          event.cause === "confusion" &&
          event.source === null,
      ),
    );
  } finally {
    confusion.destroy();
  }

  const recharge = battle(["hyperbeam"], ["splash"]);
  try {
    const first = round(recharge, "hyperbeam", "splash");
    assert.ok(
      first.some(
        (event) =>
          event.type === "effect" &&
          event.operation === "mustrecharge" &&
          event.effectId === null,
      ),
    );
    assert.equal(recharge.getView("p1").request?.lockedMoveId, "recharge");
    const second = round(recharge, "recharge", "splash");
    assert.ok(
      second.some(
        (event) => event.type === "unable" && event.reason === "recharge",
      ),
    );
  } finally {
    recharge.destroy();
  }
}

class Node {
  static placements: { parent: Node; node: Node }[] = [];
  static created: Node[] = [];
  static animated: {
    element: Node;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
  }[] = [];
  parent: Node | null = null;
  children = new Set<Node>();
  selectors = new Map<string, Node>();
  className = "";
  textContent = "";
  style: Record<string, string> = {};
  setAttribute() {}
  appendChild(node: Node) {
    Node.placements.push({ parent: this, node });
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
    Node.animated.push({ element: this, frames, options });
    return {
      finished: Promise.resolve(),
      playState: "finished",
      pause() {},
      play() {},
      cancel() {},
    } as unknown as Animation;
  }
}

async function directorTests() {
  const originalDocument = globalThis.document,
    originalWindow = globalThis.window,
    originalImage = globalThis.Image,
    originalTimeout = globalThis.setTimeout;
  const waits: number[] = [];
  try {
    globalThis.document = {
      createElement: () => {
        const node = new Node();
        Node.created.push(node);
        return node;
      },
    } as unknown as Document;
    globalThis.window = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window & typeof globalThis;
    // Canvas frame/cancellation/asset behavior is covered by sprite-animation.test.
    // This suite isolates semantic event-to-presentation mapping through the actual director.
    globalThis.Image = undefined as unknown as typeof Image;
    globalThis.setTimeout = ((
      callback: (...args: unknown[]) => void,
      ms?: number,
      ...args: unknown[]
    ) => {
      waits.push(ms ?? 0);
      return originalTimeout(callback, 0, ...args);
    }) as typeof setTimeout;
    const stage = new Node(),
      me = new Node(),
      foe = new Node(),
      hud = new Node();
    stage.selectors.set('[data-hud-side="opponent"]', hud);
    hud.selectors.set("[data-hp-fill]", new Node());
    hud.selectors.set("[data-hp-ghost]", new Node());
    const myBody = new Node(),
      foeBody = new Node();
    me.selectors.set("[data-motion-action]", myBody);
    foe.selectors.set("[data-motion-action]", foeBody);
    const gestureBattle = battle(["spore", "calmmind"], ["splash"]);
    const gestureDirector = new AnimationDirector({
      stage: () => stage as unknown as HTMLElement,
      sprite: (side) => (side === "me" ? me : foe) as unknown as HTMLElement,
      reducedMotion: () => false,
    });
    try {
      const wire = snapshot(gestureBattle);
      let commits = 0;
      const originalWire = JSON.stringify(wire);
      const before = Node.animated.length;
      let requestedAtlases = 0;
      globalThis.Image = class {
        onerror: (() => void) | null = null;
        constructor() { requestedAtlases++; }
        set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
      } as unknown as typeof Image;
      await gestureDirector.run(
        {
          type: "move",
          actor: "p1s0",
          target: "p2s0",
          moveId: "spore",
          round: 1,
          sequence: 20,
          audience: "public",
        },
        wire,
        new AbortController().signal,
        () => commits++,
      );
      assert.equal(commits, 1);
      assert.equal(requestedAtlases, 0, 'move não inicia atlas antes de um resultado confirmado');
      assert.ok(
        Node.animated.slice(before).some((entry) => entry.element === myBody),
      );
      assert.ok(
        Node.animated.slice(before).every((entry) => entry.element !== foeBody),
        "Emissão não antecipa reação ao status",
      );
      const semanticEvents = [
        { type: 'miss', actor: 'p1s0', target: 'p2s0' },
        { type: 'immune', target: 'p2s0' },
        { type: 'hit_count', target: 'p2s0', hits: 4 },
      ] as const;
      for (const [index, event] of semanticEvents.entries()) {
        const animationsBefore = Node.animated.length;
        const placementsBefore = Node.placements.length;
        await gestureDirector.run({ ...event, round: 1, sequence: 30 + index, audience: 'public' }, wire,
          new AbortController().signal, () => {});
        assert.equal(requestedAtlases, 0, `${event.type} não inventa impacto, esquiva ou proteção`);
        assert.ok(Node.animated.slice(animationsBefore).every(entry => entry.element !== myBody && entry.element !== foeBody));
        const labels = Node.placements.slice(placementsBefore);
        assert.equal(labels.length, 1);
        assert.equal(labels[0].parent, event.type === 'miss' ? me : foe);
        assert.equal(labels[0].node.textContent, ['ERROU!', 'NÃO AFETA!', '4 acertos'][index]);
        assert.equal(labels[0].node.parent, null, 'Texto transitório é removido');
      }
      for (const actor of ['p1s0', 'p2s0'] as const) {
        for (const moveId of ['flamethrower', 'airslash', 'psychic']) {
          const animationsBefore = Node.animated.length;
          await gestureDirector.run({ type: 'move', actor,
            target: actor === 'p1s0' ? 'p2s0' : 'p1s0', moveId,
            round: 1, sequence: 40, audience: 'public' }, wire,
            new AbortController().signal, () => {});
          const gestures = Node.animated.slice(animationsBefore);
          assert.equal(gestures.length, 1, 'Especial tem um gesto corporal finito');
          assert.equal(gestures[0].element, actor === 'p1s0' ? myBody : foeBody,
            'Somente o corpo do atacante recebe o gesto, nos dois lados');
          assert.ok(gestures[0].frames.some(frame => String(frame.transform).includes('scale(1.06)')),
            'Especial prepara e libera energia, inclusive quando sua família é corte');
          assert.equal(gestures[0].frames[0].transform, gestures[0].frames.at(-1)!.transform,
            'Gesto retorna ao ponto inicial');
          assert.equal(gestures[0].options.fill, 'none', 'Não deixa transformações persistentes');
          assert.equal(requestedAtlases, 0, 'Execução especial não antecipa impacto no alvo');
        }
      }
      const reducedDirector = new AnimationDirector({ stage: () => stage as unknown as HTMLElement,
        sprite: side => (side === 'me' ? me : foe) as unknown as HTMLElement,
        reducedMotion: () => true });
      const reducedBefore = Node.animated.length;
      await reducedDirector.run({ type: 'move', actor: 'p1s0', target: 'p2s0',
        moveId: 'flamethrower', round: 1, sequence: 41, audience: 'public' }, wire,
        new AbortController().signal, () => {});
      reducedDirector.dispose();
      assert.equal(Node.animated.length, reducedBefore, 'Preferência reduzida desativa o gesto especial');
      globalThis.Image = undefined as unknown as typeof Image;
      const applied = Node.animated.length;
      await gestureDirector.run(
        {
          type: "status",
          target: "p2s0",
          status: "slp",
          round: 1,
          sequence: 21,
          audience: "public",
        },
        wire,
        new AbortController().signal,
        () => commits++,
      );
      assert.equal(commits, 2);
      assert.ok(
        Node.animated.slice(applied).some((entry) => entry.element === foeBody),
      );
      assert.ok(
        Node.animated.slice(applied).every((entry) => entry.element !== foe),
        "Corpo interno recebe a pose; âncora externa permanece estável",
      );
      assert.equal(
        JSON.stringify(wire),
        originalWire,
        "Diretor não modifica snapshot privado ou público",
      );
    } finally {
      gestureDirector.dispose();
      gestureBattle.destroy();
    }
    // Physical release movement is exercised in the browser. A null actor allows
    // running every native turn event without replacing or mocking GSAP internals.
    const director = new AnimationDirector({
      stage: () => stage as unknown as HTMLElement,
      sprite: (side) =>
        side === "opponent" ? (foe as unknown as HTMLElement) : null,
    });
    try {
      const shield = battle(
        ["willowisp", "leafblade"],
        ["substitute", "splash"],
      );
      try {
        round(shield, "willowisp", "substitute");
        let presented = snapshot(shield);
        const events = round(shield, "leafblade", "splash");
        const critIndex = events.findIndex(
          (event) => event.type === "critical",
        );
        const endIndex = events.findIndex(
          (event) =>
            event.type === "effect" &&
            event.operation === "end" &&
            event.effectId === "substitute",
        );
        const residual = events.find(
          (event) => event.type === "damage" && event.cause === "brn",
        );
        assert.ok(residual?.type === "damage");
        assert.ok(critIndex >= 0 && endIndex > critIndex);
        assert.ok(
          !events.some(
            (event) => event.type === "damage" && event.cause === "leafblade",
          ),
          "Crítico atingiu Substitute, sem subtrair HP do Pokémon",
        );
        assert.equal(residual.source, null);
        const labelsBefore = Node.created.length,
          waitsBefore = waits.length;
        for (let index = 0; index < events.length; index++) {
          const event = events[index];
          const before = presented;
          let commits = 0;
          await director.run(
            event,
            presented,
            new AbortController().signal,
            () => {
              commits++;
              presented = applyPresentedEvent(presented, event);
            },
            events[index + 1],
          );
          assert.equal(commits, 1, `${event.type} confirma exatamente uma vez`);
          if (event.type === "damage") {
            assert.notEqual(before.battle, presented.battle);
            const pokemon = presented.battle!.opponentTeam.find(
              (member) => member.id === event.target,
            );
            assert.ok(pokemon && !("hidden" in pokemon));
            assert.equal(pokemon.hp, event.hpAfter);
          }
        }
        const numbers = Node.created
          .slice(labelsBefore)
          .filter((node) =>
            node.className.startsWith("battle-float battle-float-"),
          );
        assert.deepEqual(
          numbers.map((node) => node.textContent),
          [`−${residual.amount}`],
          "Dano residual não herda o crítico absorvido pelo Substitute",
        );
        assert.deepEqual(
          waits.slice(waitsBefore),
          [IMPACT.hitStop],
          "Queimadura mantém hit-stop comum",
        );
        assert.equal(foe.children.size, 0);
      } finally {
        shield.destroy();
      }

      const direct = battle(["leafblade"], ["splash"]);
      try {
        let wire = snapshot(direct);
        const events = round(direct, "leafblade", "splash");
        const damage = events.find((event) => event.type === "damage");
        assert.ok(damage?.type === "damage");
        assert.ok(events.some((event) => event.type === "critical"));
        const labelsBefore = Node.created.length,
          waitsBefore = waits.length;
        for (let index = 0; index < events.length; index++) {
          await director.run(
            events[index],
            wire,
            new AbortController().signal,
            () => {
              wire = applyPresentedEvent(wire, events[index]);
            },
            events[index + 1],
          );
        }
        assert.deepEqual(
          Node.created
            .slice(labelsBefore)
            .filter((node) => node.className.includes("battle-float-critical"))
            .map((node) => node.textContent),
          [`−${damage.amount} CRÍTICO!`],
          "Crítico direto continua apresentado uma única vez",
        );
        assert.deepEqual(waits.slice(waitsBefore), [IMPACT.criticalHitStop]);
      } finally {
        direct.destroy();
      }
    } finally {
      director.dispose();
    }

    const charging = battle(["solarblade"], ["splash"]);
    const chargingDirector = new AnimationDirector({
      stage: () => stage as unknown as HTMLElement,
      sprite: (side) => (side === "me" ? me : foe) as unknown as HTMLElement,
    });
    try {
      const wire = snapshot(charging);
      const first = round(charging, "solarblade", "splash");
      const index = first.findIndex(
        (event) => event.type === "move" && event.moveId === "solarblade",
      );
      const move = first[index];
      assert.ok(move?.type === "move");
      const prepare = first[index + 1];
      assert.ok(
        prepare?.type === "effect" &&
          prepare.operation === "prepare" &&
          prepare.effectId === "solarblade",
      );
      assert.equal(isChargingMove(move, prepare), true);
      assert.ok(!first.some((event) => event.type === "damage"));
      const animationsBefore = Node.animated.length;
      let committed = 0;
      await chargingDirector.run(
        move,
        wire,
        new AbortController().signal,
        () => committed++,
        prepare,
      );
      assert.equal(committed, 1);
      assert.equal(
        Node.animated.length,
        animationsBefore,
        "Carga não executa investida ofensiva",
      );
      await chargingDirector.run(
        prepare,
        wire,
        new AbortController().signal,
        () => {},
      );
      assert.ok(Node.created.some((node) => node.textContent === "CARREGANDO"));
      const second = round(charging, "solarblade", "splash");
      const releasedIndex = second.findIndex(
        (event) => event.type === "move" && event.moveId === "solarblade",
      );
      const released = second[releasedIndex];
      assert.ok(released?.type === "move");
      assert.equal(isChargingMove(released, second[releasedIndex + 1]), false);
      assert.ok(
        second.some(
          (event) => event.type === "damage" && event.cause === "solarblade",
        ),
        "Liberação tem dano canônico e não é confundida com carga",
      );
    } finally {
      chargingDirector.dispose();
      charging.destroy();
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.Image = originalImage;
    globalThis.setTimeout = originalTimeout;
  }
}

async function run() {
  profileTests();
  preferenceTests();
  nativeTokenTests();
  await directorTests();
  console.log(
    "Sprite event tests passed: native status/reason/effectId, Protect, confusion, recharge, charge/release and critical Substitute vs burn/direct damage.",
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
