import type { ArenaId } from '../../../server/src/contracts/protocol'
import type { CSSProperties } from 'react'

const menuPalettes: Record<ArenaId, readonly [string, string, string, string]> = {
  forest: ['#0b2423', '#123631', '#77dec0', '#092721'],
  stadium: ['#081e34', '#10314d', '#92ddff', '#08243a'],
  cave: ['#171629', '#2c263f', '#d5baff', '#211c33'],
  beach: ['#092532', '#103b4b', '#9ce9e2', '#082c36'],
  space: ['#101a30', '#1d2b49', '#bfcfff', '#151f37'],
  'night-city': ['#19192d', '#33263f', '#f4badd', '#231b32'],
}
export function arenaMenuStyle(id: string): CSSProperties {
  const config = resolveBackground(id)
  const [base, panel, accent, face] = menuPalettes[config.id]
  return { '--bg-deep': base, '--bg-base': base, '--bg-panel': panel, '--mint': accent, '--focus-ring': accent, '--hud-face': face, '--menu-face': face, '--line': `color-mix(in srgb, ${accent} 35%, ${base})`, '--arena-backdrop': config.background ? `url("${config.background}")` : 'none' } as CSSProperties
}

/** Paths are authored locally. Socket values select an ID, never a URL. */
export interface BattleBackgroundConfig {
  readonly id: ArenaId
  readonly name: string
  readonly background: string | null
  readonly primary: string
  readonly fallback: string
  readonly overlay: 'dark' | 'soft'
  readonly animation: 'leaves' | 'dust' | 'lights' | 'waves' | 'stars' | null
  readonly theme: 'nature' | 'stadium' | 'cave' | 'beach' | 'space' | 'night'
}

export const battleBackgrounds: readonly BattleBackgroundConfig[] = Object.freeze(
  [
    {
      id: 'forest',
      name: 'Floresta',
      background: '/arenas/forest.webp',
      primary: '/arenas/forest.webp',
      fallback: '/arenas/forest.svg',
      overlay: 'soft',
      animation: 'leaves',
      theme: 'nature',
    },
    {
      id: 'stadium',
      name: 'Estádio',
      background: '/arenas/stadium.webp',
      primary: '/arenas/stadium.webp',
      fallback: '/arenas/stadium.svg',
      overlay: 'soft',
      animation: 'lights',
      theme: 'stadium',
    },
    {
      id: 'cave',
      name: 'Caverna',
      background: '/arenas/cave.webp',
      primary: '/arenas/cave.webp',
      fallback: '/arenas/cave.svg',
      overlay: 'dark',
      animation: 'dust',
      theme: 'cave',
    },
    {
      id: 'beach',
      name: 'Praia',
      background: '/arenas/beach.webp',
      primary: '/arenas/beach.webp',
      fallback: '/arenas/beach.svg',
      overlay: 'soft',
      animation: 'waves',
      theme: 'beach',
    },
    {
      id: 'space',
      name: 'Espaço',
      background: '/arenas/space.webp',
      primary: '/arenas/space.webp',
      fallback: '/arenas/space.svg',
      overlay: 'dark',
      animation: 'stars',
      theme: 'space',
    },
    {
      id: 'night-city',
      name: 'Cidade Noturna',
      background: '/arenas/night-city.webp',
      primary: '/arenas/night-city.webp',
      fallback: '/arenas/night-city.svg',
      overlay: 'dark',
      animation: 'lights',
      theme: 'night',
    },
  ].map((config) => Object.freeze(config as BattleBackgroundConfig))
)

const failed = new Map<string, number>()
export const markBackgroundFailed = (path: string): void => {
  if (battleBackgrounds.some((config) => config.primary === path || config.fallback === path))
    failed.set(path, Date.now() + 1000)
}
export const markBackgroundLoaded = (path: string): void => {
  failed.delete(path)
}
function coolingDown(path: string) {
  const until = failed.get(path)
  if (until === undefined) return false
  if (until > Date.now()) return true
  failed.delete(path)
  return false
}

export function resolveBackground(id: string | null | undefined): BattleBackgroundConfig {
  const config = battleBackgrounds.find((entry) => entry.id === id) ?? battleBackgrounds[0]
  return coolingDown(config.primary)
    ? { ...config, background: coolingDown(config.fallback) ? null : config.fallback }
    : config
}
