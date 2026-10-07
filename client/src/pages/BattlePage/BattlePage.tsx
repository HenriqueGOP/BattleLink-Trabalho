import { TrainerSprite } from '../../components/TrainerArt/TrainerArt'
import { SCENE_LAYOUT } from '../../lib/presentation/sceneLayout'
import { MatchBanner } from '../../components/MatchBanner/MatchBanner'
import { useCallback, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AudioSettings } from '../../components/AudioSettings'
import { MotionSettings } from '../../components/MotionSettings/MotionSettings'
import { Button } from '../../components/Button'
import { arenaMenuStyle, resolveBackground } from '../../config/battleBackgrounds'
import { Brand, MenuScenery, MenuEmblem } from '../../components/MenuArt/MenuArt'
import { useAudio } from '../../hooks/useAudio'
import { useBattle } from '../../hooks/useBattle'
import { useBattleContext } from '../../context/BattleProvider'
import { useBattleEvents } from '../../hooks/useBattleEvents'
import { BattleControls } from './components/BattleControls'
import { BattleProfiler } from './components/BattleProfiler'
import { BattleBackground } from './components/BattleBackground'
import { BattleLog } from './components/BattleLog'
import { CommandBar } from './components/CommandBar'
import { BattleSpot } from './components/BattleSpot'
import { HudCard } from './components/HudCard'
import { MoveMenu } from './components/MoveMenu'
import { TurnIndicator } from './components/TurnIndicator'
import { WeatherLayer } from './components/WeatherLayer'
import { EndOverlay } from './components/EndOverlay'
import styles from './BattlePage.module.css'
import type { PokemonMove } from '../../types/pokemon'

/**
 * Batalha: só monta a cena quando o snapshot já tem Pokémon ativo nos DOIS
 * lados (dados completos => zero flash de estado vazio). Antes disso, o
 * jogador pronto vê a tela de espera — a liberação vem do estado do servidor
 * (nenhum timeout no cliente).
 */
export function BattlePage() {
  const {
    state: authoritative,
    playerId,
    status,
    opponentLeft,
    leave, rematch,
    attack,
    switchTo,
  } = useBattleContext()
  const { myIndex, myTurn: canAct, blocked, canChoose, canSetupMoves } = useBattle()
  const audioApi = useAudio()
  const navigate = useNavigate()

  // Um painel por vez, como no menu original: LUTAR abre os golpes,
  // POKÉMON abre a equipe. Abrir um fecha o outro.
  const [panel, setPanel] = useState<'moves' | 'party'>('moves')
  // golpe destacado no menu: vira a ficha exibida na caixa de mensagem
  const [previewMove, setPreviewMove] = useState<PokemonMove | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const mySpriteRef = useRef<HTMLDivElement>(null)
  const oppSpriteRef = useRef<HTMLDivElement>(null)
  const getStage = useCallback(() => stageRef.current, [])

  const getPlayer = useCallback(
    (side: 'me' | 'opponent') => (side === 'me' ? mySpriteRef.current : oppSpriteRef.current),
    []
  )
  const {
    presented: state,
    current,
    totals,
    logEntries,
    busy,
    hidden,
    skip,
  } = useBattleEvents(authoritative, myIndex, getStage, getPlayer)
  const myPlayer = state && myIndex >= 0 ? state.players[myIndex] : null
  const opponent = state && myIndex >= 0 ? state.players[1 - myIndex] : null
  const myTurn = canAct && !busy

  // Pokémon caiu: o jogo obriga a escolher um substituto, então a equipe abre
  // sozinha. Painel derivado (sem efeito): quando o bloqueio sai, volta ao que
  // o jogador tinha aberto.
  const activePanel = blocked && !busy ? 'party' : panel

  if (!state || !playerId) return <Navigate to="/" replace />
  if (canChoose) return <Navigate to="/selecao" replace />
  if (canSetupMoves) return <Navigate to="/equipe" replace />

  const finished = state.phase === 'finished' && !busy
  const lastLogMessage = current?.message ?? logEntries.at(-1)?.text ?? ''
  // cena pronta = ambos com Pokémon ativo e HP real; antes disso, espera sincronizada
  const sceneReady = Boolean(
    authoritative?.phase !== 'preparing' &&
    myPlayer?.pokemon &&
    opponent?.pokemon &&
    (opponent.maxHp ?? 0) > 0
  )
  const iAmReady = Boolean(myPlayer?.ready)

  function leaveAndHome() {
    audioApi.play('click')
    leave()
    navigate('/')
  }

  return (
    <main className={styles.page} data-arena={state.field.background} style={arenaMenuStyle(state.field.background, state.wire.trainerId)}>
      <header className={styles.topbar}>
        <Brand />
        <span className={styles.room}>{status}</span>
        <div className={styles.tools}>
          <AudioSettings />
          <MotionSettings />
          <Button variant="ghost" size="sm" onClick={skip} disabled={!busy}>
            Pular animações
          </Button>
          <Button variant="ghost" size="sm" onClick={leaveAndHome}>
            Sair
          </Button>
        </div>
      </header>

      <MatchBanner />
      {!sceneReady ? (
        <section className={styles.waiting} aria-live="polite">
          <MenuScenery menu="ready" panel />
          <MenuEmblem menu="ready" />
          <h2>
            {state.phase === 'preparing'
              ? 'Preparando a batalha…'
              : iAmReady
                ? 'Aguardando o oponente confirmar a equipe…'
                : 'Preparando a batalha…'}
          </h2>
          <p>Quase lá! Sua equipe vai entrar em campo assim que os dois estiverem prontos.</p>
        </section>
      ) : (
        <>
          <div className={styles.battleHeading}>
            <div>
              <span className={styles.eyebrow}>BATALHA ONLINE</span>
              <h1>{resolveBackground(state.field.background, state.wire.trainerId).name}</h1>
            </div>
            <div className={styles.turnDock}>
              <span className={styles.round}>Rodada {state.wire.battle?.round ?? 1}</span>
              <TurnIndicator myTurn={myTurn} finished={finished} />
            </div>
          </div>
          <div className={styles.layout}>
            <BattleProfiler>
              <section
                className={styles.stage}
                ref={stageRef}
                aria-label="Campo de batalha"
                data-fx-stage
                data-paused={hidden || finished ? 'true' : undefined}
                data-animation={busy ? (current?.type ?? 'sync') : 'idle'}
                data-trainer-phase={state.wire.trainerId && busy && current?.type === 'battle_start' ? 'pending' : undefined}
                data-event-sequence={current?.id ?? state.wire.sequence}
              >
            {state.wire.trainerId && <div className={styles.trainerIntro} style={{ left: `${SCENE_LAYOUT.trainer.x}%`, top: `${SCENE_LAYOUT.trainer.y}%` }} data-trainer-intro aria-hidden="true"><TrainerSprite id={state.wire.trainerId} /></div>}
                {/* O cenário, os atores e os efeitos compartilham o mesmo campo. */}
                <BattleBackground background={state.field.background} trainerId={state.wire.trainerId} />
                {(state.field.weather || state.field.terrain) && (
                  <WeatherLayer weather={state.field.weather} terrain={state.field.terrain} />
                )}
                <div className={styles.spots}>
                  <HudCard player={opponent} opponent />
                  <BattleSpot player={opponent} opponent spriteRef={oppSpriteRef} paused={hidden || finished} />
                  <BattleSpot
                    player={myPlayer}
                    opponent={false}
                    spriteRef={mySpriteRef}
                    urgent={blocked}
                    paused={hidden || finished}
                  />
                  <HudCard player={myPlayer} opponent={false} />
                </div>
              </section>
            </BattleProfiler>
          </div>

          <nav className={styles.actionTabs} aria-label="Menu de batalha">
            <span>Sua ação</span>
            <Button
              variant={activePanel === 'moves' ? 'fight' : 'ghost'}
              size="sm"
              aria-pressed={activePanel === 'moves'}
              onClick={() => setPanel('moves')}
            >
              LUTAR
            </Button>
            <Button
              variant={activePanel === 'party' ? 'party' : 'ghost'}
              size="sm"
              aria-pressed={activePanel === 'party'}
              onClick={() => setPanel('party')}
            >
              POKÉMON
            </Button>
            <Button variant="ghost" size="sm" onClick={leaveAndHome}>
              FUGIR
            </Button>
          </nav>
          <CommandBar
            message={lastLogMessage}
            myTurn={myTurn}
            myPokemon={myPlayer?.pokemon}
            panelMode
            preview={!busy && activePanel === 'moves' ? previewMove : null}
          >
            {activePanel === 'moves' ? (
              <>
                <MoveMenu
                  player={myPlayer}
                  myTurn={myTurn}
                  blocked={blocked}
                  request={authoritative?.wire.battle?.request ?? null}
                  onAttack={attack}
                  onPreview={setPreviewMove}
                  bare
                />
              </>
            ) : (
              <BattleControls
                player={myPlayer}
                myTurn={myTurn}
                blocked={blocked}
                request={authoritative?.wire.battle?.request ?? null}
                onSwitch={switchTo}
              />
            )}
          </CommandBar>

          <div className={styles.drawer}>
            <BattleLog entries={logEntries} />
          </div>
        </>
      )}
      {finished && (
        <EndOverlay
          state={state}
          myId={playerId}
          totals={totals}
          opponentLeft={opponentLeft}
          onLeave={leaveAndHome}
          onRematch={rematch}
        />
      )}
    </main>
  )
}
