import type { RoomSnapshot } from '../types/protocol'
import type { OwnPokemon, PublicPokemon } from '../../../server/src/game/engine/battle-types'
import type { GameState } from '../types/battle'
import type { Player, StatusName, TeamMember } from '../types/player'
import { displayMove, speciesById } from './catalog'
import { pokemonAssets } from './assets'

export const statusNames: Record<string, StatusName> = {
  brn: 'burn',
  psn: 'poison',
  tox: 'bad_poison',
  par: 'paralysis',
  slp: 'sleep',
  frz: 'freeze',
}
export function presentSnapshot(wire: RoomSnapshot): GameState {
  const ownIndex = wire.viewer === 'p1' ? 0 : 1
  const players = wire.players.map((participant, index): Player => {
    const own = index === ownIndex
    const side = index === 0 ? 'p1' : 'p2'
    const engineTeam = own ? wire.battle?.ownTeam : wire.battle?.opponentTeam
    const team: TeamMember[] = Array.from({ length: participant.teamCount }, (_, slot) => {
      const selection = own ? wire.team[slot] : undefined
      const pokemon = engineTeam?.[slot]
      const revealed = pokemon && !('hidden' in pokemon) ? pokemon : null
      const speciesId = revealed?.speciesId ?? selection?.speciesId ?? 'unknown'
      const species = speciesById(speciesId)
      const assets = pokemonAssets(speciesId)
      const id = `${side}s${slot}` as TeamMember['id']
      const moves = own ? wire.battle?.ownTeam[slot]?.moves : null
      const selectedMoves = moves?.map((move) => move.id) ?? [...(selection?.moves ?? [])]
      return {
        id,
        pokemon: speciesId,
        types: [...(revealed?.types ?? species?.types ?? [])],
        image: (selection?.shiny ?? wire.revealedShiny[id]) ? assets.shinyFront : assets.front,
        abilities: own
          ? [species?.ability === 'adaptability' ? 'Adaptability' : 'Sem efeito de habilidade']
          : [],
        moves: own
          ? (wire.phase === 'setup' ? (species?.moveIds ?? []) : selectedMoves).map(displayMove)
          : [],
        selectedMoves,
        maxHp: revealed?.maxHp ?? species?.stats.hp ?? 1,
        hp: revealed?.hp ?? species?.stats.hp ?? 1,
        status: revealed?.status ? statusNames[revealed.status] : null,
        isShiny: selection?.shiny ?? wire.revealedShiny[id] ?? false,
        sleepTurns: 0,
        pp: Object.fromEntries(
          moves?.map((move) => [move.id, move.pp]) ??
            selectedMoves.map((id) => [id, displayMove(id).pp ?? 0])
        ),
      }
    })
    const activeId = wire.battle?.active[side]
    const active = activeId && engineTeam?.find((pokemon) => pokemon.id === activeId)
    const pokemon: PublicPokemon | OwnPokemon | null =
      active && !('hidden' in active) ? active : null
    const member = team.find((member) => member.id === activeId)
    const request = own ? wire.battle?.request : null
    const assets = pokemonAssets(pokemon?.speciesId ?? '')
    return {
      ...participant,
      pokemon: pokemon?.speciesId ?? null,
      team,
      hp: pokemon?.hp ?? 0,
      maxHp: pokemon?.maxHp ?? 0,
      pokemonData:
        pokemon && member
          ? {
              moves: (request?.moves.map((move) => move.id) ?? member.selectedMoves).map(
                displayMove
              ),
              selectedMoves: request?.moves.map((move) => move.id) ?? member.selectedMoves,
              types: [...pokemon.types],
              status: member.status,
              isShiny: member.isShiny,
              level: pokemon.level,
              fainted: pokemon.fainted,
              statStages: {
                attack: pokemon.boosts.atk ?? 0,
                defense: pokemon.boosts.def ?? 0,
                specialAttack: pokemon.boosts.spa ?? 0,
                specialDefense: pokemon.boosts.spd ?? 0,
                speed: pokemon.boosts.spe ?? 0,
                accuracy: pokemon.boosts.accuracy ?? 0,
                evasion: pokemon.boosts.evasion ?? 0,
              },
              confusionTurns: pokemon.volatiles.includes('confusion') ? 1 : 0,
              pp: request
                ? Object.fromEntries(request.moves.map((move) => [move.id, move.pp]))
                : member.pp,
              cries: { latest: assets.cry, legacy: null },
              sprites: assets,
            }
          : undefined,
    }
  }) as [Player, Player]
  return {
    wire,
    phase: wire.phase,
    players,
    field: { background: wire.arena, weather: null, terrain: null },
    log: [...wire.log],
    winner: wire.result?.winner ? wire.players[wire.result.winner === 'p1' ? 0 : 1].id : null,
    finishReason: wire.result?.reason ?? null,
  }
}
