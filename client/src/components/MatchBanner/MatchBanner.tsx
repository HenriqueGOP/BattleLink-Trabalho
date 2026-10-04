import { useState } from 'react'
import { FORMATS, formatSize } from '../../../../server/src/contracts/formats'
import { trainerById } from '../../../../server/src/contracts/trainers'
import { useBattleContext } from '../../context/BattleProvider'
import { typeLabel } from '../../lib/format'
import styles from './MatchBanner.module.css'

export function MatchBanner() {
  const { state } = useBattleContext()
  const [copied, setCopied] = useState(false)
  if (!state) return null
  const wire = state.wire
  const trainer = wire.trainerId ? trainerById(wire.trainerId) : undefined
  const format = FORMATS.find(format => format.id === wire.format.id)!
  return <section className={styles.banner} aria-label="Informações da partida">
    <div><strong>{trainer ? `Desafio de ${trainer.name}` : wire.mode === 'private' ? 'Sala com amigos' : 'Partida rápida'}</strong><span>{format.name} · {formatSize(wire.format)} Pokémon{wire.format.type ? ` · ${typeLabel(wire.format.type)}` : ''}{wire.difficulty ? ` · ${({ easy: 'Fácil', normal: 'Normal', hard: 'Difícil' })[wire.difficulty]}` : ''}</span></div>
    <ul>{wire.players.map(player => <li key={player.id}><b>{player.name}</b><span>{wire.phase === 'setup' ? player.ready ? 'Equipe pronta ✓' : `${player.teamCount}/${formatSize(wire.format)} escolhidos` : wire.phase === 'preparing' ? 'Preparando a arena' : wire.phase === 'finished' ? 'Partida concluída' : 'Em batalha'}</span></li>)}</ul>
    {wire.inviteCode && <button onClick={() => { void navigator.clipboard.writeText(wire.inviteCode!).then(() => setCopied(true)).catch(() => setCopied(false)) }} aria-label={`Copiar código ${wire.inviteCode}`}>{copied ? 'Copiado ✓' : `${wire.inviteCode.slice(0, 4)} ${wire.inviteCode.slice(4)} · Copiar`}</button>}
  </section>
}
