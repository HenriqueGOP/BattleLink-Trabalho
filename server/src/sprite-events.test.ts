import assert from "node:assert/strict";
import { BattleSession } from "./game/engine";
import type { BattleEvent, SideId, TeamSet } from "./game/engine";
import type { RNG, RngSeed } from "./game/engine/types";
import type { RoomSnapshot } from "./contracts/protocol";
import { AnimationDirector } from "../../client/src/lib/presentation/AnimationDirector";
import { applyPresentedEvent } from "../../client/src/lib/presentation/BattleEventQueue";
import { isChargingMove } from "../../client/src/lib/presentation/spriteRegistry";
import { IMPACT } from "../../client/src/lib/presentation/impact";

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
  static created: Node[] = [];
  static animated: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] =
    [];
  parent: Node | null = null;
  children = new Set<Node>();
  selectors = new Map<string, Node>();
  className = "";
  textContent = "";
  style: Record<string, string> = {};
  setAttribute() {}
  appendChild(node: Node) {
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
    Node.animated.push({ frames, options });
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
