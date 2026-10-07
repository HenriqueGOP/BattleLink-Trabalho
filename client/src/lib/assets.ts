import registry from '../data/asset-registry.json'
import animatedRegistry from '../data/animated-registry.json'
import artworkRegistry from '../data/artwork-registry.json'
import { speciesById } from './catalog'
type Assets = {
  front?: string
  back?: string
  shinyFront?: string
  shinyBack?: string
  cry?: string
}
const records = new Map<string, Assets>(Object.entries(registry))
export interface PokemonArtworkAsset {
  readonly path: string
  readonly width: number
  readonly height: number
  readonly bounds: readonly number[]
}
type ArtworkAssets = Partial<Record<'normal' | 'shiny', PokemonArtworkAsset>>
const artworks = new Map<string, ArtworkAssets>(
  Object.entries(artworkRegistry as Record<string, ArtworkAssets>)
)
const artworkByPath = new Map(
  [...artworks.values()].flatMap((variants) =>
    Object.values(variants).map((entry) => [entry.path, entry] as const)
  )
)
const menuArtworkBySprite = new Map<string, string>()
for (const [id, entry] of records) {
  const art = artworks.get(id)
  if (entry.front && art?.normal) menuArtworkBySprite.set(entry.front, art.normal.path)
  if (entry.shinyFront && art?.shiny) menuArtworkBySprite.set(entry.shinyFront, art.shiny.path)
}
export interface PokemonAnimationAsset {
  readonly path: string
  readonly width: number
  readonly height: number
  readonly frames: number
  readonly durationMs: number
}
type AnimatedAssets = Partial<
  Record<'front' | 'back' | 'shinyFront' | 'shinyBack', PokemonAnimationAsset>
>
const animations = new Map<string, AnimatedAssets>(
  Object.entries(animatedRegistry as Record<string, AnimatedAssets>)
)
const paths = new Set([
  ...Object.values(registry).flatMap((value) => Object.values(value)),
  ...[...animations.values()].flatMap((value) => Object.values(value).map((asset) => asset.path)),
  ...artworkByPath.keys(),
])
// A transient resource error must not poison later rounds or rooms.
const failed = new Map<string, number>()
const FAILURE_COOLDOWN_MS = 1000
export const FALLBACK_SPRITE = '/pokemon/fallback.svg'
paths.add(FALLBACK_SPRITE)
export const safeAsset = (path: string | null | undefined): string | null =>
  path && paths.has(path) ? path : null
export const markAssetFailed = (path: string) => {
  if (paths.has(path)) failed.set(path, Date.now() + FAILURE_COOLDOWN_MS)
}
export const markAssetLoaded = (path: string) => {
  failed.delete(path)
}
const availablePath = (path?: string): string | null => {
  if (!path || !paths.has(path)) return null
  const until = failed.get(path)
  if (until !== undefined && until > Date.now()) return null
  if (until !== undefined) failed.delete(path)
  return path
}
/** Menus use local high resolution art; battle perspective remains untouched. */
export function resolveMenuSprite(path: string | null | undefined): string | null {
  const source = safeAsset(path)
  if (!source) return null
  return availablePath(menuArtworkBySprite.get(source)) ?? source
}
export const menuArtworkMetrics = (path: string): PokemonArtworkAsset | undefined =>
  artworkByPath.get(path)
export function pokemonAssets(id: string) {
  const entry = speciesById(id) ? records.get(id) : undefined
  const front = availablePath(entry?.front) ?? FALLBACK_SPRITE
  const back = availablePath(entry?.back)
  return {
    front,
    back,
    shinyFront: availablePath(entry?.shinyFront) ?? front,
    shinyBack: availablePath(entry?.shinyBack) ?? back,
    cry: availablePath(entry?.cry),
  }
}

export function animatedPokemonAssets(id: string): AnimatedAssets {
  const entry = speciesById(id) ? animations.get(id) : undefined
  return Object.fromEntries(
    Object.entries(entry ?? {}).filter(([, asset]) => asset.frames > 1 && availablePath(asset.path))
  ) as AnimatedAssets
}

/** Side/shiny select a bundled record; a socket ID can never become a URL. */
export function resolveBattleSprite(id: string, opponent: boolean, shiny: boolean) {
  const still = pokemonAssets(id)
  const front = shiny ? still.shinyFront : still.front
  const back = shiny ? still.shinyBack : still.back
  const fallbackSrc = (opponent ? (front ?? back) : (back ?? front)) ?? FALLBACK_SPRITE
  // A high resolution front view is available locally. Native back views keep
  // their correct perspective; a front illustration never replaces the back.
  const artwork = opponent ? resolveMenuSprite(front) : null
  const highResolutionFront = artwork && menuArtworkMetrics(artwork) ? artwork : null
  const staticSrc = highResolutionFront ?? fallbackSrc
  const animated = animatedPokemonAssets(id)
  const animatedFront = shiny ? animated.shinyFront : animated.front
  const animatedBack = shiny ? animated.shinyBack : animated.back
  // Correct perspective wins over animation: mirroring a front view is not a back view.
  const chosen = highResolutionFront
    ? undefined
    : opponent
      ? (animatedFront ?? (!front ? animatedBack : undefined))
      : (animatedBack ?? (!back ? animatedFront : undefined))
  return {
    src: chosen?.path ?? staticSrc,
    staticSrc,
    fallbackSrc,
    mirrored: chosen
      ? opponent
        ? !animatedFront
        : !animatedBack
      : opponent
        ? !front && Boolean(back)
        : !back && Boolean(front),
    staticMirrored: opponent ? !front && Boolean(back) : !back && Boolean(front),
    animated: Boolean(chosen),
    frames: chosen?.frames ?? 1,
  }
}
