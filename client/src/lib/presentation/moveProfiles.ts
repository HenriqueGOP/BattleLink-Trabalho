import { moveById } from '../catalog'
import { SCENE_LAYOUT } from './sceneLayout'

/** Famílias artísticas; nenhuma regra de dano ou acerto pertence à apresentação. */
export type MoveFamily =
  'contact' | 'slash' | 'projectile' | 'beam' | 'wave' | 'area' | 'powder' | 'status'

export interface MoveProfile {
  readonly family: MoveFamily
  readonly element: string
  readonly statusMove: boolean
  readonly anticipation: number
  readonly travel: number
  readonly recovery: number
  readonly size: number
}

const families = new Map<string, MoveFamily>()
const register = (family: MoveFamily, ids: string) => {
  for (const id of ids.split(' ')) families.set(id, family)
}
register(
  'contact',
  'tackle quickattack bodyslam slam headbutt doubleedge takedown extremespeed machpunch bulletpunch closecombat drainpunch firepunch icepunch thunderpunch megakick stomp highjumpkick jumpkick lowkick karatechop brickbreak hammerarm focuspunch dynamicpunch aquajet waterfall aquatail liquidation wildcharge flareblitz flamecharge outrage dragonrush playrough bite crunch megahorn peck drillpeck wingattack acrobatics bravebird fly bounce dig dive shadowforce phantomforce rockclimb ironhead zenheadbutt rapidspin knockoff uturn reversal struggle superpower seismictoss circlethrow vitalthrow throatchop bodypress pounce firstimpression lunge'
)
// As listas usam IDs canônicos compactos; nomes compostos não dependem de tradução.
register('contact', 'megapunch lowsweep heavyslam irontail meteormash gigaimpact')
register(
  'slash',
  'slash nightslash airslash leafblade solarblade razorshell dragonclaw shadowclaw metalclaw furyswipes scratch falseswipe sacredsword secretsword psychocut aerialace xscissor crosspoison cut ceaselessedge stoneaxe kowtowcleave bitterblade aquacutter populationbomb'
)
register(
  'projectile',
  'shadowball energyball electroball aurasphere focusblast weatherball seedbomb bulletseed rockthrow rockblast pinmissile iciclespear iceshard gyroball magnetbomb sludge sludgebomb gunkshot acid acidspray mudshot mudslap ember pyroball pollenpuff eggbomb barrage snipeshot watergun bubble bubblebeam psybeam psyshock dreameater moonblast swift storedpower'
)
register(
  'beam',
  'flamethrower fireblast overheat hydropump hydrocannon scald icebeam aurorabeam hyperbeam solarbeam chargebeam thunderbolt thunder thundershock discharge signalbeam flashcannon triattack powergem dragonbreath eternabeam steelbeam electroshot meteorbeam armorcannon freezingglare prismaticlaser originpulse spacialrend'
)
register(
  'wave',
  'hypervoice psychicnoise echoedvoice boomburst uproar snarl bugbuzz disarmingvoice sparklingaria perishsong growl roar partingshot round darkpulse dragonpulse psychic confusion extrasensory expandingforce psywave waterpulse shockwave sonicboom dragonrage eeriespell gust airslash aircutter hurricane whirlwind twister razorwind heatwave icywind vacuumwave chillingwater'
)
register(
  'area',
  'earthquake magnitude earthpower bulldoze fissure eruption waterspout surf muddywater rockslide stoneedge avalanche blizzard powdersnow sandstorm sandtomb incinerate explosion selfdestruct mindblown mistyexplosion stompingtantrum precipiceblades landswrath leafstorm petalblizzard razorleaf thousandarrows thousandwaves gravapple blastburn frenzyplant'
)
register(
  'powder',
  'spore sleeppowder poisonpowder stunspore powder cottonspore sandattack sweetscent fairywind dazzlinggleam magicalleaf petaldance featherdance'
)

/** Especificidade por ID primeiro; fallback por forma de execução, nunca URLs. */
export function moveProfile(moveId: string): MoveProfile | null {
  const move = moveById(moveId)
  if (!move) return null
  const family =
    families.get(move.id) ??
    (move.category === 'Status'
      ? 'status'
      : /slash|claw|blade|cut|scratch/.test(move.id)
        ? 'slash'
        : move.category === 'Physical'
          ? 'contact'
          : 'projectile')
  return {
    family,
    element: move.type,
    statusMove: move.category === 'Status',
    anticipation: family === 'contact' || family === 'slash' ? 170 : 220,
    travel: family === 'contact' ? 310 : family === 'beam' ? 520 : 460,
    recovery: family === 'contact' || family === 'slash' ? 300 : 240,
    size: family === 'area' ? 230 : family === 'beam' ? 190 : family === 'wave' ? 190 : 160,
  }
}

/** Movimento entre âncoras medido uma vez por evento; sem layout por frame. */
export function actionVector(
  actor: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null,
  target: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null,
  fallbackDirection: number
) {
  if (!actor || !target) return { x: fallbackDirection * 34, y: -10 }
  const x = target.left + target.width / 2 - actor.left - actor.width / 2
  const y = target.top + target.height / 2 - actor.top - actor.height / 2
  const distance = Math.hypot(x, y)
  if (distance < 1) return { x: 0, y: 0 }
  const travel = Math.min(distance * 0.45, SCENE_LAYOUT.maxTravel)
  return { x: (x / distance) * travel, y: Math.max(-SCENE_LAYOUT.maxVerticalTravel, Math.min(SCENE_LAYOUT.maxVerticalTravel, (y / distance) * travel)) }
}
