import { useMemo, useRef, useState } from 'react'
import fixture from '../../data/presentation-fixture.json'
import { presentSnapshot } from '../../lib/battleView'
import { speciesById } from '../../lib/catalog'
import type { RoomSnapshot } from '../../types/protocol'
import type { StatusName } from '../../types/player'
import { arenaMenuStyle, battleBackgrounds } from '../../config/battleBackgrounds'
import { BattleSpot } from './components/BattleSpot'
import { BattleBackground } from './components/BattleBackground'
import { HudCard } from './components/HudCard'
import styles from './BattlePage.module.css'
import previewStyles from './GroundingPreview.module.css'

/** Development-only visual regression fixture: same actors and geometry as a live battle. */
export function GroundingPreview() {
  const [arena, setArena] = useState('forest')
  const [species, setSpecies] = useState('charizard')
  const [status, setStatus] = useState<StatusName | ''>('freeze')
  const [shiny, setShiny] = useState(false)
  const me = useRef<HTMLDivElement>(null), foe = useRef<HTMLDivElement>(null)
  const base = useMemo(() => presentSnapshot((fixture as unknown as { state: RoomSnapshot }[])[0].state), [])
  const entry = speciesById(species)
  const players = base.players.map(player => ({ ...player, pokemon: species, hp: entry?.stats.hp ?? player.hp, maxHp: entry?.stats.hp ?? player.maxHp,
    pokemonData: player.pokemonData ? { ...player.pokemonData, types: [...(entry?.types ?? [])], status: status || null, isShiny: shiny, fainted: false } : undefined,
  }))
  return <section aria-label="Inspeção de ancoragem" style={arenaMenuStyle(arena)}>
    <h2>Sprites nos dois lados da arena</h2>
    <div className={`${styles.tools} ${previewStyles.controls}`}>
      <label>Arena de inspeção <select value={arena} onChange={event => setArena(event.target.value)}>
        {battleBackgrounds.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></label>
      <label>Espécie de inspeção <select value={species} onChange={event => setSpecies(event.target.value)}>
        {['charizard', 'bulbasaur', 'wailord', 'flabebe', 'gastly', 'greninja'].map(id => <option key={id}>{id}</option>)}
      </select></label>
      <label>Status de inspeção <select value={status} onChange={event => setStatus(event.target.value as StatusName | '')}>
        <option value="">Sem status</option><option value="freeze">Congelado</option><option value="sleep">Sono</option>
        <option value="burn">Queimadura</option><option value="poison">Veneno</option><option value="paralysis">Paralisia</option>
      </select></label>
      <label><input type="checkbox" checked={shiny} onChange={event => setShiny(event.target.checked)} /> Shiny na inspeção</label>
    </div>
    <div className={styles.layout}>
      <div className={styles.stage} data-grounding-preview data-fx-stage>
        <BattleBackground background={arena} />
        <div className={styles.spots}>
          <HudCard player={players[1]} opponent />
          <BattleSpot player={players[1]} opponent spriteRef={foe} />
          <BattleSpot player={players[0]} opponent={false} spriteRef={me} />
          <HudCard player={players[0]} opponent={false} />
        </div>
      </div>
    </div>
    <p>Os pés usam os pontos 28%/86% e 72%/60%. A imagem e a aura compartilham as mesmas âncoras.</p>
  </section>
}
