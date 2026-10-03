import type { CanonicalEvent, CombatantId, RoomSnapshot } from '../types/protocol'
import { moveById, speciesById } from './catalog'
import { formatPokemonName } from './format'

type EffectEvent = Extract<CanonicalEvent, { type: 'effect' }>
type EffectCopy = Readonly<{ start: string; end: string; activate?: string }>

// Only recognized IDs become display names. Unknown protocol tokens stay internal.
const effects = new Map<string, EffectCopy>([
  ['confusion', { start: 'ficou confuso!', end: 'saiu da confusão!', activate: 'está confuso!' }],
  [
    'substitute',
    {
      start: 'criou um substituto!',
      end: 'perdeu seu substituto!',
      activate: 'teve o golpe absorvido pelo substituto!',
    },
  ],
  [
    'disable',
    { start: 'teve um golpe desativado!', end: 'pode usar o golpe desativado novamente!' },
  ],
  [
    'encore',
    { start: 'precisa repetir o mesmo golpe!', end: 'pode escolher outro golpe novamente!' },
  ],
  [
    'taunt',
    { start: 'foi provocado e só pode usar golpes de ataque!', end: 'se livrou da provocação!' },
  ],
  [
    'torment',
    {
      start: 'não pode repetir o mesmo golpe em sequência!',
      end: 'pode repetir seus golpes novamente!',
    },
  ],
  [
    'healblock',
    { start: 'não pode recuperar vida por enquanto!', end: 'pode recuperar vida novamente!' },
  ],
  [
    'leechseed',
    {
      start: 'foi envolvido por sementes que drenam vida!',
      end: 'se livrou das sementes!',
      activate: 'teve sua vida drenada pelas sementes!',
    },
  ],
  [
    'attract',
    { start: 'ficou apaixonado!', end: 'se livrou da atração!', activate: 'está apaixonado!' },
  ],
  ['yawn', { start: 'ficou sonolento!', end: 'não está mais sonolento!' }],
  ['ingrain', { start: 'criou raízes no campo!', end: 'soltou suas raízes!' }],
  ['aquaring', { start: 'se envolveu em um anel de água!', end: 'perdeu seu anel de água!' }],
  [
    'focusenergy',
    { start: 'se concentrou para acertar golpes críticos!', end: 'perdeu a concentração!' },
  ],
  ['magnetrise', { start: 'começou a levitar!', end: 'voltou ao chão!' }],
  ['telekinesis', { start: 'foi suspenso no ar!', end: 'voltou ao chão!' }],
  ['smackdown', { start: 'foi derrubado no chão!', end: 'pode sair do chão novamente!' }],
  ['roost', { start: 'pousou para descansar!', end: 'terminou de descansar!' }],
  ['curse', { start: 'foi atingido por uma maldição!', end: 'se livrou da maldição!' }],
  ['nightmare', { start: 'começou a ter pesadelos!', end: 'se livrou dos pesadelos!' }],
  ['drowsy', { start: 'ficou sonolento!', end: 'não está mais sonolento!' }],
  [
    'trapped',
    { start: 'ficou preso e não pode sair do campo!', end: 'pode sair do campo novamente!' },
  ],
  ['partiallytrapped', { start: 'ficou preso pelo golpe!', end: 'se libertou do golpe!' }],
  ['gastroacid', { start: 'teve sua habilidade suprimida!', end: 'recuperou sua habilidade!' }],
  ['stockpile', { start: 'acumulou energia!', end: 'liberou a energia acumulada!' }],
  [
    'bide',
    {
      start: 'começou a acumular o dano recebido!',
      end: 'liberou o dano acumulado!',
      activate: 'continua acumulando o dano recebido!',
    },
  ],
])

const protections = new Set([
  'protect',
  'detect',
  'kingsshield',
  'spikyshield',
  'banefulbunker',
  'silktrap',
  'burningbulwark',
  'obstruct',
])
const stats = new Map([
  ['atk', 'O Ataque'],
  ['def', 'A Defesa'],
  ['spa', 'O Ataque Especial'],
  ['spd', 'A Defesa Especial'],
  ['spe', 'A Velocidade'],
  ['accuracy', 'A Precisão'],
  ['evasion', 'A Evasão'],
])
const statuses = new Map([
  ['brn', 'ficou com uma queimadura!'],
  ['psn', 'foi envenenado!'],
  ['tox', 'foi gravemente envenenado!'],
  ['par', 'ficou paralisado!'],
  ['slp', 'adormeceu!'],
  ['frz', 'foi congelado!'],
])
const unable = new Map([
  ['slp', 'está dormindo e não pode agir!'],
  ['frz', 'está congelado e não pode agir!'],
  ['par', 'está paralisado e não conseguiu se mover!'],
  ['flinch', 'recuou e não conseguiu agir!'],
  ['recharge', 'precisa recuperar energia antes de agir!'],
  ['nopp', 'não tem PP para usar esse golpe!'],
  ['trapped', 'está preso e não conseguiu sair do campo!'],
  ['attract', 'não conseguiu agir por estar apaixonado!'],
  ['taunt', 'não pode usar esse golpe enquanto estiver provocado!'],
  ['disable', 'não pode usar o golpe desativado!'],
  ['torment', 'não pode repetir o mesmo golpe agora!'],
  ['healblock', 'não pode usar um golpe de cura agora!'],
])

function pokemonName(id: CombatantId | null, state: RoomSnapshot): string {
  if (!id) return 'O campo'
  const pokemon = [...(state.battle?.ownTeam ?? []), ...(state.battle?.opponentTeam ?? [])].find(
    (candidate) => candidate.id === id
  )
  const speciesId = pokemon && 'speciesId' in pokemon ? pokemon.speciesId : null
  return speciesId && speciesById(speciesId) ? formatPokemonName(speciesId) : 'O Pokémon'
}

function effectMessage(event: EffectEvent, state: RoomSnapshot): string {
  const name = pokemonName(event.target, state)
  const id = event.effectId ?? ''
  const move = moveById(id)?.name
  const copy = effects.get(id)
  const subject = event.target
    ? name
    : event.side
      ? `A equipe de ${state.players[event.side === 'p1' ? 0 : 1].name}`
      : 'O campo'

  if (protections.has(id)) {
    if (event.operation === 'end') return `${name} deixou de estar protegido.`
    if (event.operation === 'activate' || event.operation === 'block')
      return `${name} bloqueou o golpe!`
    if (['start', 'singleturn', 'singlemove'].includes(event.operation))
      return `${name} se protegeu!`
  }
  if (id === 'endure' && ['start', 'singleturn', 'singlemove'].includes(event.operation))
    return `${name} se preparou para resistir ao golpe!`
  if (id === 'endure' && event.operation === 'activate') return `${name} resistiu ao golpe!`
  if (copy && ['start', 'singleturn', 'singlemove'].includes(event.operation))
    return `${name} ${copy.start}`
  if (copy && event.operation === 'end') return `${name} ${copy.end}`
  if (copy?.activate && event.operation === 'activate') return `${name} ${copy.activate}`
  if (/^perish[0-3]$/.test(id) && event.operation === 'start') {
    const rounds = Number(id.at(-1))
    return rounds === 0
      ? `${name} esgotou sua contagem final!`
      : `${name} tem ${rounds} ${rounds === 1 ? 'rodada restante' : 'rodadas restantes'} antes de cair!`
  }
  switch (event.operation) {
    case 'prepare':
      return move
        ? `${name} está preparando ${move}!`
        : `${name} está preparando seu próximo golpe!`
    case 'mustrecharge':
      return `${name} precisa recuperar energia!`
    case 'fail':
      return 'O golpe falhou!'
    case 'block':
      return 'O golpe foi bloqueado!'
    case 'notarget':
      return 'Não há um alvo para esse golpe.'
    case 'nothing':
      return 'Nada aconteceu.'
    case 'ohko':
      return 'Nocaute em um só golpe!'
    case 'cureteam':
      return `${subject} se livrou dos problemas de estado!`
    case 'clearboost':
      return `${subject} teve as alterações de atributos removidas!`
    case 'clearallboost':
      return 'As alterações de atributos de todos os Pokémon foram removidas!'
    case 'clearpositiveboost':
      return `${subject} perdeu os aumentos de atributos!`
    case 'clearnegativeboost':
      return `${subject} se livrou das reduções de atributos!`
    case 'invertboost':
      return `${subject} teve as alterações de atributos invertidas!`
    case 'copyboost':
      return `${subject} copiou as alterações de atributos!`
    case 'swapboost':
      return `${subject} trocou suas alterações de atributos!`
    case 'setboost':
      return `${subject} teve seus atributos ajustados!`
    case 'start':
    case 'singleturn':
    case 'singlemove':
    case 'sidestart':
    case 'fieldstart':
      return move
        ? `${subject} está sob o efeito de ${move}!`
        : `${subject} passou a receber um efeito da batalha.`
    case 'end':
    case 'sideend':
    case 'fieldend':
      return move
        ? `O efeito de ${move} sobre ${subject} terminou.`
        : `Um efeito sobre ${subject} terminou.`
    case 'activate':
    case 'fieldactivate':
      return move ? `O efeito de ${move} foi ativado!` : 'Um efeito da batalha foi ativado!'
    default:
      return 'Um efeito alterou a batalha.'
  }
}

/** Local presentation only: never changes canonical events or reads pending choices. */
export function battleMessage(event: CanonicalEvent, state: RoomSnapshot): string {
  const name = (id: CombatantId | null) => pokemonName(id, state)
  switch (event.type) {
    case 'battle_start':
      return 'Batalha iniciada!'
    case 'round_start':
      return `Rodada ${event.number}: escolha sua próxima ação.`
    case 'move':
      return `${name(event.actor)} usou ${moveById(event.moveId)?.name ?? 'um golpe'}!`
    case 'damage':
      if (event.cause === 'confusion')
        return `${name(event.target)} se machucou na confusão e perdeu ${event.amount} HP!`
      if (event.cause === 'brn')
        return `${name(event.target)} perdeu ${event.amount} HP pela queimadura.`
      if (event.cause === 'psn' || event.cause === 'tox')
        return `${name(event.target)} perdeu ${event.amount} HP pelo veneno.`
      if (event.cause === 'recoil')
        return `${name(event.target)} sofreu o recuo e perdeu ${event.amount} HP.`
      return `${name(event.target)} perdeu ${event.amount} HP.`
    case 'heal':
      return `${name(event.target)} recuperou ${event.amount} HP!`
    case 'critical':
      return 'Acerto crítico!'
    case 'super_effective':
      return 'É super efetivo!'
    case 'resisted':
      return 'Não foi muito efetivo...'
    case 'immune':
      return `Não afetou ${name(event.target)}!`
    case 'miss':
      return `${name(event.actor)} errou o golpe!`
    case 'hit_count':
      return `O golpe atingiu ${name(event.target)} ${event.hits} ${event.hits === 1 ? 'vez' : 'vezes'}!`
    case 'faint':
      return `${name(event.target)} foi nocauteado!`
    case 'switch': {
      const species = speciesById(event.pokemon.speciesId)
      const incoming = species ? formatPokemonName(species.id) : 'Um Pokémon'
      return event.forced ? `${incoming} foi trazido ao campo!` : `${incoming} entrou em campo!`
    }
    case 'status':
      return event.status
        ? `${name(event.target)} ${statuses.get(event.status) ?? 'foi afetado por um problema de estado!'}`
        : `${name(event.target)} se recuperou do problema de estado!`
    case 'boost': {
      const stat = stats.get(event.stat)
      if (!stat) return `Os atributos de ${name(event.target)} mudaram!`
      const amount = event.after - event.before
      if (!amount) return `${stat} de ${name(event.target)} não mudou.`
      const verb = amount > 0 ? 'aumentou' : 'diminuiu'
      const intensity =
        Math.abs(amount) >= 3 ? ' drasticamente' : Math.abs(amount) >= 2 ? ' bastante' : ''
      return `${stat} de ${name(event.target)} ${verb}${intensity}!`
    }
    case 'unable':
      return `${name(event.actor)} ${unable.get(event.reason) ?? 'não conseguiu agir!'}`
    case 'effect':
      return effectMessage(event, state)
    case 'battle_end':
      return event.result.winner
        ? `${state.players[event.result.winner === 'p1' ? 0 : 1].name} venceu!`
        : 'A batalha terminou em empate!'
    case 'state_sync':
      return ''
  }
}
