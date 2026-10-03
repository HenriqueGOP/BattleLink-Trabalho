/**
 * Áudio procedural — fallback/source definitivo de som via Web Audio API.
 * Nenhum arquivo externo é necessário: SFX chiptune por osciladores e música
 * por um sequenciador simples. Nunca deixamos a experiência sem som.
 */

export type SfxName =
  | 'hover'
  | 'click'
  | 'select'
  | 'error'
  | 'toast'
  | 'damage'
  | 'crit'
  | 'heal'
  | 'faint'
  | 'switch'
  | 'tera'
  | 'status'
  | 'statUp'
  | 'statDown'
  | 'turn'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'special'
  | 'miss'
  | 'immune'
  | 'field'
  | 'residual'
  | 'start'

export type ThemeName = 'menu' | 'battle'

const midi = (note: number): number => 440 * Math.pow(2, (note - 69) / 12)

function audioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Ctor ? new Ctor() : null
}

export interface SfxEngine {
  /** Requer chamada dentro de um gesto do usuário na primeira vez. */
  unlock(): void
  play(name: SfxName): void
  setVolume(volume: number): void
}

export function createSfxEngine(): SfxEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let volume = 0.7

  const ensure = (): AudioContext | null => {
    try {
      if (!ctx) {
        ctx = audioContext()
        if (!ctx) return null
        master = ctx.createGain()
        master.gain.value = volume
        master.connect(ctx.destination)
      }
      if (ctx.state === 'suspended') void ctx.resume()
      return ctx
    } catch {
      return null
    }
  }

  type ToneOptions = {
    freq: number
    freqEnd?: number
    type?: OscillatorType
    dur: number
    vol?: number
    delay?: number
  }

  const tone = (c: AudioContext, options: ToneOptions): void => {
    if (!master) return
    const t0 = c.currentTime + (options.delay ?? 0)
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = options.type ?? 'square'
    osc.frequency.setValueAtTime(Math.max(1, options.freq), t0)
    if (options.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.freqEnd), t0 + options.dur)
    }
    const amp = options.vol ?? 0.12
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(amp, t0 + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + options.dur)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t0)
    osc.stop(t0 + options.dur + 0.05)
  }

  const burst = (c: AudioContext, dur: number, vol: number, filterFreq: number, delay = 0): void => {
    if (!master) return
    const t0 = c.currentTime + delay
    const length = Math.max(1, Math.floor(c.sampleRate * dur))
    const buffer = c.createBuffer(1, length, c.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = c.createBufferSource()
    source.buffer = buffer
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = filterFreq
    const gain = c.createGain()
    gain.gain.setValueAtTime(vol, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    source.start(t0)
  }

  const recipes: Record<SfxName, () => void> = {
    hover: () => {
      const c = ensure()
      if (c) tone(c, { freq: 540, dur: 0.05, vol: 0.05 })
    },
    click: () => {
      const c = ensure()
      if (c) tone(c, { freq: 320, freqEnd: 190, dur: 0.07, vol: 0.12 })
    },
    select: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 523, dur: 0.06, vol: 0.1 })
        tone(c, { freq: 784, dur: 0.09, vol: 0.1, delay: 0.06 })
      }
    },
    toast: () => {
      const c = ensure()
      if (c) tone(c, { freq: 660, dur: 0.09, vol: 0.07 })
    },
    error: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 150, type: 'sawtooth', dur: 0.16, vol: 0.14 })
        tone(c, { freq: 105, type: 'sawtooth', dur: 0.22, vol: 0.14, delay: 0.14 })
      }
    },
    damage: () => {
      const c = ensure()
      if (c) {
        burst(c, 0.12, 0.25, 1000)
        tone(c, { freq: 220, freqEnd: 70, type: 'sawtooth', dur: 0.2, vol: 0.16 })
      }
    },
    crit: () => {
      const c = ensure()
      if (c) {
        burst(c, 0.22, 0.35, 1600)
        tone(c, { freq: 340, freqEnd: 55, type: 'sawtooth', dur: 0.32, vol: 0.22 })
        tone(c, { freq: 90, type: 'sine', dur: 0.3, vol: 0.3 })
      }
    },
    heal: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 523, type: 'sine', dur: 0.12, vol: 0.12 })
        tone(c, { freq: 659, type: 'sine', dur: 0.12, vol: 0.12, delay: 0.09 })
        tone(c, { freq: 784, type: 'sine', dur: 0.18, vol: 0.12, delay: 0.18 })
      }
    },
    statUp: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 440, dur: 0.07, vol: 0.1 })
        tone(c, { freq: 660, dur: 0.1, vol: 0.1, delay: 0.07 })
      }
    },
    statDown: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 330, dur: 0.09, vol: 0.1 })
        tone(c, { freq: 220, dur: 0.12, vol: 0.1, delay: 0.08 })
      }
    },
    faint: () => {
      const c = ensure()
      if (c) tone(c, { freq: 392, freqEnd: 92, type: 'triangle', dur: 0.55, vol: 0.2 })
    },
    switch: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 880, dur: 0.05, vol: 0.08 })
        tone(c, { freq: 1318, dur: 0.1, vol: 0.08, delay: 0.06 })
      }
    },
    tera: () => {
      const c = ensure()
      if (c) {
        for (const [note, delay] of [[523, 0], [659, 0.08], [784, 0.16], [1046, 0.24]] as const) {
          tone(c, { freq: note, type: 'sine', dur: 0.14, vol: 0.12, delay })
        }
        burst(c, 0.5, 0.12, 5000, 0.24)
      }
    },
    status: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 196, type: 'triangle', dur: 0.12, vol: 0.14 })
        tone(c, { freq: 174, type: 'triangle', dur: 0.14, vol: 0.14, delay: 0.14 })
      }
    },
    turn: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 392, dur: 0.07, vol: 0.12 })
        tone(c, { freq: 523, dur: 0.09, vol: 0.12, delay: 0.1 })
      }
    },
    special: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 200, freqEnd: 900, type: 'sawtooth', dur: 0.3, vol: 0.16 })
        burst(c, 0.2, 0.2, 2400, 0.1)
      }
    },
    miss: () => {
      const c = ensure()
      if (c) tone(c, { freq: 600, freqEnd: 260, type: 'sine', dur: 0.2, vol: 0.1 })
    },
    immune: () => {
      const c = ensure()
      if (c) tone(c, { freq: 240, type: 'triangle', dur: 0.16, vol: 0.12 })
    },
    field: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 330, type: 'sine', dur: 0.2, vol: 0.1 })
        tone(c, { freq: 495, type: 'sine', dur: 0.24, vol: 0.1, delay: 0.12 })
      }
    },
    residual: () => {
      const c = ensure()
      if (c) tone(c, { freq: 200, freqEnd: 130, dur: 0.14, vol: 0.1 })
    },
    start: () => {
      const c = ensure()
      if (c) {
        for (const [note, delay] of [[392, 0], [523, 0.12], [659, 0.24]] as const) {
          tone(c, { freq: note, type: 'triangle', dur: 0.16, vol: 0.12, delay })
        }
      }
    },
    victory: () => {
      const c = ensure()
      if (c) {
        const melody = [523, 659, 784, 1046]
        melody.forEach((note, index) => {
          tone(c, { freq: note, type: 'square', dur: 0.18, vol: 0.1, delay: index * 0.15 })
        })
        tone(c, { freq: 1046, type: 'triangle', dur: 0.7, vol: 0.12, delay: 0.6 })
        tone(c, { freq: 1318, type: 'triangle', dur: 0.7, vol: 0.08, delay: 0.6 })
      }
    },
    defeat: () => {
      const c = ensure()
      if (c) {
        const melody = [329, 261, 220, 174]
        melody.forEach((note, index) => {
          tone(c, { freq: note, type: 'triangle', dur: 0.26, vol: 0.12, delay: index * 0.22 })
        })
      }
    },
    draw: () => {
      const c = ensure()
      if (c) {
        tone(c, { freq: 392, type: 'triangle', dur: 0.2, vol: 0.12 })
        tone(c, { freq: 329, type: 'triangle', dur: 0.24, vol: 0.12, delay: 0.2 })
      }
    },
  }

  return {
    unlock() {
      ensure()
    },
    play(name) {
      if (!master) ensure()
      if (master) recipes[name]?.()
    },
    setVolume(next: number) {
      volume = next
      if (master) master.gain.value = next
    },
  }
}

// ---------------------------------------------------------------------------
// Música — sequenciador simples (passos, lookahead, loop)
// ---------------------------------------------------------------------------

interface Theme {
  bpm: number
  steps: number
  bass: Array<number | null>
  lead: Array<number | null>
  hatSteps: number[]
}

/** Am | F | C | G — calmo, para menu/seleção. */
const MENU_THEME: Theme = {
  bpm: 88,
  steps: 32,
  bass: [45, 45, 57, 45, 45, 45, 57, 45, 41, 41, 53, 41, 41, 41, 53, 41, 48, 48, 60, 48, 48, 48, 60, 48, 43, 43, 55, 43, 43, 43, 55, 43],
  lead: [69, 72, 76, 72, 69, 76, 81, 76, 65, 69, 72, 69, 65, 72, 77, 72, 72, 76, 79, 76, 72, 79, 84, 79, 71, 74, 79, 74, 71, 79, 83, 79],
  hatSteps: [2, 6, 10, 14, 18, 22, 26, 30],
}

/** Am progressão com baixo pulsante — batalha. */
const BATTLE_THEME: Theme = {
  bpm: 132,
  steps: 32,
  bass: [45, 45, 52, 45, 45, 45, 52, 45, 41, 41, 48, 41, 41, 41, 48, 41, 48, 48, 55, 48, 48, 48, 55, 48, 43, 43, 50, 43, 50, 43, 50, 43],
  lead: [69, 0, 72, 0, 76, 72, 69, 0, 65, 0, 69, 0, 72, 69, 65, 0, 72, 0, 76, 0, 79, 76, 72, 0, 71, 0, 74, 0, 79, 74, 71, 0],
  hatSteps: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31],
}

export interface MusicEngine {
  play(theme: ThemeName, volume: number): void
  stop(): void
  setVolume(volume: number): void
}

export function createMusicEngine(): MusicEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let volume = 0.35
  let current: ThemeName | null = null
  let step = 0
  let timer: number | null = null
  let nextTime = 0

  const ensure = (): AudioContext | null => {
    try {
      if (!ctx) {
        ctx = audioContext()
        if (!ctx) return null
        master = ctx.createGain()
        master.gain.value = volume
        master.connect(ctx.destination)
      }
      if (ctx.state === 'suspended') void ctx.resume()
      return ctx
    } catch {
      return null
    }
  }

  const note = (c: AudioContext, midiNote: number, at: number, dur: number, type: OscillatorType, amp: number): void => {
    if (!master || midiNote <= 0) return
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.value = midi(midiNote)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(amp, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(gain)
    gain.connect(master)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  const tick = (): void => {
    if (!ctx || !current) return
    const theme = current === 'battle' ? BATTLE_THEME : MENU_THEME
    const stepDur = 60 / theme.bpm / 2
    while (nextTime < ctx.currentTime + 0.3) {
      const index = step % theme.steps
      const at = nextTime
      const bassNote = theme.bass[index]
      const leadNote = theme.lead[index]
      if (bassNote) note(ctx, bassNote, at, stepDur * 0.9, current === 'battle' ? 'square' : 'triangle', current === 'battle' ? 0.09 : 0.07)
      if (leadNote) note(ctx, leadNote, at, stepDur * 0.55, 'square', current === 'battle' ? 0.035 : 0.03)
      if (current === 'battle' && theme.hatSteps.includes(index)) {
        note(ctx, 72, at, 0.03, 'square', 0.02)
      }
      nextTime += stepDur
      step += 1
    }
    timer = window.setTimeout(tick, 120)
  }

  return {
    play(theme, nextVolume) {
      volume = nextVolume
      const c = ensure()
      if (!c) return
      if (theme === current) return
      current = theme
      step = 0
      nextTime = c.currentTime + 0.05
      if (master) master.gain.value = volume
      if (timer != null) window.clearTimeout(timer)
      tick()
    },
    stop() {
      current = null
      if (timer != null) window.clearTimeout(timer)
      timer = null
    },
    setVolume(nextVolume) {
      volume = nextVolume
      if (master) master.gain.value = nextVolume
    },
  }
}
