/**
 * FX de game feel (Web Animations API nativa) — técnicas da comunidade:
 * - screen shake por "trauma" decrescente (suave, acumulável, com rotação)
 * - hit-stop seletivo (pausa só as animações do palco, não o mundo inteiro)
 * - lunge com antecipação + squash & stretch (princípios Disney)
 * - esquiva com telegrafia (agachar antes do dash)
 * - flash de impacto, partículas e números de dano (DOM efêmero)
 * Zero dependências: só transform/opacity (composited, 60 FPS, sem reflow).
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ---------- screen shake por trauma (DaveTech / FEEL pattern) ---------- */

let trauma = 0
let shakeRAF: number | null = null

export function addTrauma(amount: number): void {
  trauma = Math.min(1, trauma + amount)
  if (shakeRAF == null) shakeLoop()
}

function shakeLoop(): void {
  const shake = trauma * trauma // curva quadrática: doses pequenas são sutis
  const max = 14
  const dx = (Math.random() * 2 - 1) * max * shake
  const dy = (Math.random() * 2 - 1) * max * shake * 0.6
  const rot = (Math.random() * 2 - 1) * 1.2 * shake
  const stage = document.querySelector<HTMLElement>('[data-fx-stage]')
  if (!stage) {
    trauma = 0
    shakeRAF = null
    return
  }
  stage.style.setProperty('--fx-shake-x', `${dx.toFixed(2)}px`)
  stage.style.setProperty('--fx-shake-y', `${dy.toFixed(2)}px`)
  stage.style.setProperty('--fx-shake-r', `${rot.toFixed(2)}deg`)
  trauma -= 0.028
  if (trauma > 0.002) {
    shakeRAF = requestAnimationFrame(shakeLoop)
  } else {
    trauma = 0
    stage.style.setProperty('--fx-shake-x', '0px')
    stage.style.setProperty('--fx-shake-y', '0px')
    stage.style.setProperty('--fx-shake-r', '0deg')
    shakeRAF = null
  }
}

/* ---------- hit-stop seletivo (pausa tweens do palco, não o mundo) ---------- */

let stopTimer: number | null = null

export function hitStop(stage: HTMLElement | null, ms: number): void {
  if (prefersReducedMotion() || !stage) return
  const pause = () => {
    stage?.getAnimations({ subtree: true }).forEach(a => {
      // só animações FINITAS (efeitos); infinitas (idle bob, clima) continuam —
      // pausar tudo "matava" a vida da cena a cada golpe (sintoma relatado)
      const timing = (a as CSSAnimation).effect?.getTiming()
      if (timing && typeof timing.iterations === 'number' && timing.iterations !== Infinity) {
        try { a.pause() } catch { /* já pausada */ }
      }
    })
  }
  const play = () => {
    stage?.getAnimations({ subtree: true }).forEach(a => {
      try { a.play() } catch { /* n/a */ }
    })
  }
  pause()
  stage.classList.add('fx-hitstop')
  if (stopTimer != null) window.clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => {
    play()
    stage.classList.remove('fx-hitstop')
    stopTimer = null
  }, ms)
}

/* ---------- flash de impacto (overlay com blend, sem filter repaint) ---------- */

export function impactFlash(element: HTMLElement, crit: boolean): void {
  if (prefersReducedMotion()) return
  const f = document.createElement('div')
  f.className = 'fx-impact-flash'
  f.style.background = `radial-gradient(circle, ${crit ? 'rgba(255,143,60,.92)' : 'rgba(255,255,255,.85)'} 0%, transparent 70%)`
  element.appendChild(f)
  f.animate(
    [
      { opacity: 0.95, transform: 'scale(0.4)' },
      { opacity: 0, transform: 'scale(1.6)' },
    ],
    { duration: crit ? 260 : 180, easing: 'ease-out' },
  ).onfinish = () => f.remove()
}

/* ---------- partículas de impacto ---------- */

export function impactBurst(element: HTMLElement, count: number, crit: boolean): void {
  if (prefersReducedMotion()) return
  const colors = crit ? ['#ff8f3c', '#ffd94a', '#ff5a4e'] : ['#ff5a4e', '#ffd27a', '#ffb347']
  const limit = Math.min(count, 14)
  for (let i = 0; i < limit; i++) {
    const p = document.createElement('i')
    const c = colors[Math.floor(Math.random() * colors.length)]
    p.className = 'fx-impact-particle'
    p.style.background = c
    p.style.boxShadow = `0 0 6px ${c}`
    element.appendChild(p)
    const ang = Math.random() * Math.PI * 2
    const dist = 34 + Math.random() * 52
    p.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: 420 + Math.random() * 260, easing: 'cubic-bezier(.1,.8,.3,1)' },
    ).onfinish = () => p.remove()
  }
}

/* ---------- número de dano flutuante ---------- */

export function floatingDamage(element: HTMLElement, amount: number, crit: boolean): void {
  const s = document.createElement('span')
  s.className = 'fx-float-damage'
  s.textContent = `-${amount}`
  s.style.fontSize = crit ? '30px' : '21px'
  s.style.color = crit ? '#ff8f3c' : '#ff5a4e'
  element.appendChild(s)
  s.animate(
    [
      { transform: 'translate(-50%, 6px) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -16px) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -42px) scale(1)', opacity: 0 },
    ],
    { duration: 800, easing: 'ease-out' },
  ).onfinish = () => s.remove()
}

export function floatingText(element: HTMLElement, text: string, tone: 'info' | 'crit'): void {
  const s = document.createElement('span')
  s.className = 'fx-float-damage'
  s.textContent = text
  s.style.fontSize = tone === 'crit' ? '20px' : '15px'
  s.style.color = tone === 'crit' ? '#ffd94a' : '#bfe3ff'
  element.appendChild(s)
  s.animate(
    [
      { transform: 'translate(-50%, 6px) scale(0.7)', opacity: 0 },
      { transform: 'translate(-50%, -14px) scale(1.05)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -38px) scale(1)', opacity: 0 },
    ],
    { duration: 760, easing: 'ease-out' },
  ).onfinish = () => s.remove()
}

/* ---------- tremor local do alvo ---------- */

export function shakeTarget(element: HTMLElement, strength: number): void {
  if (prefersReducedMotion()) return
  element.animate(
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(${-strength}px)` },
      { transform: `translateX(${strength}px)` },
      { transform: `translateX(${-strength / 2}px)` },
      { transform: 'translateX(0)' },
    ],
    { duration: 240, easing: 'ease-out' },
  )
}

/* ---------- lunge com antecipação + squash & stretch ---------- */

export function lungeAttack(element: HTMLElement, direction: 1 | -1, distance = 34): void {
  if (prefersReducedMotion()) return
  element.animate(
    [
      { transform: 'translate(0,0) scale(1,1)' },
      { transform: `translate(${-direction * 10}px, 4px) scale(1.06, 0.92)`, offset: 0.18 },
      { transform: `translate(${direction * (distance - 8)}px, -12px) scale(0.94, 1.1)`, offset: 0.45 },
      { transform: `translate(${direction * distance}px, 0) scale(1.04, 0.96)`, offset: 0.62 },
      { transform: 'translate(0,0) scale(1,1)' },
    ],
    { duration: 520, easing: 'cubic-bezier(.3,.7,.4,1)' },
  )
}

/* ---------- esquiva com telegrafia ---------- */

export function dodgeTelegraph(element: HTMLElement, direction: 1 | -1): void {
  if (prefersReducedMotion()) return
  element.animate(
    [
      { transform: 'translate(0,0) scale(1,1)' },
      { transform: 'translate(0,6px) scale(1.05,0.88)', offset: 0.3 },
      { transform: `translate(${direction * 44}px, -4px) scale(0.96,1.05)`, offset: 0.6 },
      { transform: 'translate(0,0) scale(1,1)' },
    ],
    { duration: 480, easing: 'cubic-bezier(.25,.8,.3,1)' },
  )
}
