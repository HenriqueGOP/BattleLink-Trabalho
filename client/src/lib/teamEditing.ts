import type { RoomSnapshot, SetupMessage } from '../../../server/src/contracts/protocol'

/** Preview only: authoritative snapshots and battle events are never mutated. */
export function previewTeamEdit(snapshot: RoomSnapshot, message: SetupMessage): RoomSnapshot {
  let team = [...snapshot.team]
  if (message.type === 'remove_pokemon') team = team.filter(member => member.speciesId !== message.pokemon)
  if (message.type === 'reorder_team') {
    if (message.pokemon.length !== team.length || new Set(message.pokemon).size !== team.length) return snapshot
    const ordered = message.pokemon.map(id => team.find(member => member.speciesId === id))
    if (ordered.some(member => !member)) return snapshot
    team = ordered as typeof team
  }
  if (message.type === 'set_moves') team = team.map(member => member.speciesId === message.pokemon ? { ...member, moves: [...message.moves] } : member)
  if (message.type === 'reset_team') team = []
  team = team.map((member, index) => ({ ...member, id: `${snapshot.viewer}s${index}` as typeof member.id }))
  return { ...snapshot, team, players: snapshot.players.map((player, index) => index === (snapshot.viewer === 'p1' ? 0 : 1) ? { ...player, teamCount: team.length } : player) as unknown as RoomSnapshot['players'] }
}
