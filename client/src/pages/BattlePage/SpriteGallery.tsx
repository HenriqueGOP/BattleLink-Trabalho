import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { playSprite, spriteStats } from '../../lib/presentation/SpriteRenderer'
import { SPRITE_CLIPS, type SpriteClipId } from '../../lib/presentation/spriteRegistry'
import styles from './SpriteGallery.module.css'

const labels: Record<SpriteClipId, string> = {
  frozen: 'Aura de congelamento',
  impact: 'Impacto',
  slash: 'Corte',
  fire: 'Fogo',
  water: 'Água',
  electric: 'Eletricidade',
  grass: 'Folhas',
  ice: 'Gelo',
  shadow: 'Sombra',
  burn: 'Queimadura',
  poison: 'Veneno',
  sleep: 'Sono',
  confusion: 'Confusão',
  protect: 'Proteção',
  buff: 'Aumento de atributo',
  debuff: 'Redução de atributo',
  heal: 'Cura',
  recall: 'Recolher Pokémon',
  summon: 'Entrada',
  faint: 'Nocaute',
  victory: 'Vitória',
  defeat: 'Derrota',
  draw: 'Empate',
  dodge: 'Esquiva',
  psychic: 'Energia psíquica',
}
const regularIds = (Object.keys(SPRITE_CLIPS) as SpriteClipId[]).filter(id => id !== 'frozen')
interface FrameSample {
  frames: number
  elapsedMs: number
  averageFps: number
  p95Ms: number
}

/** Uma publicação de métricas ao final; o relógio não passa pelo estado React. */
function sampleFrames(signal: AbortSignal): Promise<FrameSample | null> {
  return new Promise((resolve) => {
    const intervals: number[] = []
    let frame = 0,
      start: number | null = null,
      previous: number | null = null,
      done = false
    const finish = (sample: FrameSample | null) => {
      if (done) return
      done = true
      cancelAnimationFrame(frame)
      signal.removeEventListener('abort', abort)
      resolve(sample)
    }
    const abort = () => finish(null)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    const tick = (now: number) => {
      if (done) return
      start ??= now
      if (previous !== null) intervals.push(now - previous)
      previous = now
      const elapsedMs = now - start
      if (elapsedMs >= 2000) {
        const sorted = [...intervals].sort((a, b) => a - b)
        finish({
          frames: intervals.length,
          elapsedMs,
          averageFps: (intervals.length * 1000) / Math.max(1, elapsedMs),
          p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
        })
      } else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  })
}

function Clips() {
  const [iceOnly, setIceOnly] = useState(false)
  const ids: SpriteClipId[] = iceOnly ? ['frozen'] : regularIds
  const holders = useRef(new Map<SpriteClipId, HTMLDivElement>())
  const [staticFrames, setStaticFrames] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [mode, setMode] = useState<'preview' | 'play' | 'stopped'>('preview')
  const [epoch, setEpoch] = useState(0)
  const [sample, setSample] = useState<FrameSample | null>(null)
  const [status, setStatus] = useState('Quadros estáticos prontos para inspeção.')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller
    const stopWhenHidden = () => {
      if (document.hidden) {
        controller.abort()
        setMode('stopped')
        setStatus('Galeria interrompida porque a aba ficou oculta.')
      }
    }
    document.addEventListener('visibilitychange', stopWhenHidden)
    if (mode !== 'stopped') {
      const plays = ids.map((id) =>
        playSprite(holders.current.get(id) ?? null, id, {
          signal: controller.signal,
          static: mode === 'preview' || staticFrames,
          size: 128,
        })
      )
      if (mode === 'play' && !staticFrames) {
        void Promise.all([Promise.all(plays), sampleFrames(controller.signal)]).then(
          ([, metrics]) => {
            if (controller.signal.aborted) return
            setSample(metrics)
            setStatus('Rodada concluída; quadros estáticos reapresentados.')
            setMode('preview')
          }
        )
      }
    }
    return () => {
      controller.abort()
      document.removeEventListener('visibilitychange', stopWhenHidden)
      if (abortRef.current === controller) abortRef.current = null
    }
  // The gallery displays the ice atlas separately, preserving the 24-instance budget.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, mode, staticFrames, iceOnly])

  return (
    <>
      <div className={styles.controls}>
        <Button variant="ghost" onClick={() => { abortRef.current?.abort(); setIceOnly(value => !value); setMode('preview') }}>
          {iceOnly ? 'Mostrar os 24 efeitos de combate' : 'Inspecionar aura de gelo'}
        </Button>
        <Button
          onClick={() => {
            abortRef.current?.abort()
            setSample(null)
            setEpoch((value) => value + 1)
            setMode(staticFrames ? 'preview' : 'play')
            setStatus(
              staticFrames
                ? 'Exibindo somente quadros estáticos.'
                : `Reproduzindo uma rodada de ${ids.length} efeitos.`
            )
          }}
        >
          Reproduzir efeitos
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            abortRef.current?.abort()
            setMode('stopped')
            setStatus('Galeria parada; canvases e relógios liberados.')
          }}
        >
          Parar
        </Button>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={staticFrames}
            onChange={(event) => {
              abortRef.current?.abort()
              setStaticFrames(event.target.checked)
              setMode('preview')
              setStatus('Quadros estáticos prontos para inspeção.')
            }}
          />
          Quadro estático / movimento reduzido
        </label>
      </div>
      <p role="status" data-sprite-gallery-state={mode}>
        {status}
      </p>
      {sample && (
        <output className={styles.metrics} data-sprite-gallery-sample={JSON.stringify(sample)}>
          Amostra RAF de {(sample.elapsedMs / 1000).toFixed(2)} s: {sample.frames} intervalos ·
          média {sample.averageFps.toFixed(1)} FPS · p95 {sample.p95Ms.toFixed(1)} ms. A amostra
          inclui o fim da rodada; ela descreve este navegador, sem medir um celular real.
        </output>
      )}
      <div className={styles.grid} data-sprite-gallery>
        {ids.map((id) => (
          <article className={styles.card} key={id}>
            <div
              className={styles.canvasHolder}
              data-gallery-clip={id}
              ref={(element) => {
                if (element) holders.current.set(id, element)
                else holders.current.delete(id)
              }}
            />
            <h3 className={styles.name}>{labels[id]}</h3>
            <span className={styles.caption}>
              {id} · 8 quadros · {SPRITE_CLIPS[id].fps} FPS
            </span>
          </article>
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={() =>
          setStatus(
            `Canvases ativos: ${spriteStats().active}; relógios RAF do renderizador: ${spriteStats().framesPending}.`
          )
        }
      >
        Inspecionar recursos ativos
      </Button>
    </>
  )
}

/** Importado apenas pela rota compilada no modo profile. */
export function SpriteGallery({ enabled }: { enabled: boolean }) {
  return (
    <section className={styles.section} aria-label="Galeria de sprites de combate">
      <h2 className={styles.title}>Galeria de 25 efeitos</h2>
      <p>Previews usam o mesmo renderizador Canvas e os mesmos arquivos da batalha.</p>
      {enabled ? (
        <Clips />
      ) : (
        <p>Desmonte a cena acima para inspecionar a galeria com todo o orçamento de 24 clips.</p>
      )}
    </section>
  )
}
