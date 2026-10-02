import { BattleSession } from "./adapters/battle-session";
import type { BattleSetup, ChoiceSubmission, EngineOptions } from "./battle-types";

export { BattleSession } from "./adapters/battle-session";
export { getMove, listMoves } from "./adapters/move-registry";
export { BattleRuleError } from "./battle-types";
export type * from "./battle-types";

/** Fachada pura para replay/testes: entrada imutável, resultado imutável, sem I/O. */
export function replayBattle(setup: BattleSetup, actions: readonly ChoiceSubmission[], options: Pick<EngineOptions, "additionalMoves"> = {}) {
  const session = new BattleSession(setup, { additionalMoves: options.additionalMoves });
  try {
    for (const action of actions) session.submit(action);
    return Object.freeze({
      p1: session.getView("p1"), p2: session.getView("p2"),
      events: Object.freeze({ p1: session.getEvents("p1"), p2: session.getEvents("p2") }),
    });
  } finally { session.destroy(); }
}
