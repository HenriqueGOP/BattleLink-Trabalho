import { useCallback, useMemo, useRef, useState } from 'react'
import fixture from '../../data/presentation-fixture.json'
import type { RoomSnapshot } from '../../types/protocol'
import { presentSnapshot } from '../../lib/battleView'
import { useBattleEvents } from '../../hooks/useBattleEvents'
import { BattleSpot } from './components/BattleSpot'
import { BattleBackground } from './components/BattleBackground'
import { HudCard } from './components/HudCard'
import { BattleProfiler } from './components/BattleProfiler'
import { Button } from '../../components/Button'
import { EndOverlay } from './components/EndOverlay'
import { AudioSettings } from '../../components/AudioSettings'
import { SpriteGallery } from './SpriteGallery'
import { GroundingPreview } from './GroundingPreview'
import { battleBackgrounds } from '../../config/battleBackgrounds'
import styles from './BattlePage.module.css'

const snapshots = fixture as unknown as { label: string; state: RoomSnapshot }[]
function Scenario({ restart }: { restart: () => void }) {
  const [step, setStep] = useState(0)
  const stage = useRef<HTMLDivElement>(null),
    me = useRef<HTMLDivElement>(null),
    foe = useRef<HTMLDivElement>(null)
  const getStage = useCallback(() => stage.current, [])
  const getPlayer = useCallback(
    (side: 'me' | 'opponent') => (side === 'me' ? me.current : foe.current),
    []
  )
  const authoritative = useMemo(() => presentSnapshot(snapshots[step].state), [step])
  const { presented, busy, hidden, skip, setHidden, current, totals } = useBattleEvents(
    authoritative,
    0,
    getStage,
    getPlayer,
    true
  )
  const state = presented ?? authoritative
  return (
    <>
      <p>Movimento completo neste laboratório; o jogo segue a preferência do sistema.</p>
      <div className={styles.tools}>
        <Button
          onClick={() => setStep((value) => Math.min(value + 1, snapshots.length - 1))}
          disabled={step === snapshots.length - 1}
        >
          Próxima sequência
        </Button>
        <Button onClick={skip} disabled={!busy}>
          Pular animações
        </Button>
        <Button onClick={() => setHidden(!hidden)}>
          {hidden ? 'Retomar apresentação' : 'Simular aba oculta'}
        </Button>
      </div>
      <p role="status">
        {snapshots[step].label} · {busy ? 'Animando' : 'Concluído'} · {current?.message ?? ''}
      </p>
      <div className={styles.layout}>
        <BattleProfiler>
          <section
            className={styles.stage}
            ref={stage}
            aria-label="Campo de batalha"
            data-fx-stage
            data-animation={busy ? (current?.type ?? 'sync') : 'idle'}
            data-event-sequence={current?.id ?? state.wire.sequence}
            data-paused={hidden ? 'true' : undefined}
          >
            <BattleBackground background={state.field.background} />
            <div className={styles.spots}>
              <HudCard player={state.players[1]} opponent />
              <BattleSpot player={state.players[1]} opponent spriteRef={foe} paused={hidden} />
              <BattleSpot
                player={state.players[0]}
                opponent={false}
                spriteRef={me}
                paused={hidden}
              />
              <HudCard player={state.players[0]} opponent={false} />
            </div>
          </section>
        </BattleProfiler>
      </div>
      <p data-lab-result>
        {state.phase === 'finished' && !busy ? 'Resultado apresentado' : 'Partida em apresentação'}
      </p>
      {state.phase === 'finished' && !busy && (
        <EndOverlay
          state={state}
          myId={state.players[0].id}
          totals={totals}
          opponentLeft={false}
          onRematch={() => undefined} onLeave={restart}
        />
      )}
    </>
  )
}
/** Inspeção somente em desenvolvimento/profile; sem controles de override no jogo distribuído. */
export function PresentationLab() {
  const [showGrounding, setShowGrounding] = useState(false)
  const [epoch, setEpoch] = useState(0),
    [mounted, setMounted] = useState(true)
  const [preview, setPreview] = useState<'mobile' | 'desktop' | null>(null)
  return (
    <main className={styles.page}>
      <h1>Laboratório de apresentação</h1>
      <AudioSettings />
      <div className={styles.tools}>
        <Button onClick={() => { setMounted(false); setShowGrounding(value => !value) }}>
          {showGrounding ? 'Inspecionar efeitos' : 'Inspecionar sprites e arenas'}
        </Button>
        <Button
          onClick={() => {
            setEpoch((value) => value + 1)
            setMounted(true)
          }}
        >
          Reiniciar cenário
        </Button>
        <Button onClick={() => setMounted((value) => !value)}>
          {mounted ? 'Desmontar cena' : 'Montar cena'}
        </Button>
      </div>
      {mounted && <Scenario key={epoch} restart={() => setEpoch((value) => value + 1)} />}
      <BattleProfiler>
        <SpriteGallery enabled={!mounted && !showGrounding} />
      </BattleProfiler>
      {!mounted && showGrounding && <GroundingPreview />}
      <section aria-label="Galeria das seis arenas" className={styles.arenaGallery}>
        {battleBackgrounds.map((arena) => (
          <article key={arena.id}>
            <h2 className={styles.arenaTitle}>{arena.name}</h2>
            <div className={styles.arenaPreview}>
              <BattleBackground background={arena.id} />
            </div>
          </article>
        ))}
      </section>
      <section aria-label="Prévia responsiva">
        <p>Cliente real em uma janela independente. A largura pertence ao documento interno.</p>
        <Button onClick={() => setPreview('mobile')}>Abrir cliente em 360 px</Button>
        <Button onClick={() => setPreview('desktop')}>Abrir cliente em 1280 px</Button>
        <Button onClick={() => setPreview(null)}>Fechar prévia</Button>
        {preview && (
          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <iframe
              key={preview}
              title="Cliente responsivo"
              src="/"
              width={preview === 'mobile' ? 360 : 1280}
              height={800}
              style={{
                display: 'block',
                boxSizing: 'content-box',
                maxWidth: 'none',
                border: '1px solid var(--line)',
                borderRadius: 12,
              }}
            />
          </div>
        )}
      </section>
    </main>
  )
}
