import { formatSize } from '../../../../server/src/contracts/formats'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { TeamEditor } from '../../components/TeamEditor/TeamEditor'
import { MatchBanner } from '../../components/MatchBanner/MatchBanner'
import moveIdentity from '../../components/MoveIdentity/MoveIdentity.module.css'
import { Button } from '../../components/Button'
import { TypeBadge } from '../../components/TypeBadge'
import { Sprite } from '../../components/Sprite'
import { AudioSettings } from '../../components/AudioSettings'
import { GameIcon } from '../../components/GameIcon/GameIcon'
import { Brand, MenuScenery, MenuEmblem } from '../../components/MenuArt/MenuArt'
import { useBattleContext } from '../../context/BattleProvider'
import { useBattle } from '../../hooks/useBattle'
import { useAudio } from '../../hooks/useAudio'
import { audio } from '../../lib/audio'
import { moveEffects } from '../../lib/moves'
import { categoryLabel, formatPokemonName, normalizeSearch } from '../../lib/format'
import type { PokemonMove } from '../../types/pokemon'
import styles from './TeamSetupPage.module.css'

const MAX_MOVES = 4

function MoveStats({ move }: { move: PokemonMove }) {
  return (
    <span className={styles.moveStats}>
      <span>
        <small>Poder</small>
        <b>{move.power ?? '—'}</b>
      </span>
      <span>
        <small>Precisão</small>
        <b>{move.accuracy == null ? '—' : `${move.accuracy}%`}</b>
      </span>
      <span>
        <small>PP</small>
        <b>{move.pp ?? '—'}</b>
      </span>
    </span>
  )
}

/** Prepara a equipe sem mudar IDs ou regras do catálogo. */
export function TeamSetupPage() {
  const { state, playerId, setMoves, acceptTeam, leave, setupPending, moveDrafts: chosenByPokemon, draftMoves } = useBattleContext()
  const navigate = useNavigate()
  const { myPlayer } = useBattle()
  const audioPrefs = useAudio()
  const [selectedId, setSelectedId] = useState(() => myPlayer?.team[0]?.pokemon ?? '')
  const [moveQuery, setMoveQuery] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)

  const TEAM_SIZE = state ? formatSize(state.wire.format) : 6
  const team = myPlayer?.team ?? []
  const selected = team.find(member => member.pokemon === selectedId) ?? team[0]
  const selectedIndex = team.findIndex(member => member === selected)
  const validMoves = team.every((member) => {
    const moves = chosenByPokemon[member.pokemon] ?? member.selectedMoves
    return moves.length > 0 && moves.length <= MAX_MOVES
  })

  useEffect(() => {
    audioPrefs.playMusic('menu')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chosen = useMemo(
    () => (selected ? (chosenByPokemon[selected.pokemon] ?? selected.selectedMoves) : []),
    [selected, chosenByPokemon]
  )
  const candidateMoves = useMemo(() => {
    const term = normalizeSearch(moveQuery)
    return (selected?.moves ?? []).filter(
      (move) =>
        (!term ||
          normalizeSearch(move.displayName ?? move.name).includes(term) ||
          normalizeSearch(move.name).includes(term)) &&
        (!onlyAvailable || !move.unsupported?.length)
    )
  }, [selected, moveQuery, onlyAvailable])

  if (!state || !playerId) return <Navigate to="/" replace />
  if (state.phase !== 'setup' || myPlayer?.ready) return <Navigate to="/batalha" replace />
  if (team.length < TEAM_SIZE) return <Navigate to="/selecao" replace />

  function selectMember(index: number) {
    audio.play('hover')
    setSelectedId(team[index].pokemon)
    setMoveQuery('')
  }
  function toggle(moveName: string) {
    if (!selected) return
    audio.play('click')
      const currentChosen = chosenByPokemon[selected.pokemon] ?? selected.selectedMoves
      const next = currentChosen.includes(moveName)
        ? currentChosen.filter((name) => name !== moveName)
        : currentChosen.length < MAX_MOVES
          ? [...currentChosen, moveName]
          : currentChosen
      draftMoves(selected.pokemon, next)
  }
  function keepSuggested() {
    if (!selected) return
    audio.play('select')
    draftMoves(selected.pokemon, selected.selectedMoves)
    setMoves(selected.pokemon, selected.selectedMoves)
  }
  function saveMoves() {
    if (!selected || chosen.length === 0 || chosen.length > MAX_MOVES) return
    audio.play('select')
    setMoves(selected.pokemon, chosen)
  }

  return (
    <main className={styles.page}>
      <MenuScenery menu="setup" />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <Brand /> <span>02 / 03 · preparar golpes</span>
          </p>
          <h1 className={styles.title}>Prepare sua equipe</h1>
          <p className={styles.subtitle}>
            Até 4 golpes por Pokémon. A troca é opcional — os sugeridos já valem.
          </p>
        </div>
        <div className={styles.tools}>
          <MenuEmblem menu="setup" />
          <AudioSettings />
          <Button variant="ghost" size="sm" onClick={leave}>
            Sair
          </Button>
        </div>
      </header>

      <MatchBanner />
      <TeamEditor />

      <div className={styles.workspace}>
        <nav className={styles.tabs} aria-label="Pokémon da equipe">
          <div className={styles.partyHeading}>
            <GameIcon name="ball" size={18} /> Sua equipe <span>{TEAM_SIZE} / {TEAM_SIZE}</span>
          </div>
          {team.map((member, index) => {
            const count = (chosenByPokemon[member.pokemon] ?? member.selectedMoves).length
            return (
              <button
                key={member.pokemon}
                className={
                  index === selectedIndex ? `${styles.tab} ${styles.tabActive}` : styles.tab
                }
                onClick={() => selectMember(index)}
                aria-current={index === selectedIndex ? 'true' : undefined}
              >
                <span className={styles.tabIndex}>{String(index + 1).padStart(2, '0')}</span>
                <Sprite
                  src={member.image}
                  name={member.pokemon}
                  size={48}
                  className={styles.tabSprite}
                />
                <span className={styles.tabSummary}>
                  <span className={styles.tabName}>{formatPokemonName(member.pokemon)}</span>
                  <span className={styles.tabMoveCount}>
                    {count} golpe{count === 1 ? '' : 's'} equipado{count === 1 ? '' : 's'}
                  </span>
                </span>
                <span
                  className={styles.tabReady}
                  data-ready={count > 0 || undefined}
                  aria-label={count ? 'Preparado' : 'Sem golpes'}
                >
                  <GameIcon name={count ? 'check' : 'ball'} size={14} />
                </span>
              </button>
            )
          })}
        </nav>

        {selected && (
          <section
            className={styles.detail}
            aria-label={`Preparar ${formatPokemonName(selected.pokemon)}`}
          >
            <article className={styles.infoCard}>
              <div className={styles.portrait}>
                <Sprite
                  src={selected.image}
                  name={selected.pokemon}
                  size={140}
                  className={styles.sprite}
                  loading="eager"
                />
              </div>
              <div className={styles.identity}>
                <span className={styles.pokemonKicker}>
                  Pokémon {selectedIndex + 1} / {TEAM_SIZE} · Nível 50
                </span>
                <h2 className={styles.pokemonName}>{formatPokemonName(selected.pokemon)}</h2>
                <div className={styles.types}>
                  {selected.types.map((type) => (
                    <TypeBadge key={type} type={type} />
                  ))}
                </div>
                <div className={styles.abilityRow}>
                  <span>Habilidade</span>
                  <ul className={styles.abilities}>
                    {selected.abilities.map((ability) => (
                      <li key={ability}>{ability}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className={styles.memberHp}>
                <span>HP</span>
                <b>{selected.maxHp}</b>
                <small>Pronto para a arena</small>
              </div>
            </article>

            <article className={styles.moves}>
              <div className={styles.movesHeader}>
                <div>
                  <p className={styles.sectionKicker}>Seu conjunto de golpes</p>
                  <h3 className={styles.movesTitle}>Golpes equipados</h3>
                </div>
                <output
                  className={styles.moveCount}
                  aria-live="polite"
                  aria-atomic="true"
                  data-full={chosen.length === MAX_MOVES || undefined}
                  aria-label={`${chosen.length} de ${MAX_MOVES} golpes`}
                >
                  {chosen.length}/{MAX_MOVES}
                </output>
              </div>
              <div className={styles.chosenRow} aria-label="Golpes escolhidos">
                {Array.from({ length: MAX_MOVES }, (_, index) => {
                  const name = chosen[index]
                  const move = selected.moves.find((candidate) => candidate.name === name)
                  return move ? (
                    <button
                      key={name}
                      className={`${styles.chosen} ${moveIdentity.surface}`}
                      data-move-type={move.type}
                      style={{ '--move-type': `var(--type-${move.type}, var(--type-normal))` } as CSSProperties}
                      onClick={() => toggle(name)}
                      aria-label={`Remover ${move.displayName ?? name} dos golpes escolhidos`}
                    >
                      <span className={styles.chosenName}>
                        <span className={styles.chosenIndex}>{index + 1}</span>
                        {move.displayName ?? name}
                        <span className={styles.remove} aria-hidden="true">
                          ×
                        </span>
                      </span>
                      <span className={styles.moveMeta}>
                        <TypeBadge type={move.type} small />
                        <span>{categoryLabel(move.category)}</span>
                      </span>
                      <MoveStats move={move} />
                    </button>
                  ) : (
                    <div key={`empty-${index}`} className={styles.emptySlot}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <p>Escolha um golpe</p>
                    </div>
                  )
                })}
              </div>
              {chosen.length === 0 && (
                <span className={styles.chosenHint}>Escolha de 1 a 4 golpes abaixo</span>
              )}
              <div className={styles.moveActions}>
                <Button variant="ghost" onClick={keepSuggested} disabled={setupPending}>
                  Manter sugeridos
                </Button>
                <Button
                  onClick={saveMoves}
                  disabled={chosen.length === 0 || chosen.length > MAX_MOVES || setupPending}
                >
                  Salvar golpes
                </Button>
              </div>

              <div className={styles.candidatesHeader}>
                <div>
                  <h3 className={styles.movesTitle}>Golpes disponíveis</h3>
                  <p>{candidateMoves.length} no catálogo deste Pokémon</p>
                </div>
                <label className={styles.moveSearch}>
                  <span className="sr-only">Buscar golpe pelo nome</span>
                  <input
                    type="search"
                    placeholder="Buscar golpe…"
                    value={moveQuery}
                    onChange={(event) => setMoveQuery(event.target.value)}
                  />
                </label>
              </div>
              <label className={styles.availableFilter}>
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(event) => setOnlyAvailable(event.target.checked)}
                />{' '}
                Mostrar somente golpes compatíveis
              </label>
              <div className={styles.moveGrid}>
                {candidateMoves.map((move) => {
                  const isSelected = chosen.includes(move.name)
                  const disabled =
                    Boolean(move.unsupported?.length) || (!isSelected && chosen.length >= MAX_MOVES)
                  return (
                    <article
                      key={move.name}
                      className={`${styles.moveCard} ${moveIdentity.surface} ${isSelected ? styles.moveSelected : ''}`}
                      data-move-type={move.type}
                      style={{ '--move-type': `var(--type-${move.type}, var(--type-normal))` } as CSSProperties}
                      data-unavailable={Boolean(move.unsupported?.length) || undefined}
                    >
                      <button
                        className={styles.moveChoice}
                        disabled={disabled}
                        onClick={() => toggle(move.name)}
                        onMouseEnter={() => !disabled && audio.play('hover')}
                        aria-pressed={isSelected}
                        title={move.description ?? move.name}
                      >
                        <span className={styles.moveName}>
                          <span className={styles.check} aria-hidden="true">
                            {isSelected ? '✓' : '+'}
                          </span>
                          {move.displayName ?? move.name}
                        </span>
                        <span className={styles.moveMeta}>
                          <TypeBadge type={move.type} small />
                          <span>{categoryLabel(move.category)}</span>
                        </span>
                        <MoveStats move={move} />
                        <span className={styles.effects}>
                          {moveEffects(move)
                            .slice(0, 3)
                            .map((effect) => (
                              <em
                                key={effect.label}
                                className={`${styles.effect} ${styles[effect.tone]}`}
                              >
                                {effect.label}
                              </em>
                            ))}
                        </span>
                        {move.unsupported?.length ? (
                          <span className={styles.unsupported}>{move.unsupported.join(', ')}</span>
                        ) : null}
                      </button>
                      <details className={styles.moveDescription}>
                        <summary>Detalhes do golpe</summary>
                        <p>{move.description || 'Descrição não disponível.'}</p>
                      </details>
                    </article>
                  )
                })}
                {candidateMoves.length === 0 && (
                  <p className={styles.emptyMoves} role="status">
                    Nenhum golpe encontrado com esse nome.
                  </p>
                )}
              </div>
            </article>
          </section>
        )}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerNote}>
          <GameIcon name="check" size={18} />
          <span>
            {validMoves
              ? 'Sua equipe está preparada.'
              : 'Escolha pelo menos um golpe para cada Pokémon.'}
            <small>Confirme quando terminar de ajustar seus golpes.</small>
          </span>
        </div>
        <div className={styles.footerActions}>
          <Button variant="ghost" onClick={() => navigate('/selecao')} disabled={setupPending}>
            ← Voltar à seleção
          </Button>
          <Button
            size="lg"
            disabled={!validMoves || setupPending}
            onClick={() => {
              audio.play('start')
              for (const member of team) {
                const moves = chosenByPokemon[member.pokemon]
                if (moves) setMoves(member.pokemon, moves)
              }
              acceptTeam()
            }}
          >
            Aceitar equipe e batalhar ▶
          </Button>
        </div>
      </footer>
    </main>
  )
}
