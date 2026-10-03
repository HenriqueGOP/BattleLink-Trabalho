import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { PokeballSpinner } from '../../components/PokeballSpinner'
import { Sprite } from '../../components/Sprite'
import { TypeBadge } from '../../components/TypeBadge'
import { AudioSettings } from '../../components/AudioSettings'
import { GameIcon } from '../../components/GameIcon/GameIcon'
import { useBattleContext } from '../../context/BattleProvider'
import { useBattle } from '../../hooks/useBattle'
import { useCatalog } from '../../hooks/useCatalog'
import { useAudio } from '../../hooks/useAudio'
import { audio } from '../../lib/audio'
import { speciesById } from '../../lib/catalog'
import { formatPokemonName, matchesPokemonSearch, typeLabel } from '../../lib/format'
import type { PokemonSummary } from '../../types/pokemon'
import styles from './SelectionPage.module.css'

const TEAM_SIZE = 6
const PAGE_SIZE = 48
const STAT_LABELS = {
  hp: 'HP',
  atk: 'Ataque',
  def: 'Defesa',
  spa: 'Atq. Esp.',
  spd: 'Def. Esp.',
  spe: 'Velocidade',
} as const

function PokemonCard({
  pokemon,
  chosen,
  inspected,
  onChoose,
  onInspect,
}: {
  pokemon: PokemonSummary
  chosen: boolean
  inspected: boolean
  onChoose: (name: string) => void
  onInspect: (name: string) => void
}) {
  const species = speciesById(pokemon.name)
  return (
    <article
      className={styles.card}
      data-inspected={inspected || undefined}
      data-chosen={chosen || undefined}
    >
      <button
        className={styles.choose}
        disabled={chosen}
        onClick={() => {
          audio.play('select')
          onChoose(pokemon.name)
        }}
        onMouseEnter={() => audio.play('hover')}
        aria-label={`Escolher ${pokemon.name}`}
      >
        <span className={styles.number}>#{String(pokemon.id).padStart(3, '0')}</span>
        <span className={styles.plus} aria-hidden="true">
          {chosen ? '✓' : '+'}
        </span>
        <Sprite src={pokemon.image} name={pokemon.name} size={88} className={styles.image} />
        <span className={styles.name}>{formatPokemonName(pokemon.name)}</span>
        <span className={styles.types}>
          {species?.types.map((type) => (
            <TypeBadge key={type} type={type} small />
          ))}
        </span>
      </button>
      <button
        className={styles.inspect}
        onClick={() => onInspect(pokemon.name)}
        aria-label={`Ver detalhes de ${pokemon.name}`}
        aria-controls="pokemon-details"
      >
        Ver ficha <GameIcon name="arrow" size={14} />
      </button>
    </article>
  )
}

/** Catálogo local: IDs canônicos permanecem nas escolhas enviadas ao servidor. */
export function SelectionPage() {
  const { state, playerId, choosePokemon, randomTeam, leave } = useBattleContext()
  const { myPlayer } = useBattle()
  const navigate = useNavigate()
  const audioPrefs = useAudio()
  const { catalog, loading, error, retry } = useCatalog()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [inspectedId, setInspectedId] = useState('')
  const detailRef = useRef<HTMLElement>(null)
  const team = useMemo(() => myPlayer?.team ?? [], [myPlayer])

  useEffect(() => {
    audioPrefs.playMusic('menu')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (state?.phase === 'setup' && !myPlayer?.ready && team.length >= TEAM_SIZE)
      navigate('/equipe')
  }, [team.length, navigate, state?.phase, myPlayer?.ready])

  const visible = useMemo(() => {
    return catalog.filter((pokemon) => {
      return (
        matchesPokemonSearch(pokemon, query) &&
        (!typeFilter || speciesById(pokemon.name)?.types.some((type) => type === typeFilter))
      )
    })
  }, [catalog, query, typeFilter])
  const availableTypes = useMemo(
    () =>
      Array.from(
        new Set(catalog.flatMap((pokemon) => speciesById(pokemon.name)?.types ?? []))
      ).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), 'pt-BR')),
    [catalog]
  )
  const chosenIds = useMemo(() => new Set(team.map((member) => member.pokemon)), [team])
  const inspected =
    catalog.find((pokemon) => pokemon.name === inspectedId) ?? visible[0] ?? catalog[0]
  const detail = inspected ? speciesById(inspected.name) : undefined

  function draw(count: number) {
    audio.play('select')
    randomTeam(count)
  }

  function inspectPokemon(id: string) {
    setInspectedId(id)
    // One callback after the selected ficha commits, including repeated clicks.
    requestAnimationFrame(() => {
      detailRef.current?.focus({ preventScroll: true })
      if (window.matchMedia('(max-width: 760px)').matches)
        detailRef.current?.scrollIntoView({ block: 'start' })
    })
  }

  if (!state || !playerId) return <Navigate to="/" replace />
  if (state.phase !== 'setup' || myPlayer?.ready) return <Navigate to="/batalha" replace />

  return (
    <main className={styles.page} aria-busy={loading}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            BATTLE LINK <span>01 / 03 · montar equipe</span>
          </p>
          <h1 className={styles.title}>Escolha seus seis</h1>
          <p className={styles.subtitle}>Encontre seus favoritos e prepare sua estratégia.</p>
        </div>
        <div className={styles.headerTools}>
          <output
            className={styles.counter}
            aria-label={`Equipe ${team.length} de ${TEAM_SIZE}`}
            data-full={team.length === TEAM_SIZE || undefined}
          >
            <b>{team.length}</b>/{TEAM_SIZE}
          </output>
          <AudioSettings />
          <Button variant="ghost" size="sm" onClick={leave}>
            Sair
          </Button>
        </div>
      </header>

      <section className={styles.teamRow} aria-label="Pokémon escolhidos">
        <div className={styles.teamLabel}>
          <GameIcon name="ball" size={20} />
          <span>Sua equipe</span>
        </div>
        <div className={styles.teamSlots}>
          {Array.from({ length: TEAM_SIZE }, (_, index) => {
            const member = team[index]
            return (
              <div className={styles.slot} key={index} data-filled={Boolean(member) || undefined}>
                <span className={styles.slotNumber}>{String(index + 1).padStart(2, '0')}</span>
                {member ? (
                  <>
                    <Sprite src={member.image} name={member.pokemon} size={40} />
                    <span className={styles.chipName}>{formatPokemonName(member.pokemon)}</span>
                  </>
                ) : (
                  <>
                    <span className={styles.slotBall} aria-hidden="true">
                      <GameIcon name="ball" size={22} />
                    </span>
                    <span className={styles.slotHint}>Livre</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {team.length === 0 && <span className="sr-only">Nenhum Pokémon escolhido ainda</span>}
      </section>

      <div className={styles.actions}>
        <label className={styles.searchWrap}>
          <span>Buscar Pokémon pelo nome ou número</span>
          <input
            className={styles.search}
            placeholder="Nome ou nº da Pokédex…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setLimit(PAGE_SIZE)
            }}
            type="search"
          />
        </label>
        <label className={styles.filter}>
          <span>Tipo</span>
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value)
              setLimit(PAGE_SIZE)
            }}
          >
            <option value="">Todos os tipos</option>
            {availableTypes.map((type) => (
              <option value={type} key={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.drawActions}>
          <Button
            variant="ghost"
            onClick={() => draw(1)}
            disabled={team.length >= TEAM_SIZE || loading}
          >
            <GameIcon name="dice" size={18} /> Sortear 1
          </Button>
          <Button
            onClick={() => draw(TEAM_SIZE - team.length)}
            disabled={team.length >= TEAM_SIZE || loading}
          >
            <GameIcon name="dice" size={18} /> Sortear equipe inteira
          </Button>
        </div>
      </div>

      {loading && (
        <div className={styles.skeletonGrid} aria-label="Carregando catálogo">
          {Array.from({ length: 12 }, (_, index) => (
            <div className={styles.skeleton} key={index} aria-hidden="true" />
          ))}
          <span className={styles.loadingRow} role="status">
            <PokeballSpinner size={24} label="Carregando catálogo" /> Carregando catálogo…
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
        <div className={styles.catalogLayout}>
          <section className={styles.catalog} aria-label="Catálogo de Pokémon">
            <div className={styles.catalogHeading}>
              <h2>Pokédex</h2>
              <span role="status" aria-live="polite">
                {visible.length} Pokémon encontrados
              </span>
            </div>
            <div className={styles.grid} data-count={visible.length}>
              {visible.slice(0, limit).map((pokemon) => (
                <PokemonCard
                  key={pokemon.name}
                  pokemon={pokemon}
                  chosen={chosenIds.has(pokemon.name)}
                  inspected={inspected?.name === pokemon.name}
                  onChoose={choosePokemon}
                  onInspect={inspectPokemon}
                />
              ))}
              {visible.length === 0 && (
                <p className={styles.empty} role="status">
                  Nenhum Pokémon encontrado com esse nome.
                </p>
              )}
            </div>
            {limit < visible.length && (
              <div className={styles.loadMore}>
                <p>
                  Mostrando {Math.min(limit, visible.length)} de {visible.length}
                </p>
                <Button variant="ghost" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
                  Mostrar mais Pokémon
                </Button>
              </div>
            )}
          </section>

          {inspected && detail && (
            <aside
              ref={detailRef}
              tabIndex={-1}
              className={styles.detail}
              id="pokemon-details"
              aria-label={`Ficha de ${formatPokemonName(inspected.name)}`}
            >
              <div className={styles.detailTop}>
                <span>Ficha do Pokémon</span>
                <b>#{String(inspected.id).padStart(3, '0')}</b>
              </div>
              <div className={styles.portrait}>
                <Sprite src={inspected.image} name={inspected.name} size={176} loading="eager" />
              </div>
              <h2>{formatPokemonName(inspected.name)}</h2>
              <div className={styles.detailTypes}>
                {detail.types.map((type) => (
                  <TypeBadge key={type} type={type} />
                ))}
              </div>
              <div className={styles.statsTitle}>Atributos · nível 50</div>
              <dl className={styles.stats}>
                {Object.entries(STAT_LABELS).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{detail.stats[key as keyof typeof STAT_LABELS]}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.detailHint}>
                Valores iniciais, antes dos modificadores de batalha.
              </p>
              <Button
                disabled={chosenIds.has(inspected.name)}
                onClick={() => {
                  audio.play('select')
                  choosePokemon(inspected.name)
                }}
                aria-label={`Adicionar ${inspected.name} à equipe`}
              >
                {chosenIds.has(inspected.name) ? (
                  <>
                    <GameIcon name="check" size={18} /> Na sua equipe
                  </>
                ) : (
                  <>
                    <GameIcon name="ball" size={18} /> Adicionar à equipe
                  </>
                )}
              </Button>
            </aside>
          )}
        </div>
      )}
    </main>
  )
}
