import type { Battle, Pokemon } from "@pkmn/sim";
import { toID } from "@pkmn/sim";
import type { BattleEvent, BattleEventData, BattleResult, CombatantId, SideId } from "../battle-types";
import { BattleRuleError } from "../battle-types";
import { immutable } from "../immutable";
import { BOOST_IDS } from "../types";
import { fieldState, owner, pokemonId, publicPokemon, statusOf } from "./battle-state";

const ignored = new Set(["", "t:", "player", "teamsize", "gametype", "gen", "tier", "rule", "clearpoke", "poke", "teampreview", "upkeep", "-hint", "hint", "debug", "-message", "message", "-center", "-combine", "-waiting", "-anim"]);
const effects = new Set([
  "-start", "-end", "-singleturn", "-singlemove", "-activate", "-prepare", "-mustrecharge",
  "-fail", "-block", "-notarget", "-sidestart", "-sideend", "-fieldstart", "-fieldend", "-fieldactivate",
  "-cureteam", "-ohko", "-nothing", "-hitcount", "-swapboost", "-copyboost", "-clearboost",
  "-clearallboost", "-clearpositiveboost", "-clearnegativeboost", "-invertboost", "-setboost",
  "-candynamax", "-supereffective", "-resisted", "-immune", "-crit",
]);

/** Traduz somente tokens conhecidos; nunca publica texto/protocolo bruto upstream. */
export class EventRecorder {
  readonly revealed = new Set<CombatantId>();
  private readonly records: BattleEvent[] = [];
  private cursor = 0;
  private depth = 0;
  private sequence = 0;
  private readonly hp = new Map<CombatantId, number>();
  private readonly boosts = new Map<CombatantId, Record<string, number>>();
  private readonly active: Record<SideId, CombatantId | null> = { p1: null, p2: null };
  private endReason: BattleResult["reason"] = "knockout";
  result: BattleResult | null = null;

  constructor(private readonly battle: Battle) {
    battle.log.length = 0;
    const add = battle.add.bind(battle);
    battle.add = (...parts) => {
      this.depth++;
      try { add(...parts); } finally { if (--this.depth === 0) this.flush(); }
    };
    const addMove = battle.addMove.bind(battle);
    battle.addMove = (...parts) => { addMove(...parts); this.flush(); };
  }

  get lastSequence(): number { return this.sequence; }
  events(side: SideId, after = 0): readonly BattleEvent[] {
    return Object.freeze(this.records.filter(event => event.sequence > after && (event.audience === "public" || event.audience === side)));
  }
  setEndReason(reason: BattleResult["reason"]): void { this.endReason = reason; }
  emit(data: BattleEventData, audience: "public" | SideId = "public"): void {
    this.records.push(immutable({ ...data, sequence: ++this.sequence, round: this.battle.turn, audience }));
  }
  sync(): void {
    this.flush();
    this.changedBoosts();
    this.emit({ type: "state_sync", active: this.battle.getAllActive().map(publicPokemon), ...fieldState(this.battle) });
  }

  private pokemon(token: string | undefined): Pokemon | undefined {
    const name = token?.match(/^p[12][a-z]?: (p[12]s[0-5])$/)?.[1];
    if (!name) return undefined;
    return this.battle.sides.flatMap(side => side?.pokemon ?? []).find(pokemon => pokemon.name === name);
  }
  private audience(pokemon: Pokemon): "public" | SideId {
    const id = pokemonId(pokemon);
    return pokemon.isActive || this.revealed.has(id) ? "public" : owner(id);
  }
  private effect(token: string | undefined): string | null {
    if (!token) return null;
    const id = toID(token.replace(/^\[from\] /, "").replace(/^(move|ability|item): /, ""));
    return this.battle.dex.moves.get(id).exists || this.battle.dex.conditions.get(id).exists || ["recoil", "drain", "confusion", "recharge", "flinch", "nopp", "trapped", "notarget", "perish0", "perish1", "perish2", "perish3"].includes(id) ? id : null;
  }
  private changedBoosts(): void {
    for (const pokemon of this.battle.getAllActive()) {
      const id = pokemonId(pokemon);
      const previous = this.boosts.get(id) ?? {};
      for (const stat of BOOST_IDS) {
        const before = previous[stat] ?? 0;
        const after = pokemon.boosts[stat];
        if (before !== after) this.emit({ type: "boost", target: id, stat, before, after });
      }
      this.boosts.set(id, { ...pokemon.boosts });
    }
  }
  flush(): void {
    if (this.depth) return;
    while (this.cursor < this.battle.log.length) {
      const line = this.battle.log[this.cursor];
      if (line.startsWith("|split|")) {
        if (this.cursor + 2 >= this.battle.log.length) return;
        this.consume(this.battle.log[this.cursor + 1]);
        this.cursor += 3; // HP exato; a cópia percentual não é um segundo hit.
      } else {
        this.consume(line);
        this.cursor++;
      }
    }
  }
  private consume(line: string): void {
    const [, op = "", ...parts] = line.split("|");
    if (ignored.has(op)) return;
    if (op === "-sethp" && this.pokemon(parts[2])) {
      this.consume(`|-sethp|${parts[0]}|${parts[1]}`);
      this.consume(`|-sethp|${parts[2]}|${parts[3]}`);
      return;
    }
    const pokemon = this.pokemon(parts[0]);
    const id = pokemon && pokemonId(pokemon);
    if (op === "start") { this.emit({ type: "battle_start" }); return; }
    if (op === "turn") { this.emit({ type: "round_start", number: Number(parts[0]) }); return; }
    if (op === "win" || op === "tie") {
      const winner = op === "tie" ? null : parts[0] === "p1" ? "p1" : parts[0] === "p2" ? "p2" : undefined;
      if (winner === undefined) throw new BattleRuleError("ENGINE_CONTRACT", "Vencedor desconhecido.");
      this.result = immutable({ winner, reason: winner ? this.endReason : "draw" });
      this.emit({ type: "battle_end", result: this.result }); return;
    }
    if (op === "move" && id) {
      const move = this.battle.dex.moves.get(parts[1]);
      if (!move.exists) throw new BattleRuleError("ENGINE_CONTRACT", "Golpe desconhecido no evento.");
      const target = this.pokemon(parts[2]);
      this.emit({ type: "move", actor: id, target: target ? pokemonId(target) : null, moveId: move.id }); return;
    }
    if ((op === "switch" || op === "drag" || op === "replace") && pokemon && id) {
      const side = owner(id);
      this.revealed.add(id);
      this.emit({ type: "switch", target: id, previous: this.active[side], forced: op === "drag", pokemon: publicPokemon(pokemon) });
      this.active[side] = id;
      this.hp.set(id, pokemon.hp);
      this.boosts.set(id, { ...pokemon.boosts }); return;
    }
    if ((op === "-damage" || op === "-heal" || op === "-sethp") && pokemon && id) {
      const before = this.hp.get(id) ?? pokemon.maxhp;
      const after = Number(parts[1]?.match(/^\d+/)?.[0]);
      if (!Number.isInteger(after) || after < 0 || after > pokemon.maxhp) throw new BattleRuleError("ENGINE_CONTRACT", "HP inválido no evento.");
      const sourceToken = parts.find(part => part.startsWith("[of] "))?.slice(5);
      const cause = parts.find(part => part.startsWith("[from] "));
      // O activePokemon pode ser da última ação, mesmo durante dano residual.
      const source = this.pokemon(sourceToken) ?? (cause ? null : this.battle.activePokemon);
      this.emit({ type: after < before ? "damage" : "heal", target: id, hpBefore: before, hpAfter: after,
        maxHp: pokemon.maxhp, amount: Math.abs(after - before), source: source ? pokemonId(source) : null,
        cause: this.effect(cause) ?? this.battle.activeMove?.id ?? null }, this.audience(pokemon));
      this.hp.set(id, after); return;
    }
    if ((op === "-status" || op === "-curestatus") && pokemon && id) {
      this.emit({ type: "status", target: id, status: op === "-curestatus" ? null : statusOf(pokemon) }, this.audience(pokemon)); return;
    }
    if ((op === "-boost" || op === "-unboost") && id) { this.changedBoosts(); return; }
    if (op === "cant" && id) { this.emit({ type: "unable", actor: id, reason: this.effect(parts[1]) ?? "failed" }); return; }
    if (op === "-miss" && id) { const target = this.pokemon(parts[1]); this.emit({ type: "miss", actor: id, target: target ? pokemonId(target) : null }); return; }
    if (op === "faint" && id) { this.hp.set(id, 0); this.emit({ type: "faint", target: id }); return; }
    if (id && ["-crit", "-supereffective", "-resisted", "-immune"].includes(op)) {
      const type = op === "-crit" ? "critical" : op === "-supereffective" ? "super_effective" : op === "-resisted" ? "resisted" : "immune";
      this.emit({ type, target: id }); return;
    }
    if (op === "-hitcount" && id) { this.emit({ type: "hit_count", target: id, hits: Number(parts[1]) }); return; }
    if (effects.has(op)) {
      this.changedBoosts();
      const side = id ? owner(id) : parts[0]?.startsWith("p1:") ? "p1" : parts[0]?.startsWith("p2:") ? "p2" : null;
      this.emit({ type: "effect", operation: op.slice(1), target: id ?? null, side,
        effectId: this.effect(parts[1]) ?? this.effect(parts[0]) }, pokemon ? this.audience(pokemon) : "public"); return;
    }
    throw new BattleRuleError("ENGINE_CONTRACT", `Evento upstream não mapeado: ${op}`);
  }
}
