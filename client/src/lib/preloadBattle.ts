import type { RoomSnapshot } from '../types/protocol'
import {
  pokemonAssets,
  animatedPokemonAssets,
  resolveBattleSprite,
  markAssetFailed,
  markAssetLoaded,
  FALLBACK_SPRITE,
} from './assets'
import {
  markBackgroundFailed,
  markBackgroundLoaded,
  resolveBackground,
} from '../config/battleBackgrounds'
import { VFX_ATLASES } from './presentation/spriteRegistry'
import { markVfxFailed, markVfxLoaded, preloadSpriteAtlas } from './presentation/SpriteRenderer'

function decodeImage(path: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted || typeof Image === 'undefined') return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      image.onload = image.onerror = null
      if (error) reject(error)
      else resolve()
    }
    const abort = () => {
      finish()
      image.src = ''
    }
    signal.addEventListener('abort', abort, { once: true })
    image.onerror = () => finish(new Error('Imagem indisponível'))
    image.onload = () => {
      const decoded = image.decode ? image.decode() : Promise.resolve()
      void decoded.then(
        () => finish(),
        () => finish(new Error('Imagem inválida'))
      )
    }
    image.src = path
  })
}

/** Somente caminhos do registro local; todos os trabalhos terminam em até 3 s. */
export async function preloadBattle(snapshot: RoomSnapshot, signal: AbortSignal): Promise<void> {
  const controller = new AbortController()
  let finish!: () => void
  const aborted = new Promise<void>((resolve) => {
    finish = resolve
  })
  const cancel = () => {
    controller.abort()
    finish()
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const ids = new Set(snapshot.team.map((member) => member.speciesId))
  for (const pokemon of snapshot.battle?.opponentTeam ?? [])
    if (!('hidden' in pokemon)) ids.add(pokemon.speciesId)
  const config = resolveBackground(snapshot.arena)
  const atlasPaths = new Set<string>(Object.values(VFX_ATLASES))
  const activeSprites: string[] = []
  for (const side of ['p1', 'p2'] as const) {
    const active = snapshot.battle?.active[side]
    const team = side === snapshot.viewer ? snapshot.battle?.ownTeam : snapshot.battle?.opponentTeam
    const pokemon = team?.find((member) => member.id === active)
    if (pokemon && !('hidden' in pokemon)) {
      const asset = resolveBattleSprite(
        pokemon.speciesId,
        side !== snapshot.viewer,
        snapshot.revealedShiny[pokemon.id] ?? false
      )
      activeSprites.push(asset.src, asset.staticSrc)
    }
  }
  // The visible scene gets the deadline budget first. Audio and bench variants
  // are optional work; missing their deadline cannot invalidate usable artwork.
  const essential = new Set([
    FALLBACK_SPRITE,
    config.primary,
    ...activeSprites,
    ...atlasPaths,
    config.fallback,
  ])
  const reserves = [...ids].flatMap((id) => [
    ...Object.values(animatedPokemonAssets(id)).map((asset) => asset.path),
    ...Object.values(pokemonAssets(id)).filter(
      (path): path is string => !!path && !/\.(?:ogg|mp3)$/.test(path)
    ),
  ])
  const cries = [...ids].map((id) => pokemonAssets(id).cry).filter((path): path is string => !!path)
  const paths = [...new Set([...essential, ...reserves, ...cries])]
  const timer = setTimeout(cancel, 3000)
  let cursor = 0
  const worker = async () => {
    while (cursor < paths.length && !controller.signal.aborted) {
      const path = paths[cursor++]
      for (let attempt = 0; attempt < 2 && !controller.signal.aborted; attempt++) {
        try {
          const response = await fetch(path, { signal: controller.signal, cache: 'force-cache' })
          if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
            throw new Error('Recurso indisponível')
          await response.arrayBuffer()
          markAssetLoaded(path)
          markBackgroundLoaded(path)
          markVfxLoaded(path)
          if (atlasPaths.has(path)) await preloadSpriteAtlas(path, controller.signal)
          else if (essential.has(path)) await decodeImage(path, controller.signal)
          break
        } catch {
          if (attempt === 1 && !controller.signal.aborted) {
            markAssetFailed(path)
            markBackgroundFailed(path)
            markVfxFailed(path)
          }
        }
      }
    }
  }
  try {
    await Promise.race([Promise.all(Array.from({ length: 6 }, worker)), aborted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    // A deadline/cancel is not proof that an asset is broken. The DOM may load
    // it immediately afterwards, and another room can try the same path again.
  }
}
