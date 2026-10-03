// server/src/game/showdown-moves.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Importa o dataset público do Pokémon Showdown (moves.json) e extrai APENAS
 * os efeitos que o nosso motor já processa. Golpes com mecânicas não
 * implementadas (hazards, protect, taunt, charge moves, selfSwitch etc.)
 * são carregados com metadados mínimos e marcados como suporte parcial.
 */

interface ShowdownMove {
  num: number;
  name?: string;
  accuracy: number | true;
  basePower: number;
  category: "Physical" | "Special" | "Status";
  type: string;
  pp: number;
  priority?: number;
  desc?: string;
  shortDesc?: string;
  multihit?: number | [number, number];
  drain?: [number, number];
  recoil?: [number, number];
heal?: [number, number] | number;          // ⬅ no JSON do Showdown o campo é "heal", não "healing"!
  ohko?: boolean;                            // Fissure, Sheer Cold…
  status?: "brn" | "par" | "slp" | "frz" | "psn" | "tox";
  volatileStatus?: string; // ex: "confusion", "flinch", "partiallytrapped"
  boosts?: Record<string, number>;
  secondary?: { chance?: number; status?: string; volatileStatus?: string; boosts?: Record<string, number>; self?: { boosts?: Record<string, number> } };
  self?: { boosts?: Record<string, number>; volatileStatus?: string };
  flags?: Record<string, number>;
  target?: string;
  critRatio?: number;
  isNonstandard?: string;
}

export interface ImportedMove {
  name: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  type: string;
  category: string | null;
    target: string | null;
  ohko: boolean;
  priority: number;
  critRate: number;
  minHits: number | null;
  maxHits: number | null;
  drain: number;
  flinchChance: number;
  healing: number;
  cureStatus: boolean;
  selfSleepTurns: number;
  statChance: number;
  ailment?: string;
  ailmentChance?: number;
  statChanges?: Array<{ stat: string; change: number }>;
  selfStatChanges?: Array<{ stat: string; change: number }>;
  description: string;
  // marcar o que o motor ainda não roda (pra UI avisar "suportado parcialmente")
  unsupported: string[];
}

const STATUS_MAP: Record<string, string> = {
  brn: "burn", par: "paralysis", slp: "sleep", frz: "freeze",
  psn: "poison", tox: "bad_poison",
};

const VOLATILE_MAP: Record<string, string> = {
  confusion: "confusion",
  flinch: "flinch", // tratado como flinched=true no alvo
  attract: "attract",
  disable: "disable",
  torment: "torment",
  encore: "encore",
  leechseed: "leech_seed",
};

// Mapear keys do Showdown (atk, def, spa, spd, spe, accuracy, evasion)
// para as keys internas do motor
const STAT_KEY_MAP: Record<string, string> = {
  atk: "attack", def: "defense", spa: "specialAttack", spd: "specialDefense",
  spe: "speed", accuracy: "accuracy", evasion: "evasion",
};

function convertStatKey(showdownKey: string): string {
  return STAT_KEY_MAP[showdownKey] ?? showdownKey;
}

let cached: Map<string, ImportedMove> | null = null;

/**
 * Resolve data/moves.json a partir DESTE arquivo, nunca de process.cwd().
 * Antes o caminho era join(process.cwd(), "..", "data", ...), o que so
 * funcionava com o shell dentro de server/: `npm start --prefix server`
 * (comando do proprio README) apontava para fora do repositorio.
 *
 * __dirname vale server/src/game (tsx) ou server/dist/game (compilado) —
 * os dois sobem tres niveis ate a raiz do repositorio.
 */
function resolveMovesPath(): string {
  const candidates = [
    join(__dirname, "..", "..", "..", "data", "moves.json"), // src/game e dist/game
    join(process.cwd(), "data", "moves.json"), // rodando da raiz
    join(process.cwd(), "..", "data", "moves.json"), // rodando de server/
  ];
  const found = candidates.find(existsSync);
  if (!found) {
    throw new Error(
      `Nao encontrei data/moves.json. Procurei em:\n  ${candidates.join("\n  ")}\n` +
        "Confirme que a pasta data/ esta na raiz do repositorio.",
    );
  }
  return found;
}

function loadMoves(): Map<string, ImportedMove> {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(resolveMovesPath(), "utf8")) as Record<string, ShowdownMove>;
  const out = new Map<string, ImportedMove>();
  for (const [id, move] of Object.entries(raw)) {
    const unsupported: string[] = [];
    const secondary = move.secondary;
    const healArray = move.heal; // nome correto no JSON

    // healing: Showdown usa [num, den] (ex: [1,2] = 50%)
    let healing = 0;
    if (Array.isArray(healArray)) healing = Math.round((healArray[0] / healArray[1]) * 100);
    else if (typeof healArray === "number") healing = healArray * 100; // raro
    // Estes efeitos usam callbacks no Showdown; o JSON não contém a implementação.
    const cureStatus = ["rest", "junglehealing", "lunarblessing", "healbell", "aromatherapy"].includes(id);
    const selfSleepTurns = id === "rest" ? 2 : 0;
    if (id === "rest") healing = 100;
    if (["junglehealing", "lunarblessing", "lifedew"].includes(id)) healing = 25;
    if (id === "healpulse") healing = 50;

    // drain: [1,2] = 50%
    const drain = Array.isArray(move.drain) ? Math.round((move.drain[0] / move.drain[1]) * 100) : 0;

    // multi-hit
    let minHits: number | null = null;
    let maxHits: number | null = null;
    if (move.multihit !== undefined) {
      if (Array.isArray(move.multihit)) { [minHits, maxHits] = move.multihit; }
      else { minHits = move.multihit; maxHits = move.multihit; }
    }

    // status (principal) — só se category === "Status" e move.status existe
    const primaryStatus = move.status ? STATUS_MAP[move.status] : undefined;

    // secundário (chance < 100 é secundário; 100 é "efeito primário de golpe de dano")
    let statChance = 0;
    let ailment: string | undefined = primaryStatus;
    let ailmentChance: number | undefined = primaryStatus ? 100 : 0;
    let statChanges: Array<{ stat: string; change: number }> | undefined;
    let selfStatChanges: Array<{ stat: string; change: number }> | undefined;

    if (secondary) {
      if (secondary.chance !== undefined) statChance = secondary.chance;
      if (secondary.status) { ailment = STATUS_MAP[secondary.status]; ailmentChance = secondary.chance ?? 100; }
      else if (secondary.volatileStatus && VOLATILE_MAP[secondary.volatileStatus]) {
        ailment = VOLATILE_MAP[secondary.volatileStatus];
        ailmentChance = secondary.chance ?? 100;
      }
      if (secondary.boosts) {
        statChanges = Object.entries(secondary.boosts).map(([key, value]) => ({ stat: convertStatKey(key), change: value }));
      }
      if (secondary.self?.boosts) {
        selfStatChanges = Object.entries(secondary.self.boosts).map(([key, value]) => ({ stat: convertStatKey(key), change: value }));
      }
    }

        // ⬅ NOVO: golpes de STATUS guardam o efeito primário na RAIZ do JSON
    // (Swords Dance → boosts; Confuse Ray → volatileStatus), não em "secondary"
    if (move.category === "Status") {
      if (move.boosts) {
        statChanges = Object.entries(move.boosts).map(([key, value]) => ({ stat: convertStatKey(key), change: value }));
        statChance = 100;
      }
      if (move.volatileStatus && VOLATILE_MAP[move.volatileStatus]) {
        ailment = VOLATILE_MAP[move.volatileStatus];
        ailmentChance = 100;
      }
    }

    // self stat changes (draco meteor etc. — self.boosts no nível raiz)
    if (move.self?.boosts) {
      selfStatChanges = Object.entries(move.self.boosts).map(([key, value]) => ({ stat: convertStatKey(key), change: value }));
    }

    // flinch: no Showdown é volatileStatus "flinch" dentro de secondary
    let flinchChance = 0;
    if (secondary?.volatileStatus === "flinch") flinchChance = secondary.chance ?? 100;

    // ---- mecânicas ainda NÃO suportadas pelo motor (flags para a UI) ----
    if (move.flags?.contact && secondary?.volatileStatus && secondary.volatileStatus !== "flinch" && secondary.volatileStatus !== "confusion") unsupported.push(secondary.volatileStatus);
    if (move.target && ["allySide", "allyTeam", "allies", "adjacentAlly"].includes(move.target)) unsupported.push("efeito na equipe reserva não implementado");
    if (["sunny-day", "rain-dance", "sandstorm", "snowscape", "hail", "electric-terrain", "grassy-terrain", "misty-terrain", "psychic-terrain"].includes(id)) unsupported.push("mudança de campo");
    if (["stealth-rock", "spikes", "toxic-spikes", "sticky-web", "rapid-spin", "defog"].includes(id)) unsupported.push("hazards");
    if (["taunt", "torment", "encore", "disable", "embargo", "imprison"].includes(id)) unsupported.push("bloqueio de golpe");
    if (["protect", "detect", "endure", "kingsshield", "spikyshield", "banefulbunker", "obstruct", "silktrap", "burningbulwark"].includes(id)) unsupported.push("proteção");
    if (["roar", "whirlwind", "circlethrow", "dragontail"].includes(id)) unsupported.push("forçar troca");
    if (["uturn", "voltswitch", "flipturn", "batonpass", "partingshot", "teleport"].includes(id)) unsupported.push("troca automática");
    if (["fly", "dig", "dive", "bounce", "phantomforce", "shadowforce", "skydrop", "solarbeam", "electroshot", "meteorbeam", "geomancy", "freezeshock", "iceburn", "charge", "skullbash"].includes(id)) unsupported.push("golpe de 2 turnos");
    if (["hyperbeam", "gigaimpact", "hydrocannon", "blastburn", "frenzyplant", "rockwrecker", "roaroftime", "spacialrend", "shadowforce", "meteorassault", "eternabeam", "prismaticlaser"].includes(id)) unsupported.push("recarrega no turno seguinte");
    if (["toxic-spikes", "leechseed", "curse", "ingrain", "aquaring", "substitute", "shedtail", "destinybond", "grudge", "perishsong", "magiccoat", "snatch", "magicroom", "wonderroom", "trickroom", "gravity", "magnetrise", "telekinesis", "electrify", "iondeluge", "healblock", "foresight", "miracleeye", "odorsleuth", "lockon", "mindreader", "psychup", "heartswap", "guardswap", "powerswap", "speedswap", "guardsplit", "powersplit", "transform", "reflecttype", "conversion", "conversion2", "camouflage", "trickortreat", "forestscurse", "soak", "magicpowder", "trick", "switcheroo", "bestow", "corrosivegas", "fling", "gastroacid", "simplebeam", "worryseed", "entrainment", "skillswap", "roleplay", "powertrick", "snatch", "recycle", "belch", "magicroom"].includes(id)) unsupported.push("efeito especial");
    if (move.volatileStatus && VOLATILE_MAP[move.volatileStatus] === undefined && move.volatileStatus !== undefined) unsupported.push(move.volatileStatus);
    if (["splash", "celebrate", "holdhands", "happyhour"].includes(id)) unsupported.push("sem efeito");

    out.set(id, {
      name: move.name ?? id,
      power: move.basePower > 0 ? move.basePower : null,
      accuracy: move.accuracy === true ? 100 : move.accuracy,
      pp: move.pp,
      type: move.type.toLowerCase(),
      category: move.category.toLowerCase(),
      target: move.target ?? null,
      priority: move.priority ?? 0,
      critRate: move.critRatio ?? 0,
      ohko: move.ohko === true,
      minHits, maxHits,
      drain,
      flinchChance,
      healing,
      cureStatus,
      selfSleepTurns,
      statChance,
      ailment,
      ailmentChance: ailmentChance ?? 0,
      statChanges,
      selfStatChanges,
      description: move.shortDesc ?? move.desc ?? "Sem descrição.",
      unsupported: [...new Set(unsupported)],
    });
  }
  cached = out;
  return out;
}

export function getShowdownMove(name: string): ImportedMove | undefined {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return loadMoves().get(id);
}

export function allShowdownMoves(): Map<string, ImportedMove> { return loadMoves(); }
