import { useCallback, useMemo, useRef, useState } from 'react'
import fixture from '../../data/presentation-fixture.json'
import pveFixture from '../../data/pve-presentation-fixture.json'
import type { RoomSnapshot } from '../../types/protocol'
import { presentSnapshot } from '../../lib/battleView'
import { useBattleEvents } from '../../hooks/useBattleEvents'
import { useMotionPreference } from '../../hooks/useMotionPreference'
import type { MotionPreference } from '../../lib/presentation/motionPreference'
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
import { TrainerSprite } from '../../components/TrainerArt/TrainerArt'
import { TRAINERS } from '../../../../server/src/contracts/trainers'
import { SCENE_LAYOUT } from '../../lib/presentation/sceneLayout'
import styles from './BattlePage.module.css'

const snapshots = fixture as unknown as { label: string; state: RoomSnapshot }[]
const pveSnapshots = pveFixture as unknown as Record<'player' | 'trainer', typeof snapshots>
function Scenario({
  restart,
  pve,
  trainerId,
  winner,
}: {
  restart: () => void
  pve: boolean
  trainerId: string
  winner: 'player' | 'trainer'
}) {
  const frames = pve ? pveSnapshots[winner] : snapshots
  const [step, setStep] = useState(0)
  const stage = useRef<HTMLDivElement>(null),
    me = useRef<HTMLDivElement>(null),
    foe = useRef<HTMLDivElement>(null)
  const getStage = useCallback(() => stage.current, [])
  const getPlayer = useCallback(
    (side: 'me' | 'opponent') => (side === 'me' ? me.current : foe.current),
    []
  )
  const authoritative = useMemo(() => {
    const wire = frames[step].state
    return presentSnapshot(
      pve
        ? {
            ...wire,
            mode: 'pve',
            trainerId,
            players: [
              wire.players[0],
              {
                ...wire.players[1],
                name: TRAINERS.find((trainer) => trainer.id === trainerId)!.name,
              },
            ],
          }
        : wire
    )
  }, [step, frames, pve, trainerId])
  const { presented, busy, hidden, skip, setHidden, current, totals } = useBattleEvents(
    authoritative,
    0,
    getStage,
    getPlayer
  )
  const state = presented ?? authoritative
  const finished = state.phase === 'finished' && !busy
  const { preference, setPreference } = useMotionPreference()
  return (
    <>
      <label>
        Animações{' '}
        <select
          value={preference}
          onChange={(event) => setPreference(event.target.value as MotionPreference)}
        >
          <option value="system">Sistema</option>
          <option value="full">Completo</option>
          <option value="reduced">Reduzido</option>
        </select>
      </label>
      <div className={styles.tools}>
        <Button
          onClick={() => setStep((value) => Math.min(value + 1, frames.length - 1))}
          disabled={step === frames.length - 1}
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
        {step + 1}/{frames.length} · {frames[step].label} · {busy ? 'Animando' : 'Concluído'} ·{' '}
        {current?.message ?? ''}
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
            data-paused={hidden || finished ? 'true' : undefined}
            data-trainer-phase={
              pve && busy && current?.type === 'battle_start' ? 'pending' : undefined
            }
            data-lab-scenario={pve ? 'pve' : 'pvp'}
          >
            {pve && (
              <div
                className={styles.trainerIntro}
                style={{ left: `${SCENE_LAYOUT.trainer.x}%`, top: `${SCENE_LAYOUT.trainer.y}%` }}
                data-trainer-intro
                aria-hidden="true"
              >
                <TrainerSprite id={trainerId} />
              </div>
            )}
            <BattleBackground
              background={state.field.background}
              trainerId={pve ? trainerId : null}
            />
            <div className={styles.spots}>
              <HudCard player={state.players[1]} opponent />
              <BattleSpot
                player={state.players[1]}
                opponent
                spriteRef={foe}
                paused={hidden || finished}
              />
              <BattleSpot
                player={state.players[0]}
                opponent={false}
                spriteRef={me}
                paused={hidden || finished}
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
          onRematch={() => undefined}
          onLeave={restart}
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
  const [pve, setPve] = useState(true)
  const [trainerId, setTrainerId] = useState('vespera')
  const [winner, setWinner] = useState<'player' | 'trainer'>('player')
  return (
    <main className={styles.page}>
      <h1>Laboratório de apresentação</h1>
      <AudioSettings />
      <p>
        Conferência de desenvolvimento com eventos canônicos de equipes de diagnóstico do motor
        real.
      </p>
      <div className={styles.tools}>
        <label>
          Cenário{' '}
          <select
            value={pve ? 'pve' : 'pvp'}
            onChange={(event) => {
              setPve(event.target.value === 'pve')
              setEpoch((value) => value + 1)
            }}
          >
            <option value="pve">PvE: treinadora, alvos e substitutos</option>
            <option value="pvp">PvP: múltiplos hits, status e cura</option>
          </select>
        </label>
        {pve && (
          <>
            <label>
              Treinador{' '}
              <select
                value={trainerId}
                onChange={(event) => {
                  setTrainerId(event.target.value)
                  setEpoch((value) => value + 1)
                }}
              >
                {TRAINERS.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Resultado{' '}
              <select
                value={winner}
                onChange={(event) => {
                  setWinner(event.target.value as 'player' | 'trainer')
                  setEpoch((value) => value + 1)
                }}
              >
                <option value="player">Derrota da treinadora</option>
                <option value="trainer">Vitória da treinadora</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className={styles.tools}>
        <Button
          onClick={() => {
            setMounted(false)
            setShowGrounding((value) => !value)
          }}
        >
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
      {mounted && (
        <Scenario
          key={epoch}
          restart={() => setEpoch((value) => value + 1)}
          pve={pve}
          trainerId={trainerId}
          winner={winner}
        />
      )}
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
