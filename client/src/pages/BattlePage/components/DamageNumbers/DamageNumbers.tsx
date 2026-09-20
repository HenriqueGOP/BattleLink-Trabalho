import { useEffect, useRef } from 'react'
import { floatText } from '../../../../lib/anim/gsap'
import type { BattleEvent } from '../../../../types/events'

export interface DamageNumbersProps {
  event: BattleEvent | null
  /** Busca o elemento-pai (holder do sprite) por lado. */
  getTarget: (side: 'me' | 'opponent') => HTMLElement | null
}

/** Números e textos flutuantes sobre os sprites (GSAP). */
export function DamageNumbers({ event, getTarget }: DamageNumbersProps) {
  const lastId = useRef<number | null>(null)

  useEffect(() => {
    if (!event || lastId.current === event.id) return
    lastId.current = event.id
    const amount = event.amount ?? 0

    const hit = (side: 'me' | 'opponent') => {
      const element = getTarget(side)
      if (!element) return
      if (event.type === 'damage' || event.type === 'special' || event.type === 'confusion_hit' || event.type === 'residual') {
        const big = Boolean(event.crit) || event.type === 'special'
        floatText(element, `-${amount}`, event.crit ? 'crit' : 'damage', { big })
        if (event.crit) floatText(element, 'CRÍTICO!', 'crit', { big: true, offsetY: -34 })
        if (event.type === 'residual') floatText(element, `residual -${amount}`, 'damage', { offsetY: 6 })
      } else if (event.type === 'effective') {
        // "Foi super efetivo!" chega do servidor como evento próprio; o alvo
        // visual é o Pokémon que SOFREU o golpe (target do evento).
        floatText(element, 'SUPER EFETIVO!', 'crit', { offsetY: -62 })
      } else if (event.type === 'resisted') {
        floatText(element, 'POUCO EFETIVO…', 'info', { offsetY: -58 })
      } else if (event.type === 'heal' || event.type === 'info') {
        if (amount > 0) floatText(element, `+${amount}`, 'heal', {})
      } else if (event.type === 'miss') {
        floatText(element, 'ESQUIVOU!', 'info', { offsetY: -30 })
      } else if (event.type === 'immune') {
        floatText(element, 'NÃO AFETA!', 'info', { offsetY: -30 })
      }
    }

    if (event.type === 'stat_up' || event.type === 'stat_down') {
      if (event.target !== 'me' && event.target !== 'opponent') return
      const element = getTarget(event.target)
      if (element) {
        floatText(element, `${event.type === 'stat_up' ? '↑' : '↓'} ${event.stat ?? ''}`, event.type === 'stat_up' ? 'buff' : 'debuff', { offsetY: -20 })
      }
      return
    }

    if (event.target === 'me' || event.target === 'opponent') {
      hit(event.target)
    } else if (event.actor === 'me' || event.actor === 'opponent') {
      hit(event.actor === 'me' ? 'opponent' : 'me')
    }
  }, [event, getTarget])

  return null
}
