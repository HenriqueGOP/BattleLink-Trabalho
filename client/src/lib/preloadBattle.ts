import type { RoomSnapshot } from '../types/protocol'
import { pokemonAssets, markAssetFailed, FALLBACK_SPRITE } from './assets'
import { resolveBackground } from '../config/battleBackgrounds'

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
  const paths = [
    ...new Set(
      [...ids]
        .flatMap((id) => Object.values(pokemonAssets(id)))
        .filter((path): path is string => !!path)
    ),
  ]
  const background = resolveBackground(snapshot.arena).background
  if (background) paths.push(background)
  paths.unshift(FALLBACK_SPRITE)
  const pending = new Set(paths)
  const timer = setTimeout(cancel, 3000)
  let cursor = 0
  const worker = async () => {
    while (cursor < paths.length && !controller.signal.aborted) {
      const path = paths[cursor++]
      try {
        const response = await fetch(path, { signal: controller.signal, cache: 'force-cache' })
        if (!response.ok) throw new Error('Recurso indisponível')
        await response.arrayBuffer()
        pending.delete(path)
      } catch {
        if (!signal.aborted) markAssetFailed(path)
      }
    }
  }
  try {
    await Promise.race([Promise.all(Array.from({ length: 6 }, worker)), aborted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    if (!signal.aborted) for (const path of pending) markAssetFailed(path)
  }
}
