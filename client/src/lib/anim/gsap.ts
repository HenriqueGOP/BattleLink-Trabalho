import gsap from 'gsap'

/** Helpers GSAP reusáveis. Cada componente cria seu gsap.context para cleanup. */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Avanço curto do atacante na direção do alvo e volta. */
export function lunge(element: HTMLElement, direction: 1 | -1, distance = 26): void {
  if (prefersReducedMotion()) return
  gsap.fromTo(
    element,
    { x: 0, y: 0 },
    {
      x: direction * distance,
      y: -10,
      duration: 0.18,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1,
      overwrite: 'auto',
    },
  )
}

/** Tremor de impacto. */
export function shake(element: HTMLElement, strength = 8, duration = 0.45): void {
  if (prefersReducedMotion()) return
  gsap.fromTo(
    element,
    { x: 0 },
    {
      keyframes: { x: [0, -strength, strength, -strength / 2, strength / 2, 0] },
      duration,
      ease: 'power1.out',
      overwrite: 'auto',
    },
  )
}

/** Passo rápido de esquiva: sai da linha de ataque e volta à base. */
export function dodge(element: HTMLElement, direction: 1 | -1): void {
  if (prefersReducedMotion()) return
  gsap.fromTo(element, { x: 0, y: 0, rotate: 0 }, {
    keyframes: [
      { x: direction * 30, y: -8, rotate: direction * 4, duration: 0.16, ease: 'power3.out' },
      { x: direction * 18, y: 1, rotate: direction * 2, duration: 0.11 },
      { x: 0, y: 0, rotate: 0, duration: 0.24, ease: 'power2.inOut' },
    ],
    overwrite: 'auto',
  })
}

/** Flash de brilho no alvo ao ser atingido. */
export function flash(element: HTMLElement, duration = 0.4): void {
  gsap.fromTo(
    element,
    { filter: 'brightness(2.6) saturate(0.4)' },
    { filter: 'brightness(1) saturate(1)', duration, ease: 'power1.out', overwrite: 'auto' },
  )
}

/** Pulsinho suave (cura, buffs). */
export function pulseGlow(element: HTMLElement, color = 'rgba(255,255,255,0.8)'): void {
  if (prefersReducedMotion()) return
  gsap.fromTo(
    element,
    { boxShadow: `0 0 0 0 ${color}` },
    { boxShadow: '0 0 24px 6px rgba(255,255,255,0)', duration: 0.8, ease: 'power1.out', overwrite: 'auto' },
  )
}

export type FloatTone = 'damage' | 'heal' | 'buff' | 'debuff' | 'info' | 'crit'

const FLOAT_COLORS: Record<FloatTone, string> = {
  damage: '#ff5a4e',
  heal: '#5dd66b',
  buff: '#ffd94a',
  debuff: '#b48cff',
  info: '#e8ecff',
  crit: '#ff8f3c',
}

/** Número/texto flutuante sobre o sprite; remove o elemento do DOM ao terminar. */
export function floatText(
  parent: HTMLElement,
  text: string,
  tone: FloatTone,
  options: { big?: boolean; offsetY?: number } = {},
): void {
  const span = document.createElement('span')
  span.className = 'float-fx'
  span.textContent = text
  span.style.color = FLOAT_COLORS[tone]
  if (options.big) span.style.fontSize = 'clamp(20px, 3.2vw, 34px)'
  const x = 20 + Math.random() * 60
  const y = (options.offsetY ?? 0) + 10 + Math.random() * 24
  span.style.left = `${x}%`
  span.style.top = `${y}%`
  parent.appendChild(span)
  const distance = options.big ? 74 : 54
  if (prefersReducedMotion()) {
    gsap.set(span, { opacity: 0.95, y: 0 })
    gsap.to(span, { opacity: 0, duration: 0.8, delay: 0.4, onComplete: () => span.remove() })
    return
  }
  gsap.fromTo(
    span,
    { y: 0, opacity: 0, scale: 0.6 },
    {
      keyframes: [
        { y: -distance * 0.4, opacity: 1, scale: 1.15, duration: 0.22, ease: 'power2.out' },
        { y: -distance, opacity: 0, scale: 1, duration: 0.7, ease: 'power1.in' },
      ],
      onComplete: () => span.remove(),
    },
  )
}

/** Explosão pequena de partículas DOM (dano, cura, tera). */
export function burstParticles(
  parent: HTMLElement,
  count: number,
  color: string,
  options: { rise?: boolean } = {},
): void {
  if (prefersReducedMotion()) return
  const limit = Math.min(count, 14)
  for (let index = 0; index < limit; index++) {
    const particle = document.createElement('i')
    particle.className = 'particle-fx'
    particle.style.background = color
    particle.style.left = `${30 + Math.random() * 40}%`
    particle.style.top = `${40 + Math.random() * 30}%`
    parent.appendChild(particle)
    const angle = options.rise ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2
    const radius = 30 + Math.random() * 60
    gsap.fromTo(
      particle,
      { x: 0, y: 0, opacity: 1, scale: 0.6 + Math.random() },
      {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius - (options.rise ? 30 : 0),
        opacity: 0,
        scale: 0.2,
        duration: 0.7 + Math.random() * 0.4,
        ease: 'power1.out',
        onComplete: () => particle.remove(),
      },
    )
  }
}

/** Chuva de confete (overlay de vitória). */
export function confetti(container: HTMLElement, count = 90): void {
  if (prefersReducedMotion()) return
  const colors = ['#ff4d4d', '#ffd94a', '#5dd66b', '#4aa8ff', '#e28fb4', '#ffffff']
  const width = container.clientWidth || 800
  for (let index = 0; index < count; index++) {
    const piece = document.createElement('i')
    piece.className = 'confetti-fx'
    piece.style.background = colors[index % colors.length]
    piece.style.left = `${Math.random() * 100}%`
    piece.style.width = `${6 + Math.random() * 6}px`
    piece.style.height = `${10 + Math.random() * 8}px`
    container.appendChild(piece)
    gsap.fromTo(
      piece,
      { y: -30, rotation: Math.random() * 360, opacity: 1 },
      {
        y: container.clientHeight + 40,
        rotation: `+=${180 + Math.random() * 540}`,
        x: `+=${(Math.random() - 0.5) * width * 0.25}`,
        opacity: 0.9,
        duration: 2.2 + Math.random() * 2.4,
        delay: Math.random() * 1.6,
        ease: 'none',
        onComplete: () => piece.remove(),
      },
    )
  }
}

/** Deslize de entrada de sprite (slide + fade). */
export function enterSprite(element: HTMLElement, from: 'left' | 'right'): void {
  const offset = from === 'left' ? -90 : 90
  if (prefersReducedMotion()) {
    gsap.fromTo(element, { opacity: 0 }, { opacity: 1, duration: 0.3 })
    return
  }
  gsap.fromTo(
    element,
    { x: offset, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out', overwrite: 'auto' },
  )
}
