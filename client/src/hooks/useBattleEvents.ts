import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { buildLogEntries, animateEvent } from '../lib/eventEngine'
import { presentSnapshot } from '../lib/battleView'
import { BattleEventQueue } from '../lib/presentation/BattleEventQueue'
import { AnimationDirector } from '../lib/presentation/AnimationDirector'
import { audio, type SfxName } from '../lib/audio'
import { pokemonAssets } from '../lib/assets'
import type { CanonicalEvent, RoomSnapshot } from '../types/protocol'
import type { GameState } from '../types/battle'
import { reducedMotion, subscribeMotionPreference } from '../lib/presentation/motionPreference'
export type { DamageTotals } from '../lib/presentation/BattleEventQueue'

const sounds: Partial<Record<CanonicalEvent['type'], SfxName>> = {
  damage: 'damage',
  heal: 'heal',
  miss: 'miss',
  immune: 'immune',
  faint: 'faint',
  switch: 'switch',
  status: 'status',
  boost: 'statUp',
  round_start: 'turn',
  battle_start: 'start',
}
function sound(event: CanonicalEvent, wire: RoomSnapshot) {
  const name =
    event.type === 'boost' && event.after < event.before ? 'statDown' : sounds[event.type]
  if (name) audio.play(name)
  if (event.type === 'switch') audio.playCry(pokemonAssets(event.pokemon.speciesId).cry)
  if (event.type === 'battle_end')
    audio.play(
      event.result.winner === null
        ? 'draw'
        : event.result.winner === wire.viewer
          ? 'victory'
          : 'defeat'
    )
}

/** React publica somente nos limites dos eventos; nenhum estado é atualizado por frame. */
export function useBattleEvents(
  state: GameState | null,
  myIndex: number,
  getStage: () => HTMLElement | null,
  getPlayer: (side: 'me' | 'opponent') => HTMLElement | null,
  forceMotion = false
) {
  const controllers = useMemo(() => {
    const director = new AnimationDirector({
      stage: getStage,
      sprite: getPlayer,
      sound,
      reducedMotion: forceMotion ? () => false : reducedMotion,
    })
    const queue = new BattleEventQueue(director)
    return { director, queue }
  }, [getStage, getPlayer, forceMotion])
  const { queue, director } = controllers
  const presentation = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot)
  useLayoutEffect(() => {
    queue.activate()
    return () => {
      queue.dispose()
      director.dispose()
    }
  }, [queue, director])
  useLayoutEffect(() => {
    queue.ingest(state?.wire ?? null)
  }, [queue, state])
  useEffect(() => {
    const visibility = () => queue.setHidden(document.hidden)
    const reduce = () => {
      if (!forceMotion && reducedMotion()) queue.skip()
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    const unsubscribe = subscribeMotionPreference(reduce)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      unsubscribe()
    }
  }, [queue, forceMotion])
  const presented = useMemo(
    () => (presentation.wire ? presentSnapshot(presentation.wire) : state),
    [presentation.wire, state]
  )
  const current = useMemo(
    () =>
      presentation.activeEvent && presented
        ? animateEvent(presentation.activeEvent, presented, myIndex)
        : null,
    [presentation, presented, myIndex]
  )
  const logEntries = useMemo(
    () => (presented && myIndex >= 0 ? buildLogEntries(presented, myIndex) : []),
    [presented, myIndex]
  )
  return {
    presented,
    current,
    busy: presentation.busy,
    hidden: presentation.hidden,
    skip: queue.skip,
    setHidden: (hidden: boolean) => queue.setHidden(hidden),
    totals: presentation.totals,
    logEntries,
  }
}
