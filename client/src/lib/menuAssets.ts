/** Each player menu owns two distinct original raster assets. Shared logo is extra. */
export const MENU_ART = {
  home: ['home-background', 'home-modes'],
  quick: ['quick-splash', 'quick-emblem'],
  friends: ['friends-splash', 'friends-emblem'],
  waiting: ['waiting-splash', 'waiting-emblem'],
  ready: ['ready-panel', 'ready-emblem'],
  pve: ['pve-background', 'pve-emblem'],
  selection: ['selection-background', 'selection-emblem'],
  setup: ['setup-background', 'setup-emblem'],
  combat: ['combat-panel', 'combat-emblem'],
  party: ['party-panel', 'party-emblem'],
  result: ['result-panel', 'result-emblem'],
  audio: ['audio-panel', 'audio-emblem'],
} as const
export type MenuId = keyof typeof MENU_ART
