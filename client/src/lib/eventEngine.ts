import type { GameState, ServerBattleEvent } from '../types/battle'
import type { BattleEvent, BattleEventType, LogCategory, LogEntry, Side } from '../types/events'

/**
 * Deriva eventos animáveis comparando dois snapshots oficiais e cruzando com as
 * NOVAS linhas de log (padrões exatos emitidos por server/src/game/room.ts).
 * Nenhuma regra de jogo mora aqui — só interpretação do que o servidor já decidiu.
 */

const EVENT_DURATIONS: Partial<Record<BattleEventType, number>> = {
  damage: 1200,
  special: 1000,
  confusion_hit: 900,
  miss: 900,
  immune: 900,
  effective: 400,
  resisted: 400,
  heal: 900,
  stat_up: 700,
  stat_down: 700,
  status_apply: 900,
  status_cure: 600,
  flinch: 700,
  residual: 600,
  faint: 1200,
  switch_in: 900,
  tera: 1400,
  weather_change: 900,
  terrain_change: 900,
  turn_change: 900,
  victory: 2000,
  defeat: 2000,
  draw: 2000,
  substitute_needed: 700,
  opponent_left: 800,
  battle_start: 1400,
  info: 200,
}

function durationOf(type: BattleEventType): number {
  return EVENT_DURATIONS[type] ?? 400
}

/** Contexto para resolver nomes → lado da partida. */
export interface SideContext {
  byToken: Map<string, Side>
}

export function buildSideContext(state: GameState, myIndex: number): SideContext {
  const byToken = new Map<string, Side>()
  state.players.forEach((player, index) => {
    const side: Side = index === myIndex ? 'me' : 'opponent'
    byToken.set(player.id.toLowerCase(), side)
    byToken.set(player.name.toLowerCase(), side)
    if (player.pokemon) byToken.set(player.pokemon.toLowerCase(), side)
    for (const member of player.team) byToken.set(member.pokemon.toLowerCase(), side)
  })
  return { byToken }
}

function sideOf(ctx: SideContext, token: string | undefined): Side {
  if (!token) return 'system'
  return ctx.byToken.get(token.trim().toLowerCase()) ?? 'system'
}

interface LineRule {
  re: RegExp
  category: LogCategory
  /** Tipo de evento animável; null = apenas log. */
  event: BattleEventType | null
  extract?: (match: RegExpMatchArray) => { actor?: string; target?: string; amount?: number; move?: string; hits?: number; status?: string; stat?: string; pokemon?: string }
}

const STATUS_WORDS: Record<string, string> = {
  'foi QUEIMADO': 'burn',
  'foi ENVENENADO': 'poison',
  'foi gravemente ENVENENADO': 'bad_poison',
  'ficou PARALISADO': 'paralysis',
  adormeceu: 'sleep',
  'foi CONGELADO': 'freeze',
}

/** Tabela de regras sobre os padrões exatos do room.ts. A ordem importa. */
const RULES: LineRule[] = [
  {
    re: /^(.+?): (.+?) (foi QUEIMADO|foi ENVENENADO|foi gravemente ENVENENADO|ficou PARALISADO|adormeceu|foi CONGELADO)!$/,
    category: 'status',
    event: 'status_apply',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2], status: STATUS_WORDS[m[3]] }),
  },

  {
    re: /^(.+?): (.+?) se machucou na confusão \(-(\d+) HP\)!$/,
    category: 'damage',
    event: 'confusion_hit',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2], amount: Number(m[3]) }),
  },
  {
    re: /^(.+?) usou (.+?), mas (.+?) ESQUIVOU!$/,
    category: 'miss',
    event: 'miss',
    extract: m => ({ actor: m[1], target: m[3], move: m[2] }),
  },
  {
    re: /^(.+?) usou (.+?), mas não afeta (.+)!$/,
    category: 'info',
    event: 'immune',
    extract: m => ({ actor: m[1], move: m[2], pokemon: m[3] }),
  },
  {
    re: /^(.+?) acertou (.+?) — nocaute imediato! (.+) desmaiou!$/,
    category: 'damage',
    event: null,
    extract: m => ({ actor: m[1], move: m[2], target: m[3], pokemon: m[3] }),
  },
  {
    re: /^(.+?): (.+?) usou (.+?) e recuperou (\d+) HP/,
    category: 'heal',
    event: 'heal',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2], move: m[3], amount: Number(m[4]) }),
  },
  {
    re: /^(.+?) drenou energia \(\+(\d+) HP\)/,
    category: 'heal',
    event: 'heal',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[1], amount: Number(m[2]), move: 'dreno' }),
  },
  {
    re: /^(.+?) foi curado pelo campo gramado \(\+(\d+) HP\)/,
    category: 'heal',
    event: 'heal',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[1], amount: Number(m[2]) }),
  },
  {
    re: /^(.+?) usou (.+?)(?: — acertou (\d+) vezes)? \(-(\d+) HP\)/,
    category: 'damage',
    event: 'damage',
    extract: m => ({
      actor: m[1],
      move: m[2],
      hits: m[3] ? Number(m[3]) : undefined,
      amount: Number(m[4]),
    }),
  },
  {
    re: /^(.+?): (.+?) foi nocauteado!$/,
    category: 'faint',
    event: 'faint',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2] }),
  },
  {
    re: /^(.+?) sofreu dano residual \(-(\d+) HP\)/,
    category: 'damage',
    event: 'residual',
    extract: m => ({ actor: m[1], target: m[1], amount: Number(m[2]) }),
  },
  {
    re: /^Acerto crítico!$/,
    category: 'damage',
    event: 'effective', // vira flag do dano quando possível; sozinho vira evento próprio
    extract: () => ({ status: 'crit' }),
  },
  {
    re: /^Foi super efetivo!$/,
    category: 'damage',
    event: 'effective',
  },
  {
    re: /^Não foi muito efetivo/,
    category: 'damage',
    event: 'resisted',
  },
  {
    re: /^(.+?) enviou (.+?)!$/,
    category: 'switch',
    event: 'switch_in',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2] }),
  },
  {
    re: /^(.+?) TERASTALIZOU!/,
    category: 'info',
    event: 'tera',
    extract: m => ({ actor: m[1], target: m[1] }),
  },
  {
    re: /O ([A-Z]{3}) de (.+?) (subiu|caiu)!/,
    category: 'stat',
    event: null, // eventos estruturais de statStages cobrem a animação
    extract: m => ({ stat: m[1], pokemon: m[2] }),
  },
  {
    re: /^(.+?): (.+?) ficou CONFUSO!$/,
    category: 'status',
    event: 'status_apply',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2], status: 'confusion' }),
  },
  {
    re: /^(.+?): (.+?) (acordou|descongelou|saiu da confusão)!$/,
    category: 'status',
    event: 'status_cure',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2] }),
  },
  {
    re: /^(.+?): (.+?) vacilou/,
    category: 'info',
    event: 'flinch',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2] }),
  },
  {
    re: /^(.+?) vacilou com o impacto!$/,
    category: 'info',
    event: 'flinch',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[1] }),
  },
  {
    re: /^(.+?): (.+?) (está paralisado|está dormindo|está congelado|está confuso)/,
    category: 'info',
    event: null,
    extract: m => ({ actor: m[1], pokemon: m[2] }),
  },
  {
    re: /^(.+?): (.+?) saiu da confusão!$/,
    category: 'status',
    event: 'status_cure',
    extract: m => ({ actor: m[1], target: m[1], pokemon: m[2] }),
  },
  {
    re: /a batalha vai começar!/,
    category: 'info',
    event: 'battle_start',
  },
  {
    re: /^(.+?) VENCEU a batalha!$/,
    category: 'result',
    event: null, // a mudança estrutural de fase gera victory/defeat/draw
  },
  {
    re: /EMPATE!$/,
    category: 'result',
    event: null,
  },
  {
    re: /deve escolher um substituto/,
    category: 'info',
    event: null, // pendingSwitch estrutural gera substitute_needed
  },
  {
    re: /escolheu (.+?) \(nº \d+\)/,
    category: 'info',
    event: null,
  },
  {
    re: /é SHINY!/,
    category: 'info',
    event: null,
  },
  {
    re: /definiu os golpes de (.+?)\./,
    category: 'info',
    event: null,
  },
  {
    re: /vai refazer a equipe/,
    category: 'info',
    event: null,
  },
  {
    re: /age primeiro \(Pokémon mais veloz\)/,
    category: 'info',
    event: null,
  },
  {
    re: /Batalha iniciada!/,
    category: 'info',
    event: null,
  },
]

export interface ParsedLine {
  category: LogCategory
  side: Side
  event: BattleEventType | null
  actor?: string
  targetName?: string
  amount?: number
  move?: string
  hits?: number
  status?: string
  stat?: string
  pokemon?: string
  isCritMarker?: boolean
}

export function parseLogLine(line: string, ctx: SideContext): ParsedLine {
  for (const rule of RULES) {
    const match = line.match(rule.re)
    if (!match) continue
    const data = rule.extract?.(match) ?? {}
    return {
      category: rule.category,
      side: sideOf(ctx, data.actor ?? data.target),
      event: rule.event,
      actor: data.actor,
      targetName: data.target,
      amount: data.amount,
      move: data.move,
      hits: data.hits,
      status: data.status,
      stat: data.stat,
      pokemon: data.pokemon,
      isCritMarker: data.status === 'crit',
    }
  }
  return { category: 'info', side: 'system', event: null }
}

/** Classifica qualquer linha (inclusive histórico) para o painel de log. */
export function classifyLogLine(line: string, ctx: SideContext): Omit<LogEntry, 'id'> {
  const parsed = parseLogLine(line, ctx)
  return { text: line, category: parsed.category, side: parsed.side }
}



/**
 * Traduz um evento canônico do servidor para o formato do cliente, resolvendo
 * apenas o lado visual (me/opponent) a partir dos ids de jogador. Nenhuma regra
 * de batalha é recalculada aqui: o servidor já decidiu ordem, alvo e mensagem.
 */
function mapServerEvent(
  serverEvent: ServerBattleEvent,
  ctx: SideContext,
): Omit<BattleEvent, 'id' | 'duration'> {
  // O servidor emite "damage" com actorId === targetId quando o golpe de
  // confusão atinge o próprio Pokémon; o cliente usa um tipo próprio só para
  // a animação (sem investida do atacante).
  const type: BattleEventType =
    serverEvent.type === 'damage' && !!serverEvent.actorId && serverEvent.actorId === serverEvent.targetId
      ? 'confusion_hit'
      : serverEvent.type === 'victory' || serverEvent.type === 'defeat'
        ? sideOf(ctx, serverEvent.actorId) === 'me' ? 'victory' : 'defeat'
        : serverEvent.type
  return {
    type,
    actor: sideOf(ctx, serverEvent.actorId),
    target: sideOf(ctx, serverEvent.targetId),
    message: serverEvent.message,
    amount: serverEvent.amount,
    move: serverEvent.move,
    crit: serverEvent.crit,
    hits: serverEvent.hits,
    status: serverEvent.status,
    stat: serverEvent.stat,
    pokemon: serverEvent.pokemon,
  }
}

/**
 * Consome os eventos CANÔNICOS do servidor (`state.events`) em vez de rederivar
 * regras a partir do texto do log. O servidor é a fonte de verdade: cada evento
 * já traz ordem (id crescente), autor (actorId), alvo (targetId) e mensagem.
 * Como os dois clientes recebem o MESMO array de eventos, ambos veem a MESMA
 * sequência de informações, espelhada apenas na perspectiva (me/opponent) via
 * id de jogador — sem depender de regex sobre texto ou de heurísticas de lado.
 */
export function diffState(
  prev: GameState | null,
  next: GameState,
  myIndex: number,
  nextId: () => number,
): BattleEvent[] {
  const events: BattleEvent[] = []
  const ctx = buildSideContext(next, myIndex)
  const me = next.players[myIndex]
  const other = next.players[1 - myIndex]
  if (!me || !other) return events

  const push = (event: Omit<BattleEvent, 'id' | 'duration'> & { duration?: number }) => {
    events.push({ ...event, id: nextId(), duration: event.duration ?? durationOf(event.type) })
  }

  // Primeiro snapshot (entrada na partida ou reconexão): NÃO repassa o histórico
  // inteiro de eventos — mostra apenas a cena pronta. O cursor abaixo parte do
  // maior id já contido neste snapshot, então nada é repetido nem perdido depois.
  if (!prev) {
    if (next.phase === 'battle' && me.pokemon) {
      push({ type: 'battle_start', actor: 'system', target: 'system', message: 'A batalha vai começar!' })
    }
    return events
  }

  // Eventos novos do servidor, em ordem, usando o id como cursor monotônico.
  // (O servidor apara o array antigo, mas os ids continuam crescendo, então
  // "id > último visto" nunca repete nem pula evento.)
  const prevMaxId = prev.events.reduce((max, event) => Math.max(max, event.id), 0)
  for (const serverEvent of next.events) {
    if (serverEvent.id <= prevMaxId) continue
    push(mapServerEvent(serverEvent, ctx))
  }

  // Rede de segurança mínima: clima/terreno, que o servidor não emite como
  // evento (são sorteados uma única vez no início da batalha).
  if (prev.field.weather !== next.field.weather) {
    push({ type: 'weather_change', actor: 'system', target: 'system', message: `Clima: ${next.field.weather ?? 'nenhum'}` })
  }
  if (prev.field.terrain !== next.field.terrain) {
    push({ type: 'terrain_change', actor: 'system', target: 'system', message: `Terreno: ${next.field.terrain ?? 'nenhum'}` })
  }

  return events
}
