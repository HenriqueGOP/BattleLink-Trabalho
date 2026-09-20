import { useCallback, useSyncExternalStore } from 'react'
import { audio, type AudioChannel, type AudioPrefs } from '../lib/audio'
import type { SfxName, ThemeName } from '../lib/audio'

export interface AudioApi extends AudioPrefs {
  setVolume: (channel: AudioChannel, value: number) => void
  setMuted: (channel: AudioChannel, muted: boolean) => void
  play: (name: SfxName) => void
  playMusic: (theme: ThemeName) => void
  stopMusic: () => void
  playCry: (url: string | null | undefined) => void
}

const EMPTY: AudioPrefs = { musicVolume: 0.4, sfxVolume: 0.7, musicMuted: false, sfxMuted: false }

function subscribe(listener: () => void): () => void {
  return audio.subscribe(listener)
}

function getSnapshot(): AudioPrefs {
  return audio.getPrefs()
}

/** Preferências de áudio reativas (useSyncExternalStore sobre o AudioManager). */
export function useAudio(): AudioApi {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)

  const setVolume = useCallback((channel: AudioChannel, value: number) => audio.setVolume(channel, value), [])
  const setMuted = useCallback((channel: AudioChannel, muted: boolean) => audio.setMuted(channel, muted), [])
  const play = useCallback((name: SfxName) => audio.play(name), [])
  const playMusic = useCallback((theme: ThemeName) => audio.playMusic(theme), [])
  const stopMusic = useCallback(() => audio.stopMusic(), [])
  const playCry = useCallback((url: string | null | undefined) => audio.playCry(url), [])

  return {
    ...prefs,
    setVolume,
    setMuted,
    play,
    playMusic,
    stopMusic,
    playCry,
  }
}
