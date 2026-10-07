/** Orçamento central de efeitos. Não depende do RNG das regras nem de relógios do servidor. */
export const IMPACT = Object.freeze({
  hitStop: 70,
  criticalHitStop: 90,
  hp: 520,
  ghostDelay: 150,
  ghost: 560,
  shake: 360,
  text: 780,
  enter: 620,
  exit: 380,
  faint: 720,
  particleLimit: 24,
  particles: 10,
  criticalParticles: 18,
  flashWindow: 1000,
  flashLimit: 2,
  flash: 160,
})
export class FlashBudget {
  private timestamps: number[] = []
  allow(now: number) {
    this.timestamps = this.timestamps.filter((time) => now - time < IMPACT.flashWindow)
    if (this.timestamps.length >= IMPACT.flashLimit) return false
    this.timestamps.push(now)
    return true
  }
}
/** Visual estável por sequência; nenhum Math.random global ou seed privada do combate. */
export function visualRandom(sequence: number) {
  let value = (sequence + 1) >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x100000000
  }
}
