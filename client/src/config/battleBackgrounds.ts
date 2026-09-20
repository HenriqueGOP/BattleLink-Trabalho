/**
 * Registro central dos cenários do campo de batalha.
 * O SERVIDOR sorteia o id no início da partida e envia via state.field.background.
 * Para adicionar um cenário: crie public/backgrounds/<id>/bg.jpg e registre aqui. Nada mais muda.
 *
 * Camadas por cenário (ordem de profundidade no BattleBackground):
 *   céu/fundo → intermediário → chão → atmosfera/animação → círculos → Pokémon → efeitos → HUD
 *
 * Fallback: quando bg.png não existe (CREDITS.md em public/backgrounds), o cenário
 * é desenhado por CSS/SVG (layers) — garante os 4 cenários funcionais sem assets externos.
 */
export interface BattleBackgroundConfig {
  /** id enviado pelo servidor no state.field.background */
  id: string
  /** png/webp servido de public/backgrounds/<id>/bg.jpg (opcional quando layers cobre tudo) */
  background: string | null
  /** overlay de contraste para legibilidade do HUD ('dark' | 'soft' | null) */
  overlay: 'dark' | 'soft' | null
  /** animação sutil do cenário (CSS keyframes no BattleBackground) */
  animation: 'leaves' | 'dust' | 'drips' | 'fireflies' | null
  /** tema cromático usado pelos layers CSS de fallback */
  theme: 'nature' | 'cave' | 'night' | 'day'
}

export const battleBackgrounds: BattleBackgroundConfig[] = [
  { id: 'meadow', background: '/backgrounds/meadow/bg.jpg', overlay: 'soft', animation: 'leaves', theme: 'nature' },
  { id: 'forest', background: '/backgrounds/forest/bg.jpg', overlay: 'soft', animation: 'leaves', theme: 'nature' },
  { id: 'cave', background: '/backgrounds/cave/bg.jpg', overlay: 'dark', animation: 'dust', theme: 'cave' },
  { id: 'night', background: '/backgrounds/night/bg.jpg', overlay: 'dark', animation: 'fireflies', theme: 'night' },
  { id: 'beach', background: '/backgrounds/beach/bg.jpg', overlay: 'soft', animation: 'leaves', theme: 'nature' },
  { id: 'city', background: '/backgrounds/city/bg.jpg', overlay: 'soft', animation: 'dust', theme: 'cave' },
]

const DEFAULT_BACKGROUND = 'meadow'

export function resolveBackground(id: string | null | undefined): BattleBackgroundConfig {
  return battleBackgrounds.find(config => config.id === id) ?? battleBackgrounds.find(config => config.id === DEFAULT_BACKGROUND)!
}