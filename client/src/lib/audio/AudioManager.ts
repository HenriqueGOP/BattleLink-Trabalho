import { Howl } from 'howler'
import { safeAsset } from '../assets'
import { createMusicEngine, createSfxEngine, type SfxName, type ThemeName } from './procedural'

/**
 * AudioManager: canais music/sfx com volume + mute persistidos em
 * localStorage ('pm-audio-prefs'). Cries usam Howler (arquivos empacotados localmente);
 * todo o resto é procedural (Web Audio). Áudio inicia desligado sem preferência salva.
 */

const STORAGE_KEY = 'pm-audio-prefs'

export interface AudioPrefs {
  musicVolume: number
  sfxVolume: number
  musicMuted: boolean
  sfxMuted: boolean
}

export type AudioChannel = 'music' | 'sfx'

const DEFAULT_PREFS: AudioPrefs = {
  musicVolume: 0.4,
  sfxVolume: 0.7,
  musicMuted: true,
  sfxMuted: true,
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<AudioPrefs>) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

class AudioManager {
  private prefs: AudioPrefs = loadPrefs()
  private listeners = new Set<() => void>()
  private sfx = createSfxEngine()
  private music = createMusicEngine()
  private cries = new Map<string, Howl>()
  private currentTheme: ThemeName | null = null

  getPrefs(): AudioPrefs {
    return this.prefs
  }

  /** Chamar no primeiro gesto do usuario para liberar o AudioContext. */
  unlock(): void {
    this.sfx.unlock()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs))
    } catch {
      // storage cheio/indisponível — preferências só não persistem
    }
    for (const listener of this.listeners) listener()
  }

  setVolume(channel: AudioChannel, value: number): void {
    const clamped = Math.max(0, Math.min(1, value))
    if (channel === 'music') {
      this.prefs.musicVolume = clamped
      this.music.setVolume(clamped)
    } else {
      this.prefs.sfxVolume = clamped
      this.sfx.setVolume(clamped)
    }
    this.persist()
  }

  setMuted(channel: AudioChannel, muted: boolean): void {
    if (channel === 'music') {
      this.prefs.musicMuted = muted
      this.music.setVolume(muted ? 0 : this.prefs.musicVolume)
    } else {
      this.prefs.sfxMuted = muted
      this.sfx.setVolume(muted ? 0 : this.prefs.sfxVolume)
    }
    this.persist()
  }

  play(name: SfxName): void {
    if (this.prefs.sfxMuted) return
    this.sfx.setVolume(this.prefs.sfxVolume)
    this.sfx.play(name)
  }

  playMusic(theme: ThemeName): void {
    if (this.currentTheme === theme) return
    this.currentTheme = theme
    this.music.play(theme, this.prefs.musicMuted ? 0 : this.prefs.musicVolume)
  }

  stopMusic(): void {
    this.currentTheme = null
    this.music.stop()
  }

  /** Cry do Pokémon (PokéAPI) — roteado pelo canal sfx. */
  playCry(url: string | null | undefined): void {
    if (!safeAsset(url) || !url || this.prefs.sfxMuted) return
    let sound = this.cries.get(url)
    if (!sound) {
      sound = new Howl({ src: [url], volume: 0.6 * this.prefs.sfxVolume, html5: true })
      this.cries.set(url, sound)
    } else {
      sound.volume(0.6 * this.prefs.sfxVolume)
    }
    sound.stop().play()
  }
}

export const audio = new AudioManager()
