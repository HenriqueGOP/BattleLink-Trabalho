import { moveById } from '../catalog'
import type { StatusName } from '../../types/player'
import type { CanonicalEvent } from '../../types/protocol'
import { moveProfile } from './moveProfiles'
import { MOVE_TYPE_GLYPHS } from '../../components/MoveIdentity/moveTypeGlyphs'

export const VFX_ATLASES = {
  attacks: '/battle-vfx/impacts.webp',
  statuses: '/battle-vfx/statuses.webp',
  transitions: '/battle-vfx/transitions.webp',
  frozen: '/battle-vfx/frozen.webp',
} as const

export interface SpriteClip {
  readonly atlas: keyof typeof VFX_ATLASES
  readonly row: number
  readonly frames: number
  readonly fps: number
  readonly size: number
  readonly cropTop?: number
  readonly cropBottom?: number
  readonly columns?: number
  readonly rows?: number
}
const clip = (atlas: SpriteClip['atlas'], row: number, size = 180, fps = 12): SpriteClip => ({
  atlas,
  row,
  size,
  fps,
  frames: 8,
})
export const SPRITE_CLIPS = {
  frozen: { ...clip('frozen', 0, 220, 8), columns: 8, rows: 1 },
  impact: clip('attacks', 0),
  slash: clip('attacks', 1),
  fire: clip('attacks', 2),
  water: clip('attacks', 3),
  electric: clip('attacks', 4),
  grass: clip('attacks', 5),
  ice: clip('attacks', 6),
  shadow: clip('attacks', 7),
  burn: clip('statuses', 0, 86, 8),
  poison: clip('statuses', 1, 86, 8),
  sleep: clip('statuses', 2, 74, 8),
  confusion: clip('statuses', 3, 90, 8),
  protect: clip('statuses', 4, 165, 12),
  buff: clip('statuses', 5, 116, 14),
  debuff: clip('statuses', 6, 116, 14),
  heal: clip('statuses', 7, 130, 14),
  recall: clip('transitions', 0, 150, 16),
  summon: clip('transitions', 1, 190, 12),
  faint: { ...clip('transitions', 2, 150, 12), cropTop: 0.1 },
  victory: clip('transitions', 3, 190, 12),
  defeat: { ...clip('transitions', 4, 150, 12), cropTop: 0.24 },
  draw: clip('transitions', 5, 155, 12),
  dodge: { ...clip('transitions', 6, 140, 22), cropBottom: 0.14 },
  psychic: clip('transitions', 7, 160, 18),
} as const
export type SpriteClipId = keyof typeof SPRITE_CLIPS

/** Existing UI palette and glyphs distinguish types sharing an atlas family. */
export const TYPE_VISUALS = {
  normal: { clip: 'impact', color: '#9fa19f' },
  fire: { clip: 'fire', color: '#e8532b' },
  water: { clip: 'water', color: '#4a7ddb' },
  electric: { clip: 'electric', color: '#e8b918' },
  grass: { clip: 'grass', color: '#4faa54' },
  ice: { clip: 'ice', color: '#5fc7c7' },
  fighting: { clip: 'impact', color: '#bf3f38' },
  poison: { clip: 'shadow', color: '#8f4199' },
  ground: { clip: 'impact', color: '#b58a3c' },
  flying: { clip: 'slash', color: '#7f8fd6' },
  psychic: { clip: 'psychic', color: '#dc4569' },
  bug: { clip: 'grass', color: '#8fa832' },
  rock: { clip: 'impact', color: '#a68b3c' },
  ghost: { clip: 'shadow', color: '#66517f' },
  dragon: { clip: 'fire', color: '#5a50c8' },
  dark: { clip: 'shadow', color: '#5c4f43' },
  steel: { clip: 'slash', color: '#8b93a8' },
  fairy: { clip: 'psychic', color: '#e28fb4' },
} as const satisfies Record<keyof typeof MOVE_TYPE_GLYPHS, { clip: SpriteClipId; color: string }>
export type VisualType = keyof typeof TYPE_VISUALS
export function attackVisualType(moveId: string): VisualType | undefined {
  const move = moveById(moveId)
  return move && move.category !== 'Status' && Object.hasOwn(TYPE_VISUALS, move.type)
    ? (move.type as VisualType)
    : undefined
}

/** Somente dados locais determinam a arte; IDs desconhecidos não viram URLs. */
export function attackClip(moveId: string): SpriteClipId | null {
  const move = moveById(moveId)
  if (!move || move.category === 'Status') return null
  if (/slash|claw|cut|blade|scratch/.test(move.id)) return 'slash'
  const type = attackVisualType(moveId)
  return type ? TYPE_VISUALS[type].clip : 'impact'
}
export const projectileMove = (moveId: string) => moveProfile(moveId)?.family === 'projectile'
/** Sinal de emissão; status aplicado só aparece no evento canônico correspondente. */
export function emissionClip(moveId: string): SpriteClipId | null {
  const move = moveById(moveId)
  if (!move) return null
  if (move.category !== 'Status') return attackClip(moveId)
  if (move.type === 'fire') return 'fire'
  if (move.type === 'electric') return 'electric'
  if (move.type === 'grass' || /powder|spore/.test(move.id)) return 'grass'
  if (move.type === 'poison') return 'shadow'
  if (move.type === 'water') return 'water'
  if (move.type === 'ice') return 'ice'
  return 'psychic'
}
export function isChargingMove(
  event: Extract<CanonicalEvent, { type: 'move' }>,
  next?: CanonicalEvent
): boolean {
  return (
    next?.type === 'effect' &&
    next.operation === 'prepare' &&
    next.target === event.actor &&
    next.effectId === event.moveId
  )
}
export function statusClip(status: StatusName | null | undefined): SpriteClipId | null {
  return status === 'bad_poison'
    ? 'poison'
    : status === 'paralysis'
      ? 'electric'
      : status === 'freeze'
        ? 'frozen'
        : (status ?? null)
}
