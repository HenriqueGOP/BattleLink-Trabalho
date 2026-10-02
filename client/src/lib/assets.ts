import registry from '../data/asset-registry.json'
import { speciesById } from './catalog'
type Assets = {
  front?: string
  back?: string
  shinyFront?: string
  shinyBack?: string
  cry?: string
}
const records = new Map<string, Assets>(Object.entries(registry))
const paths = new Set(Object.values(registry).flatMap((value) => Object.values(value)))
const failed = new Set<string>()
export const FALLBACK_SPRITE = '/pokemon/fallback.svg'
paths.add(FALLBACK_SPRITE)
export const safeAsset = (path: string | null | undefined): string | null =>
  path && paths.has(path) ? path : null
export const markAssetFailed = (path: string) => {
  failed.add(path)
}
export function pokemonAssets(id: string) {
  const entry = speciesById(id) ? records.get(id) : undefined
  const available = (path?: string) => (path && !failed.has(path) ? path : null)
  const front = available(entry?.front) ?? FALLBACK_SPRITE
  const back = available(entry?.back)
  return {
    front,
    back,
    shinyFront: available(entry?.shinyFront) ?? front,
    shinyBack: available(entry?.shinyBack) ?? back,
    cry: available(entry?.cry),
  }
}
