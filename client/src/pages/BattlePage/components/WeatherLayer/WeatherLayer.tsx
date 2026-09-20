import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../../../lib/anim/gsap'
import type { Terrain, Weather } from '../../../../types/battle'
import styles from './WeatherLayer.module.css'

export interface WeatherLayerProps {
  weather: Weather | null
  terrain: Terrain | null
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
}

const MAX_PARTICLES = 120

/** Cena em camadas: céu por clima, nuvens parallax, solo por terreno e partículas em canvas único. */
export function WeatherLayer({ weather, terrain }: WeatherLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    if (prefersReducedMotion() || !weather || weather === 'sun') {
      context.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    let particles: Particle[] = []
    let running = true
    let frame = 0

    const resize = () => {
      const parent = canvas.parentElement
      canvas.width = parent?.clientWidth ?? window.innerWidth
      canvas.height = parent?.clientHeight ?? window.innerHeight
    }
    resize()

    const spawn = (initial: boolean): Particle => {
      switch (weather) {
        case 'rain':
          return {
            x: Math.random() * (canvas.width + 120) - 60,
            y: initial ? Math.random() * canvas.height : -20,
            vx: 3.5,
            vy: 12 + Math.random() * 6,
            size: 1 + Math.random(),
            alpha: 0.35 + Math.random() * 0.3,
          }
        case 'sandstorm':
          return {
            x: initial ? Math.random() * canvas.width : -30,
            y: Math.random() * canvas.height,
            vx: 5 + Math.random() * 4,
            vy: (Math.random() - 0.5) * 2,
            size: 1.5 + Math.random() * 2,
            alpha: 0.2 + Math.random() * 0.25,
          }
        case 'snow':
        default:
          return {
            x: Math.random() * canvas.width,
            y: initial ? Math.random() * canvas.height : -12,
            vx: Math.sin(frame / 40) * 0.6,
            vy: 1 + Math.random() * 1.6,
            size: 1.5 + Math.random() * 2.5,
            alpha: 0.4 + Math.random() * 0.4,
          }
      }
    }

    const targetCount = weather === 'rain' ? 110 : weather === 'sandstorm' ? 90 : 80
    particles = Array.from({ length: targetCount }, () => spawn(true))

    const draw = () => {
      if (!running) return
      frame += 1
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (const particle of particles) {
        context.globalAlpha = particle.alpha
        if (weather === 'rain') {
          context.strokeStyle = '#9fc3ff'
          context.lineWidth = particle.size
          context.beginPath()
          context.moveTo(particle.x, particle.y)
          context.lineTo(particle.x - particle.vx * 1.6, particle.y - particle.vy * 1.6)
          context.stroke()
        } else if (weather === 'sandstorm') {
          context.fillStyle = '#d9b877'
          context.fillRect(particle.x, particle.y, particle.size * 4, particle.size * 0.8)
        } else {
          context.fillStyle = '#ffffff'
          context.beginPath()
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
          context.fill()
        }
        particle.x += particle.vx
        particle.y += particle.vy
        if (weather === 'snow') particle.x += Math.sin((frame + particle.y) / 40) * 0.4
        const out =
          particle.y > canvas.height + 20 ||
          (weather === 'sandstorm' && particle.x > canvas.width + 30) ||
          particle.x > canvas.width + 120
        if (out && particles.length <= MAX_PARTICLES) {
          Object.assign(particle, spawn(false))
        }
      }
      context.globalAlpha = 1
      requestAnimationFrame(draw)
    }

    const raf = requestAnimationFrame(draw)

    const onVisibility = () => {
      running = !document.hidden
      if (running) requestAnimationFrame(draw)
    }
    document.addEventListener('visibilitychange', onVisibility)

    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
    }
  }, [weather])

  return (
    <div className={`${styles.scene} ${weather ? styles[`weather-${weather}`] : ''} ${terrain ? styles[`terrain-${terrain}`] : ''}`} aria-hidden="true">
      <div className={styles.sky}>
        <span className={styles.sun} />
        <span className={`${styles.cloud} ${styles.cloudOne}`} />
        <span className={`${styles.cloud} ${styles.cloudTwo}`} />
        <span className={`${styles.cloud} ${styles.cloudThree}`} />
      </div>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.terrainFx}>
        {terrain === 'electric' && (
          <>
            <span className={styles.spark} style={{ left: '18%', animationDelay: '0s' }} />
            <span className={styles.spark} style={{ left: '55%', animationDelay: '1.1s' }} />
            <span className={styles.spark} style={{ left: '82%', animationDelay: '2.3s' }} />
          </>
        )}
        {terrain === 'grassy' && <span className={styles.grass} />}
        {terrain === 'misty' && <span className={styles.fog} />}
        {terrain === 'psychic' && (
          <>
            <span className={styles.ring} style={{ left: '30%', top: '30%' }} />
            <span className={styles.ring} style={{ left: '62%', top: '55%', animationDelay: '1.4s' }} />
          </>
        )}
      </div>
      <div className={styles.ground}>
        <span className={styles.plank} />
      </div>
      <div className={styles.scrim} />
    </div>
  )
}
