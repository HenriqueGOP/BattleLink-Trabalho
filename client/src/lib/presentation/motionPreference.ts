export type MotionPreference = 'system' | 'full' | 'reduced'
export const MOTION_PREFERENCE_KEY = 'pokemon-battle-motion-v1'
const listeners = new Set<() => void>()
let preference: MotionPreference | null = null
const valid = (value: string | null): value is MotionPreference =>
  value === 'system' || value === 'full' || value === 'reduced'

export function getMotionPreference(): MotionPreference {
  if (preference !== null) return preference
  try {
    const saved =
      typeof window === 'undefined' ? null : window.localStorage?.getItem(MOTION_PREFERENCE_KEY)
    preference = valid(saved ?? null) ? (saved as MotionPreference) : 'system'
  } catch {
    preference = 'system'
  }
  return preference
}

export function systemReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  )
}
export function reducedMotion() {
  const choice = getMotionPreference()
  return choice === 'reduced' || (choice === 'system' && systemReducedMotion())
}

export function syncMotionPreferenceRoot(
  root: Pick<HTMLElement, 'dataset'>,
  value: MotionPreference
) {
  const previous = root.dataset.motionPreference
  root.dataset.motionPreference = value
  return () => {
    if (root.dataset.motionPreference !== value) return
    if (previous === undefined) delete root.dataset.motionPreference
    else root.dataset.motionPreference = previous
  }
}
const notify = () => {
  for (const listener of listeners) listener()
}
export function setMotionPreference(value: MotionPreference) {
  if (!valid(value)) return
  preference = value
  try {
    window.localStorage?.setItem(MOTION_PREFERENCE_KEY, value)
  } catch {
    /* A preferência continua nesta aba. */
  }
  notify()
}
export function subscribeMotionPreference(listener: () => void) {
  listeners.add(listener)
  const media =
    typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const storage = (event: StorageEvent) => {
    if (event.key !== MOTION_PREFERENCE_KEY && event.key !== null) return
    preference = null
    notify()
  }
  media?.addEventListener?.('change', listener)
  if (typeof window !== 'undefined') window.addEventListener?.('storage', storage)
  return () => {
    listeners.delete(listener)
    media?.removeEventListener?.('change', listener)
    if (typeof window !== 'undefined') window.removeEventListener?.('storage', storage)
  }
}
