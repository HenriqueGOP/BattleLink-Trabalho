// server/src/game/pokeapi.ts
import { getShowdownMove } from "./showdown-moves";
const API = "https://pokeapi.co/api/v2";
export const MAX_MOVE_POOL = 24;

export interface MoveData {
  name: string; power: number | null; accuracy: number | null; pp: number | null;
  type: string; category: string | null;
  target: string | null;
  learnMethods: string[]; level: number | null;
  metaCategory: string | null;
  priority: number;
  critRate: number;
  minHits: number | null; maxHits: number | null;
  drain: number; flinchChance: number; healing: number; statChance: number;
  description: string | null;
  unsupported: string[];
  selfStatChanges: Array<{ stat: string; change: number }>;
  ailment?: string; ailmentChance?: number;
  statChanges?: Array<{ stat: string; change: number }>;
}

export interface PokemonDetail {
  id: number; name: string; types: string[]; abilities: string[];
  sprites: { front: string | null; back: string | null; shinyFront: string | null; shinyBack: string | null };
  cries: { latest: string | null; legacy: string | null };
  stats: Record<string, number>;
  moves: MoveData[];
}

const cache = new Map<string, unknown>();

/**
 * Transporte HTTP injetavel. Producao usa fetch; os testes trocam por um
 * fixture local para que a suite rode offline e de forma deterministica
 * (a PokeAPI aplica rate limit e o CI nem sempre tem saida para a internet).
 */
export interface PokeApiResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
export type PokeApiTransport = (url: string) => Promise<PokeApiResponse>;

const defaultTransport: PokeApiTransport = url => fetch(url, { signal: AbortSignal.timeout(10000) });
let transport: PokeApiTransport = defaultTransport;

/** Troca o transporte e limpa os caches. `null` restaura o fetch real. */
export function setPokeApiTransport(next: PokeApiTransport | null): void {
  transport = next ?? defaultTransport;
  cache.clear();
  knownNames = null;
  namesPromise = null;
}

async function cachedJson<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit) return hit as T;
  const response = await transport(`${API}${path}`);
  if (!response.ok) throw new Error(`PokeAPI respondeu ${response.status} em ${path}`);
  const data = (await response.json()) as T;
  cache.set(path, data);
  return data;
}

let knownNames: Set<string> | null = null;
let namesPromise: Promise<Set<string>> | null = null;

function loadNames(): Promise<Set<string>> {
  if (knownNames) return Promise.resolve(knownNames);
  if (!namesPromise) {
    namesPromise = cachedJson<{ results: Array<{ name: string }> }>("/pokemon?limit=1025")
      .then(list => { knownNames = new Set(list.results.map(item => item.name)); return knownNames; })
      .catch(error => { namesPromise = null; throw error; });
  }
  return namesPromise;
}

export function ensureCatalog(): Promise<void> { return loadNames().then(() => undefined); }

export async function isKnownPokemon(name: string): Promise<boolean> {
  return (await loadNames()).has(name);
}

const VG_PREFERENCE = [
  "scarlet-violet",
  "sword-shield",
  "brilliant-diamond-and-shining-pearl",
  "legends-arceus",
  "lets-go-pikachu-lets-go-eevee",
  "ultra-sun-ultra-moon",
  "sun-moon",
  "omega-ruby-alpha-sapphire",
  "x-y",
  "black-2-white-2",
  "black-white",
  "heartgold-soulsilver",
  "platinum",
  "diamond-pearl",
  "emerald",
  "firered-leafgreen",
  "ruby-sapphire",
  "crystal",
  "gold-silver",
  "yellow",
  "red-blue",
];

interface LearnEntry { name: string; method: string; level: number; vgIndex: number }

function collectLearnset(raw: any): LearnEntry[] {
  const collected: LearnEntry[] = [];
  for (const entry of raw.moves ?? []) {
    let best: LearnEntry | null = null;
    for (const vg of entry.version_group_details ?? []) {
      const idx = VG_PREFERENCE.indexOf(vg.version_group?.name);
      if (idx < 0) continue;
      if (!best || idx < best.vgIndex) {
        best = { name: entry.move.name, method: vg.move_learn_method?.name ?? "level-up", level: vg.level_learned_at ?? 0, vgIndex: idx };
      }
    }
    if (!best) {
      const any = (entry.version_group_details ?? [])[0];
      if (any) best = { name: entry.move.name, method: any.move_learn_method?.name ?? "level-up", level: any.level_learned_at ?? 0, vgIndex: VG_PREFERENCE.length };
    }
    if (best) collected.push(best);
  }
  return collected;
}

function statMap(raw: Array<{ base_stat: number; stat: { name: string } }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of raw) out[item.stat.name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = item.base_stat;
  return out;
}

// fetchMove foi REMOVIDO: era código morto (golpes agora vêm do dataset do Showdown)
// e a interface nova exigia campos que ele não preenchia — fonte de erros de tipo.

export async function fetchPokemonDetail(name: string): Promise<PokemonDetail> {
  const raw = await cachedJson<any>(`/pokemon/${name}`);
  const learnset = collectLearnset(raw);
  const levelUp = learnset.filter(item => item.method === "level-up").sort((a, b) => a.level - b.level);
  const machines = learnset.filter(item => item.method === "machine");
  const others = learnset.filter(item => item.method !== "level-up" && item.method !== "machine");
  let pool = levelUp.length >= 8
    ? levelUp.slice(-MAX_MOVE_POOL)
    : [...levelUp, ...machines, ...others].slice(0, MAX_MOVE_POOL);
  if (pool.length === 0) {
    pool = [{ name: "tackle", method: "level-up", level: 1, vgIndex: VG_PREFERENCE.length }];
  }
  const moves: MoveData[] = pool.map(item => {
    const imported = getShowdownMove(item.name);
    return {
      name: item.name,
      power: imported?.power ?? null,
      accuracy: imported?.accuracy ?? null,
      pp: imported?.pp ?? 10,
      type: imported?.type ?? "normal",
      category: imported?.category ?? "physical",
      target: imported?.target ?? null,
      learnMethods: [item.method],
      level: item.level || null,
      metaCategory: imported?.ohko ? "ohko" : imported && imported.healing > 0 ? "heal" : "damage",
      priority: imported?.priority ?? 0,
      critRate: imported?.critRate ?? 0,
      minHits: imported?.minHits ?? null,
      maxHits: imported?.maxHits ?? null,
      drain: imported?.drain ?? 0,
      flinchChance: imported?.flinchChance ?? 0,
      healing: imported?.healing ?? 0,
      statChance: imported?.statChance ?? 0,
      ailment: imported?.ailment ?? "none",
      ailmentChance: imported?.ailmentChance ?? 0,
      statChanges: imported?.statChanges,
      selfStatChanges: imported?.selfStatChanges ?? [],
      description: imported?.description ?? null,
      unsupported: imported?.unsupported ?? [],
    };
  });
  // ⬅ O RETURN QUE FALTAVA — causava o erro "Promise<PokemonDetail>"
  return {
    id: raw.id,
    name: raw.name,
    types: (raw.types ?? []).map((t: any) => t.type.name),
    abilities: (raw.abilities ?? []).map((a: any) => a.ability.name),
    sprites: (() => {
      const s = raw.sprites ?? {};
      const home = s.other?.home ?? {};
      const artwork = s.other?.["official-artwork"] ?? {};
      const show = s.showdown ?? null;
      // Batalha usa sprites 2D: eles têm frente e costas coerentes. HOME e
      // artwork são só fallback para espécies/variações sem sprite clássico.
      const front = s.front_default ?? (show && show.front_default) ?? home.front_default ?? artwork.front_default ?? null;
      // Pokemon de Gen 8+ raramente tem back_default: cai para front (o front-end espelha quando preciso)
      const back = s.back_default ?? (show && show.back_default) ?? front;
      return {
        front,
        back,
        shinyFront: s.front_shiny ?? home.front_shiny ?? null,
        shinyBack: s.back_shiny ?? s.front_shiny ?? null,
      };
    })(),
    cries: { latest: raw.cries?.latest ?? null, legacy: raw.cries?.legacy ?? null },
    stats: statMap(raw.stats ?? []),
    moves,
  };
}
