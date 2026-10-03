import { useLayoutEffect, useSyncExternalStore } from 'react'
import {
  getMotionPreference,
  reducedMotion,
  subscribeMotionPreference,
  setMotionPreference,
  syncMotionPreferenceRoot,
} from '../lib/presentation/motionPreference'

export function useMotionPreference() {
  const preference = useSyncExternalStore(
    subscribeMotionPreference,
    getMotionPreference,
    () => 'system' as const
  )
  const reduced = useSyncExternalStore(subscribeMotionPreference, reducedMotion, () => false)
  return { preference, reduced, setPreference: setMotionPreference }
}

/** Mount once in App so CSS and imperative animations share the same preference. */
export function useRootMotionPreference() {
  const { preference } = useMotionPreference()
  useLayoutEffect(
    () => syncMotionPreferenceRoot(document.documentElement, preference),
    [preference]
  )
}
