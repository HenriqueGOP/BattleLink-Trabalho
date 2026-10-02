import { useCallback, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AudioSettings } from '../../components/AudioSettings'
import { Button } from '../../components/Button'
import { useAudio } from '../../hooks/useAudio'
import { useBattle } from '../../hooks/useBattle'
import { useBattleContext } from '../../context/BattleProvider'
import { useBattleEvents } from '../../hooks/useBattleEvents'
import { BattleControls } from './components/BattleControls'
import { BattleEffects } from './components/BattleEffects'
import { BattleBackground } from './components/BattleBackground'
import { BattleLog } from './components/BattleLog'
import { CommandBar } from './components/CommandBar'
import { BattleSpot } from './components/BattleSpot'
import { DamageNumbers } from './components/DamageNumbers'
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
  const { state, playerId, roomId, status, opponentLeft, leave, attack, switchTo } =
    useBattleContext()
  const { myIndex, myPlayer, opponent, myTurn, blocked, canChoose, canSetupMoves } = useBattle()
  const audioApi = useAudio()
  const navigate = useNavigate()

  // Um painel por vez, como no menu original: LUTAR abre os golpes,
  // POKÉMON abre a equipe. Abrir um fecha o outro.
  const [panel, setPanel] = useState<'moves' | 'party' | null>('moves')
  // golpe destacado no menu: vira a ficha exibida na caixa de mensagem
  const [previewMove, setPreviewMove] = useState<PokemonMove | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const mySpriteRef = useRef<HTMLDivElement>(null)
  const oppSpriteRef = useRef<HTMLDivElement>(null)

  const getPlayer = useCallback(
    (side: 'me' | 'opponent') => (side === 'me' ? mySpriteRef.current : oppSpriteRef.current),
    []
  )
  const getPlayerState = useCallback(
    (side: 'me' | 'opponent') => (side === 'me' ? myPlayer : opponent),
    [myPlayer, opponent]
  )

  const { current, totals, logEntries } = useBattleEvents(state, myIndex, roomId)

  // Pokémon caiu: o jogo obriga a escolher um substituto, então a equipe abre
  // sozinha. Painel derivado (sem efeito): quando o bloqueio sai, volta ao que
  // o jogador tinha aberto.
  const activePanel = blocked ? 'party' : panel

  if (!state || !playerId) return <Navigate to="/" replace />
  if (canChoose) return <Navigate to="/selecao" replace />
  if (canSetupMoves) return <Navigate to="/equipe" replace />

  const finished = state.phase === 'finished'
  const lastLogMessage = logEntries.at(-1)?.text ?? ''
  // cena pronta = ambos com Pokémon ativo e HP real; antes disso, espera sincronizada
  const sceneReady = Boolean(
    state.phase !== 'preparing' &&
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
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <i className={styles.ball} aria-hidden="true" />
          <span>
            POKéMON <b>BATTLE</b>
          </span>
        </div>
        <span className={styles.room}>{status}</span>
        <div className={styles.tools}>
          <AudioSettings />
          <Button variant="ghost" size="sm" onClick={leaveAndHome}>
            Sair
          </Button>
        </div>
      </header>

      {!sceneReady ? (
        <section className={styles.waiting} aria-live="polite">
          <span className={styles.waitingBall} aria-hidden="true" />
          <h2>
            {state.phase === 'preparing'
              ? 'Preparando a batalha…'
              : iAmReady
                ? 'Aguardando o oponente confirmar a equipe…'
                : 'Preparando a batalha…'}
          </h2>
          <p>O campo é liberado para os dois jogadores ao mesmo tempo, direto do servidor.</p>
        </section>
      ) : (
        <>
          <div className={styles.layout}>
            <section
              className={styles.stage}
              ref={stageRef}
              aria-label="Campo de batalha"
              data-fx-stage
            >
              {/* profundidade: cenário → clima → spots(círculos+sprites) → efeitos → HUD */}
              <BattleBackground background={state.field.background} />
              <WeatherLayer weather={state.field.weather} terrain={state.field.terrain} />
              <div className={styles.spots}>
                <HudCard player={opponent} opponent />
                <BattleSpot player={opponent} opponent spriteRef={oppSpriteRef} />
                <BattleSpot
                  player={myPlayer}
                  opponent={false}
                  spriteRef={mySpriteRef}
                  urgent={blocked}
                />
                <HudCard player={myPlayer} opponent={false} />
              </div>
              <div className={styles.turnDock}>
                <TurnIndicator myTurn={myTurn} finished={finished} turnEvent={current} />
              </div>
            </section>
          </div>

          <CommandBar
            message={lastLogMessage}
            myTurn={myTurn}
            myPokemon={myPlayer?.pokemon}
            panelMode={activePanel === 'moves'}
            preview={activePanel === 'moves' ? previewMove : null}
          >
            {activePanel === 'moves' ? (
              <>
                <MoveMenu
                  player={myPlayer}
                  myTurn={myTurn}
                  blocked={blocked}
                  request={state.wire.battle?.request ?? null}
                  onAttack={attack}
                  onPreview={setPreviewMove}
                  bare
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.backBtn}
                  onClick={() => setPanel(null)}
                >
                  ◀ VOLTAR
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="fight"
                  className={styles.commandBtn}
                  aria-expanded={false}
                  onClick={() => setPanel('moves')}
                >
                  LUTAR
                </Button>
                <Button
                  variant="party"
                  className={styles.commandBtn}
                  aria-expanded={activePanel === 'party'}
                  onClick={() => setPanel((open) => (open === 'party' ? null : 'party'))}
                >
                  POKÉMON
                </Button>
                <Button variant="run" className={styles.commandBtn} onClick={leaveAndHome}>
                  FUGIR
                </Button>
              </>
            )}
          </CommandBar>

          <div className={styles.drawer}>
            {activePanel === 'party' && (
              <BattleControls
                player={myPlayer}
                myTurn={myTurn}
                blocked={blocked}
                request={state.wire.battle?.request ?? null}
                onSwitch={switchTo}
              />
            )}
            <BattleLog entries={logEntries} />
          </div>

          <BattleEffects
            event={current}
            stageRef={stageRef}
            getPlayer={getPlayer}
            getPlayerState={getPlayerState}
          />
          <DamageNumbers event={current} getTarget={getPlayer} />
        </>
      )}
      {finished && (
        <EndOverlay
          state={state}
          myId={playerId}
          totals={totals}
          opponentLeft={opponentLeft}
          onLeave={leaveAndHome}
        />
      )}
    </main>
  )
}
