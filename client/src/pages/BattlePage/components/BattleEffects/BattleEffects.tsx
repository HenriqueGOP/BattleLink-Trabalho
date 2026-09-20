import { useEffect } from 'react'
import { gsap } from 'gsap'
import { burstParticles, lunge, pulseGlow } from '../../../../lib/anim/gsap'
import {
  addTrauma,
  dodgeTelegraph,
  floatingDamage,
  floatingText,
  hitStop,
  impactBurst,
  impactFlash,
  lungeAttack,
  shakeTarget,
} from '../../../../lib/anim/fx'
import { audio, type SfxName } from '../../../../lib/audio'
import type { BattleEvent } from '../../../../types/events'

export interface BattleEffectsProps {
  event: BattleEvent | null
  stageRef: React.RefObject<HTMLDivElement | null>
  getPlayer: (side: 'me' | 'opponent') => HTMLElement | null
  /** Para o cry automático associado ao Pokémon do evento. */
  getPlayerState: (side: 'me' | 'opponent') => { pokemonData?: { cries?: { latest?: string | null } } } | null | undefined
}

const EVENT_SFX: Partial<Record<BattleEvent['type'], SfxName>> = {
  damage: 'damage',
  confusion_hit: 'damage',
  miss: 'miss',
  immune: 'immune',
  heal: 'heal',
  stat_up: 'statUp',
  stat_down: 'statDown',
  status_apply: 'status',
  status_cure: 'switch',
  flinch: 'status',
  residual: 'residual',
  faint: 'faint',
  switch_in: 'switch',
  tera: 'tera',
  weather_change: 'field',
  terrain_change: 'field',
  turn_change: 'turn',
  victory: 'victory',
  defeat: 'defeat',
  draw: 'draw',
  substitute_needed: 'select',
  opponent_left: 'error',
  battle_start: 'start',
}

/** Cooldown do cry automático: evita cascatear sons quando vários eventos chegam juntos. */
let lastCryAt = 0
const CRY_COOLDOWN_MS = 2600

function maybeCry(player: { pokemonData?: { cries?: { latest?: string | null } } | undefined } | null | undefined): void {
  if (!player?.pokemonData?.cries?.latest) return
  const now = Date.now()
  if (now - lastCryAt < CRY_COOLDOWN_MS) return
  lastCryAt = now
  audio.playCry(player.pokemonData.cries.latest)
}

/** Aplica o pacote de dano "game feel": flash + tremor local + partículas + número. */
function damagePacket(target: HTMLElement, crit: boolean): void {
  impactFlash(target, crit)
  shakeTarget(target, crit ? 10 : 6)
  impactBurst(target, crit ? 14 : 8, crit)
  if (crit) floatingText(target, 'CRÍTICO!', 'crit')
}

/** Teatro visual: converte o evento atual em lunge/flash/shake/partículas/som. */
export function BattleEffects({ event, stageRef, getPlayer, getPlayerState }: BattleEffectsProps) {
  useEffect(() => {
    if (!event) return
    const stage = stageRef.current
    if (!stage) return

    // som do evento (uma vez por evento)
    const sfx = EVENT_SFX[event.type]
    if (sfx && event.type !== 'victory' && event.type !== 'defeat' && event.type !== 'draw') {
      audio.play(sfx)
    }

    const actorElement = event.actor === 'me' || event.actor === 'opponent' ? getPlayer(event.actor) : null
    const targetElement =
      event.target === 'me' || event.target === 'opponent' ? getPlayer(event.target) : null

    void getPlayer
    // FAINT: o estado visual de desmaiado é persistido pelo próprio sprite
    // (BattleSprite aplica data-fainted a partir do HP). Aqui sobra apenas a
    // queda dramática de entrada. Se o substituto já entrou enquanto este
    // evento ainda estava na fila, o holder em campo é de OUTRO Pokémon
    // (data-pokemon diferente): a queda atrasada é descartada, nunca aplicada
    // ao Pokémon novo.
    if (event.type === 'faint') {
      const fallen = event.target === 'me' || event.target === 'opponent' ? getPlayer(event.target) : null
      if (fallen && event.pokemon && fallen.dataset.pokemon?.toLowerCase() !== event.pokemon.toLowerCase()) return
      if (fallen && !fallen.dataset.fainted) return // estado ainda não refletiu: deixa o estado aplicar
      if (fallen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.fromTo(
          fallen,
          { y: -6, rotate: 0 },
          {
            keyframes: { y: [0, 16, 22], rotate: [0, event.target === 'me' ? -6 : 6, event.target === 'me' ? -8 : 8] },
            duration: 0.55,
            ease: 'bounce.out',
            overwrite: 'auto',
            clearProps: 'transform',
          },
        )
      }
      addTrauma(0.35)
      return
    }
    // SWITCH_IN: fora do gsap.context de propósito. Um fromTo de opacity 0->1
    // dentro do contexto revertível fazia o cleanup do evento seguinte
    // (context.revert()) restaurar a opacidade CAPTURADA no início do tween —
    // que, em corrida com o enterSprite do BattleSprite, era um valor quase 0.
    // Resultado: sprite de costas invisível após a troca pós-nocaute, e só em
    // um dos clientes (dependia do timing da fila). Aqui o tween é autônomo,
    // termina com clearProps (holder volta ao estado natural da folha de
    // estilos) e nunca é revertido.
    if (event.type === 'switch_in') {
      if (targetElement) {
        gsap.fromTo(
          targetElement,
          { opacity: 0, scale: 0.4 },
          {
            opacity: 1,
            scale: 1,
            duration: 0.45,
            ease: 'back.out(2)',
            overwrite: 'auto',
            clearProps: 'opacity,scale',
          },
        )
        burstParticles(targetElement, 12, '#ffd94a')
      }
      maybeCry(event.target === 'me' ? getPlayerState('me') : getPlayerState('opponent'))
      return
    }
    const context = gsap.context(() => {
      switch (event.type) {
        case 'damage':
        case 'special':
        case 'confusion_hit': {
          const isSelfHit = event.type === 'confusion_hit'
          const crit = Boolean(event.crit)
          if (actorElement && (event.type === 'damage' || event.type === 'special') && !isSelfHit) {
            // lunge de game feel: antecipação -> salto (stretch) -> impacto (squash)
            lungeAttack(actorElement, event.actor === 'me' ? 1 : -1, event.type === 'special' ? 22 : 34)
          }
          if (targetElement) {
            // pacote de impacto via WAAPI (flash/shake/partículas/número)
            damagePacket(targetElement, crit)
            if (event.amount != null && event.amount > 0) {
              floatingDamage(targetElement, event.amount, crit)
            }
          }
          // hit-stop seletivo + trauma na CENA (variáveis CSS, não transform de sprite)
          hitStop(stage, crit ? 120 : 70)
          addTrauma(crit ? 0.55 : 0.3)
          break
        }
        case 'miss': {
          // esquiva com telegrafia: o alvo agacha e faz dash no timing do golpe
          if (actorElement) lungeAttack(actorElement, event.actor === 'me' ? 1 : -1, 26)
          if (targetElement) dodgeTelegraph(targetElement, event.target === 'me' ? -1 : 1)
          if (targetElement) {
            impactFlash(targetElement, false)
            floatingText(targetElement, 'ESQUIVOU!', 'info')
          }
          addTrauma(0.18)
          break
        }
        case 'immune': {
          if (targetElement) {
            gsap.fromTo(
              targetElement,
              { opacity: 0.25 },
              { opacity: 1, duration: 0.45, ease: 'steps(4)', clearProps: 'opacity' },
            )
            floatingText(targetElement, 'NÃO AFETA!', 'info')
          }
          break
        }
        case 'effective':
        case 'resisted': {
          if (targetElement) {
            floatingText(targetElement, event.type === 'effective' ? 'SUPER EFETIVO!' : 'POUCO EFETIVO…', event.type === 'effective' ? 'crit' : 'info')
          }
          break
        }
        case 'heal': {
          if (targetElement) {
            pulseGlow(targetElement, 'rgba(93, 214, 107, 0.8)')
            burstParticles(targetElement, 10, '#5dd66b', { rise: true })
          }
          break
        }
        case 'residual': {
          if (targetElement) {
            shakeTarget(targetElement, 4)
            impactBurst(targetElement, 4, false)
            if (event.amount != null && event.amount > 0) floatingDamage(targetElement, event.amount, false)
          }
          break
        }
        case 'tera': {
          if (targetElement) {
            burstParticles(targetElement, 14, '#49d0c0')
            gsap.fromTo(
              targetElement,
              { scale: 1 },
              { scale: 1.14, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'scale' },
            )
          }
          maybeCry(event.actor === 'me' ? getPlayerState('me') : getPlayerState('opponent'))
          break
        }
        case 'status_apply': {
          if (targetElement) {
            pulseGlow(targetElement, 'rgba(164, 79, 208, 0.8)')
            burstParticles(targetElement, 6, '#a44fd0')
          }
          break
        }
        case 'status_cure':
        case 'flinch': {
          if (targetElement) lunge(targetElement, 1, 8)
          break
        }
        case 'victory': {
          if (targetElement) {
            gsap.fromTo(
              targetElement,
              { y: 0 },
              { keyframes: { y: [0, -26, 0, -18, 0] }, duration: 1.4, ease: 'power1.out', clearProps: 'y' },
            )
          }
          break
        }
        case 'defeat': {
          gsap.to(stage, { filter: 'brightness(0.55) saturate(0.7)', duration: 1 })
          break
        }
        case 'battle_start': {
          gsap.fromTo(
            stage,
            { filter: 'brightness(2.2)' },
            { filter: 'brightness(1)', duration: 0.9, ease: 'power2.out' },
          )
          maybeCry(getPlayerState('me'))
          maybeCry(getPlayerState('opponent'))
          break
        }
        default:
          break
      }
    }, stage)
    return () => context.revert()
  }, [event, stageRef, getPlayer, getPlayerState])

  return null
}
