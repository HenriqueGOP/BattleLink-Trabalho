import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { PokeballSpinner } from '../../components/PokeballSpinner'
import { Sprite } from '../../components/Sprite'
import { AudioSettings } from '../../components/AudioSettings'
import { GameIcon } from '../../components/GameIcon/GameIcon'
import { useBattleContext } from '../../context/BattleProvider'
import { useBattle } from '../../hooks/useBattle'
import { useCatalog } from '../../hooks/useCatalog'
import { useAudio } from '../../hooks/useAudio'
import { audio } from '../../lib/audio'
import type { PokemonSummary } from '../../types/pokemon'
import styles from './SelectionPage.module.css'

const TEAM_SIZE = 6

const PokemonCard = ({
  pokemon,
  chosen,
  onChoose,
}: {
  pokemon: PokemonSummary
  chosen: boolean
  onChoose: (name: string) => void
}) => (
  <button
    className={styles.card}
    disabled={chosen}
    onClick={() => {
      audio.play('select')
      onChoose(pokemon.name)
    }}
    onMouseEnter={() => audio.play('hover')}
    aria-label={`Escolher ${pokemon.name}`}
  >
    <span className={styles.number}>#{String(pokemon.id).padStart(3, '0')}</span>
    <Sprite src={pokemon.image} name={pokemon.name} size={76} className={styles.image} />
    <span className={styles.name}>{pokemon.name}</span>
    <span className={styles.plus} aria-hidden="true">
      {chosen ? '✓' : '＋'}
    </span>
  </button>
)

/** Catálogo + busca + sorteio. Equipe 0/6 → 6/6. */
export function SelectionPage() {
  const { state, playerId, choosePokemon, randomTeam, leave } = useBattleContext()
  const { myPlayer } = useBattle()
  const navigate = useNavigate()
  const audioPrefs = useAudio()
  const { catalog, loading, error, retry } = useCatalog()
  const [query, setQuery] = useState('')
  const [drawKey, setDrawKey] = useState(0)

  const team = useMemo(() => myPlayer?.team ?? [], [myPlayer])

  useEffect(() => {
    audioPrefs.playMusic('menu')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // equipe completa → configurar golpes
  useEffect(() => {
    if (state?.phase === 'setup' && !myPlayer?.ready && team.length >= TEAM_SIZE)
      navigate('/equipe')
  }, [team.length, navigate, state?.phase, myPlayer?.ready])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    const chosen = new Set(team.map((member) => member.pokemon))
    return catalog
      .filter((pokemon) => pokemon.name.includes(term))
      .map((pokemon) => ({ pokemon, chosen: chosen.has(pokemon.name) }))
  }, [catalog, query, team])

  function draw(count: number) {
    audio.play('select')
    randomTeam(count)
    setDrawKey((key) => key + 1)
  }

  if (!state || !playerId) return <Navigate to="/" replace />
  if (state.phase !== 'setup' || myPlayer?.ready) return <Navigate to="/batalha" replace />

  return (
    <main className={styles.page} aria-busy={loading}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>01 · montar equipe</p>
          <h1 className={styles.title}>Escolha seus seis</h1>
        </div>
        <div className={styles.headerTools}>
          <output
            className={styles.counter}
            aria-label={`Equipe ${team.length} de ${TEAM_SIZE}`}
            data-full={team.length === TEAM_SIZE ? 'true' : undefined}
            key={drawKey}
          >
            <b>{team.length}</b>/{TEAM_SIZE}
          </output>
          <AudioSettings />
          <Button variant="ghost" size="sm" onClick={leave}>
            Sair
          </Button>
        </div>
      </header>

      <section className={`gb-panel ${styles.teamRow}`} aria-label="Pokémon escolhidos">
        {team.map((member) => (
          <span className={styles.chip} key={member.pokemon}>
            <Sprite
              src={member.image}
              name={member.pokemon}
              size={32}
              className={styles.chipSprite}
            />
            <span className={styles.chipName}>{member.pokemon}</span>
          </span>
        ))}
        {team.length === 0 && (
          <span className={styles.chipHint}>Nenhum Pokémon escolhido ainda</span>
        )}
      </section>

      <div className={styles.actions}>
        <Button
          variant="ghost"
          onClick={() => draw(1)}
          disabled={team.length >= TEAM_SIZE || loading}
        >
          <GameIcon name="dice" /> Sortear 1
        </Button>
        <Button
          onClick={() => draw(TEAM_SIZE - team.length)}
          disabled={team.length >= TEAM_SIZE || loading}
        >
          <GameIcon name="dice" /> Sortear equipe inteira
        </Button>
        <label className={styles.searchWrap}>
          <span className="sr-only">Buscar Pokémon pelo nome</span>
          <input
            className={styles.search}
            placeholder="Procurar Pokémon pelo nome…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {loading && (
        <div className={styles.skeletonGrid} aria-label="Carregando catálogo">
          {Array.from({ length: 12 }, (_, index) => (
            <div className={styles.skeleton} key={index} aria-hidden="true" />
          ))}
          <span className={styles.loadingRow} role="status">
            <PokeballSpinner size={30} label="Carregando catálogo" /> carregando os 1025…
          </span>
        </div>
      )}

      {error && (
        <div className={styles.errorBox} role="alert">
          <p>{error}</p>
          <Button variant="ghost" size="sm" onClick={retry}>
            Tentar de novo
          </Button>
        </div>
      )}

      {!loading && !error && (
        <div className={styles.grid} data-count={visible.length}>
          {visible.map(({ pokemon, chosen }) => (
            <PokemonCard
              key={pokemon.id}
              pokemon={pokemon}
              chosen={chosen}
              onChoose={choosePokemon}
            />
          ))}
          {visible.length === 0 && (
            <p className={styles.empty} role="status">
              Nenhum Pokémon encontrado com esse nome.
            </p>
          )}
        </div>
      )}
    </main>
  )
}
