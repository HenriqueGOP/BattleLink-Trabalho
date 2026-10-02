import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { TypeBadge } from '../../components/TypeBadge'
import { Sprite } from '../../components/Sprite'
import { AudioSettings } from '../../components/AudioSettings'
import { useBattleContext } from '../../context/BattleProvider'
import { useBattle } from '../../hooks/useBattle'
import { useAudio } from '../../hooks/useAudio'
import { audio } from '../../lib/audio'
import { moveEffects } from '../../lib/moves'
import styles from './TeamSetupPage.module.css'

const MAX_MOVES = 4

/** Golpes por Pokémon (máx 4) + "Manter sugeridos" + aceitar equipe. */
export function TeamSetupPage() {
  const { state, playerId, setMoves, acceptTeam, resetTeam, leave } = useBattleContext()
  const { myPlayer } = useBattle()
  const audioPrefs = useAudio()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [chosenByPokemon, setChosenByPokemon] = useState<Record<string, string[]>>({})

  const team = myPlayer?.team ?? []
  const selected = team[selectedIndex]

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

  if (!state || !playerId) return <Navigate to="/" replace />
  if (state.phase !== 'setup' || myPlayer?.ready) return <Navigate to="/batalha" replace />
  if (team.length < 6) return <Navigate to="/selecao" replace />

  function selectMember(index: number) {
    audio.play('hover')
    setSelectedIndex(index)
  }

  function toggle(moveName: string) {
    if (!selected) return
    audio.play('click')
    setChosenByPokemon((current) => {
      const currentChosen = current[selected.pokemon] ?? selected.selectedMoves
      const next = currentChosen.includes(moveName)
        ? currentChosen.filter((name) => name !== moveName)
        : currentChosen.length < MAX_MOVES
          ? [...currentChosen, moveName]
          : currentChosen
      return { ...current, [selected.pokemon]: next }
    })
  }

  function keepSuggested() {
    if (!selected) return
    audio.play('select')
    setChosenByPokemon((current) => ({ ...current, [selected.pokemon]: selected.selectedMoves }))
    setMoves(selected.pokemon, selected.selectedMoves)
  }

  function saveMoves() {
    if (!selected || chosen.length === 0 || chosen.length > MAX_MOVES) return
    audio.play('select')
    setMoves(selected.pokemon, chosen)
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>02 · preparar golpes</p>
          <h1 className={styles.title}>Prepare sua equipe</h1>
          <p className={styles.subtitle}>
            Até 4 golpes por Pokémon. A troca é opcional — os sugeridos já valem.
          </p>
        </div>
        <div className={styles.tools}>
          <AudioSettings />
          <Button variant="ghost" size="sm" onClick={leave}>
            Sair
          </Button>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Pokémon da equipe">
        {team.map((member, index) => (
          <button
            key={member.pokemon}
            className={index === selectedIndex ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => selectMember(index)}
            aria-current={index === selectedIndex ? 'true' : undefined}
          >
            <span className={styles.tabIndex}>{index + 1}</span>
            <Sprite
              src={member.image}
              name={member.pokemon}
              size={40}
              className={styles.tabSprite}
            />
            <span className={styles.tabName}>{member.pokemon}</span>
          </button>
        ))}
      </nav>

      {selected && (
        <section className={styles.detail}>
          <article className={styles.infoCard}>
            <h2 className={styles.pokemonName}>{selected.pokemon}</h2>
            <Sprite
              src={selected.image}
              name={selected.pokemon}
              size={108}
              className={styles.sprite}
              loading="eager"
            />
            <div className={styles.types}>
              {selected.types.map((type) => (
                <TypeBadge key={type} type={type} />
              ))}
            </div>
            <p className={styles.subtitle}>Habilidades possíveis</p>
            <ul className={styles.abilities}>
              {selected.abilities.map((ability) => (
                <li key={ability}>{ability}</li>
              ))}
            </ul>
          </article>

          <article className={styles.moves}>
            <div className={styles.movesHeader}>
              <h3 className={styles.movesTitle}>Golpes equipados</h3>
              <output
                className={styles.moveCount}
                data-full={chosen.length === MAX_MOVES ? 'true' : undefined}
                aria-label={`${chosen.length} de ${MAX_MOVES} golpes`}
              >
                {chosen.length}/{MAX_MOVES}
              </output>
            </div>

            <div className={styles.chosenRow} aria-label="Golpes escolhidos">
              {chosen.map((name) => (
                <span key={name} className={styles.chosen}>
                  {name}
                </span>
              ))}
              {chosen.length === 0 && (
                <span className={styles.chosenHint}>Escolha de 1 a 4 golpes abaixo</span>
              )}
            </div>

            <div className={styles.moveGrid}>
              {selected.moves.map((move) => {
                const isSelected = chosen.includes(move.name)
                const disabled = !isSelected && chosen.length >= MAX_MOVES
                return (
                  <button
                    key={move.name}
                    className={`${styles.moveCard} ${isSelected ? styles.moveSelected : ''}`}
                    disabled={disabled}
                    onClick={() => toggle(move.name)}
                    onMouseEnter={() => !disabled && audio.play('hover')}
                    aria-pressed={isSelected}
                    title={move.description ?? move.name}
                  >
                    <span className={styles.moveName}>
                      <i className={styles.check} aria-hidden="true">
                        {isSelected ? '✓' : ''}
                      </i>
                      {move.name}
                    </span>
                    <TypeBadge type={move.type} small />
                    <span className={styles.moveStats}>
                      PODER {move.power ?? '—'} · PREC {move.accuracy ?? '—'} · PP {move.pp ?? '—'}
                    </span>
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
                  </button>
                )
              })}
            </div>

            <div className={styles.moveActions}>
              <Button variant="ghost" onClick={keepSuggested}>
                Manter sugeridos
              </Button>
              <Button
                onClick={saveMoves}
                disabled={chosen.length === 0 || chosen.length > MAX_MOVES}
              >
                Salvar golpes
              </Button>
            </div>
          </article>
        </section>
      )}

      <footer className={styles.footer}>
        <Button
          size="lg"
          disabled={!validMoves}
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
        <Button variant="ghost" onClick={resetTeam}>
          ← Voltar e refazer a equipe
        </Button>
      </footer>
    </main>
  )
}
