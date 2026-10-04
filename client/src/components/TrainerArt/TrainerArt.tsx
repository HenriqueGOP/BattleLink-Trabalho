import { trainerAssets, TRAINER_POSES, type TrainerPose } from '../../lib/trainerAssets'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { trainerById } from '../../../../server/src/contracts/trainers'
import { pokemonAssets } from '../../lib/assets'
import styles from './TrainerArt.module.css'
export function TrainerArt({ id, compact = false, splash = false, className = '' }: { id: string; compact?: boolean; splash?: boolean; className?: string }) {
  const trainer = trainerById(id)
  const [failed, setFailed] = useState(false)
  if (!trainer) return null
  return <div className={`${styles.art} ${className}`} style={{ '--trainer-color': trainer.color } as CSSProperties}>
    <img loading={compact ? 'lazy' : 'eager'} decoding="async" src={failed ? trainerAssets(id)!.art : compact ? trainerAssets(id)!.portrait : splash ? trainerAssets(id)!.splash : trainerAssets(id)!.art} alt={compact ? '' : trainer.name} onError={event => { if (!failed) setFailed(true); else { event.currentTarget.onerror = null; event.currentTarget.src = pokemonAssets(trainer.signature).front } }} />
    {splash && <img className={styles.partner} src={pokemonAssets(trainer.signature).front} alt={`Parceiro assinatura: ${trainer.signature}`} decoding="async" />}
  </div>
}
export function TrainerSprite({ id, pose = 'idle' }: { id: string; pose?: TrainerPose }) {
  const trainer = trainerById(id)
  const [failed, setFailed] = useState(false)
  const spriteRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const visibility = () => { if (spriteRef.current) spriteRef.current.dataset.paused = String(document.hidden) }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  useEffect(() => {
    const source = trainerAssets(id)
    if (!source) return
    const image = new Image()
    image.src = source.motion
    image.onerror = () => setFailed(true)
    return () => { image.onerror = null }
  }, [id])
  if (!trainer) return null
  if (failed) return <div className={styles.sprite} data-trainer-sprite data-pose="idle" role="img" aria-label={trainer.name}><img className={styles.fallback} src={pokemonAssets(trainer.signature).front} alt="" /></div>
  return <div ref={spriteRef} className={styles.sprite} data-trainer-sprite data-atlas="motion" data-pose={pose} role="img" aria-label={trainer.name} style={{ backgroundImage: `url("${trainerAssets(id)!.motion}")`, '--trainer-x': `${-160 * TRAINER_POSES.indexOf(pose)}px` } as CSSProperties} />
}
