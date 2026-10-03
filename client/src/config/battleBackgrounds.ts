import type { ArenaId } from '../../../server/src/contracts/protocol'

/** Paths are authored locally. Socket values select an ID, never a URL. */
export interface BattleBackgroundConfig {
  readonly id: ArenaId
  readonly name: string
  readonly background: string | null
  readonly overlay: 'dark' | 'soft'
  readonly animation: 'leaves' | 'dust' | 'lights' | 'waves' | 'stars' | null
  readonly theme: 'nature' | 'stadium' | 'cave' | 'beach' | 'space' | 'night'
}

export const battleBackgrounds: readonly BattleBackgroundConfig[] = Object.freeze(
  [
    {
      id: 'forest',
      name: 'Floresta',
      background: '/arenas/forest.svg',
      overlay: 'soft',
      animation: 'leaves',
      theme: 'nature',
    },
    {
      id: 'stadium',
      name: 'Estádio',
      background: '/arenas/stadium.svg',
      overlay: 'soft',
      animation: 'lights',
      theme: 'stadium',
    },
    {
      id: 'cave',
      name: 'Caverna',
      background: '/arenas/cave.svg',
      overlay: 'dark',
      animation: 'dust',
      theme: 'cave',
    },
    {
      id: 'beach',
      name: 'Praia',
      background: '/arenas/beach.svg',
      overlay: 'soft',
      animation: 'waves',
      theme: 'beach',
    },
    {
      id: 'space',
      name: 'Espaço',
      background: '/arenas/space.svg',
      overlay: 'dark',
      animation: 'stars',
      theme: 'space',
    },
    {
      id: 'night-city',
      name: 'Cidade Noturna',
      background: '/arenas/night-city.svg',
      overlay: 'dark',
      animation: 'lights',
      theme: 'night',
    },
  ].map((config) => Object.freeze(config as BattleBackgroundConfig))
)

const failed = new Set<string>()
export const markBackgroundFailed = (path: string): void => {
  if (battleBackgrounds.some((config) => config.background === path)) failed.add(path)
}

export function resolveBackground(id: string | null | undefined): BattleBackgroundConfig {
  const config = battleBackgrounds.find((entry) => entry.id === id) ?? battleBackgrounds[0]
  return config.background && failed.has(config.background)
    ? { ...config, background: null }
    : config
}
