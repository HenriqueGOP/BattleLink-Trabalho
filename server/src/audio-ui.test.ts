import assert from "node:assert/strict";
import { audio } from "../../client/src/lib/audio/AudioManager";

const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;
const masterGains: { value: number }[] = [];
const stored = new Map<string, string>();

class ControlledAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};

  createGain() {
    const gain = {
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    };
    masterGains.push(gain);
    return { gain, connect() {} };
  }

  createOscillator() {
    return {
      type: "square",
      frequency: { value: 0 },
      connect() {},
      start() {},
      stop() {},
    };
  }
}

Object.assign(globalThis, {
  window: {
    AudioContext: ControlledAudioContext,
    setTimeout: () => 1,
    clearTimeout() {},
  },
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  },
});

try {
  const initial = audio.getPrefs();
  assert.equal(initial.musicMuted, true);
  assert.equal(initial.sfxMuted, true);

  // O mecanismo usado por useSyncExternalStore só reconhece snapshots novos.
  const delivered: ReturnType<typeof audio.getPrefs>[] = [];
  let previous = initial;
  const unsubscribe = audio.subscribe(() => {
    const current = audio.getPrefs();
    if (!Object.is(previous, current)) delivered.push(current);
    previous = current;
  });

  audio.playMusic("menu");
  assert.equal(masterGains[0].value, 0, "Música inicia silenciada");
  audio.setVolume("music", 0.9);
  assert.equal(masterGains[0].value, 0, "Ajustar volume não remove o mute");
  audio.setMuted("music", false);
  assert.equal(masterGains[0].value, 0.9, "Desmutar usa o volume escolhido");
  audio.setVolume("sfx", 0.2);
  audio.setMuted("sfx", false);

  assert.equal(
    delivered.length,
    4,
    "Cada escolha publica um snapshot reconhecível pelo React",
  );
  assert.equal(initial.musicVolume, 0.4, "Snapshot anterior não é modificado");
  assert.equal(initial.musicMuted, true);
  assert.equal(delivered[0].musicVolume, 0.9);
  assert.equal(
    delivered[0].musicMuted,
    true,
    "Snapshots intermediários também são preservados",
  );
  assert.equal(delivered[1].sfxVolume, 0.7);
  assert.deepEqual(audio.getPrefs(), {
    musicVolume: 0.9,
    sfxVolume: 0.2,
    musicMuted: false,
    sfxMuted: false,
  });
  assert.deepEqual(JSON.parse(stored.get("pm-audio-prefs")!), audio.getPrefs());
  unsubscribe();
  audio.setMuted("music", true);
  assert.equal(
    delivered.length,
    4,
    "Assinatura liberada deixa de receber mudanças",
  );
  audio.stopMusic();
  console.log(
    "Áudio UI: snapshots imutáveis, mute, volumes e persistência passaram.",
  );
} finally {
  Object.assign(globalThis, {
    window: originalWindow,
    localStorage: originalStorage,
  });
}
