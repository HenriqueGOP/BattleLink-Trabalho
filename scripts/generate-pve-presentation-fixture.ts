import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fixtureRoom, turn } from '../server/src/game/room.fixture'
import { decodeServerMessage } from '../server/src/contracts/decode'
import type { RoomSnapshot } from '../server/src/contracts/protocol'

/** Canonical events from the real engine, isolated in the development-only lab. */
function scenario(winner: 'player' | 'trainer') {
  const room = fixtureRoom(['swordsdance', 'seismictoss', 'bulletseed', 'splash'], ['screech', 'seismictoss', 'swordsdance', 'splash'], false)
  room.acceptTeam('p1')
  room.acceptTeam('p2')
  const preparation = room.getStateFor('p1').preparation!.id
  const snapshots: { label: string; state: RoomSnapshot }[] = []
  const save = (label: string) => {
    const state = room.getStateFor('p1')
    decodeServerMessage({ type: 'state', state })
    snapshots.push({ label, state })
  }
  save('Preparação PvE')
  room.battleReady('p1', preparation)
  room.battleReady('p2', preparation)
  save('Entrada: idle → preparar → arremessar → pós-arremesso → Pokémon')
  turn(room, 'swordsdance', 'screech')
  save('Buff e debuff persistentes no Pokémon do jogador')
  turn(room, 'seismictoss', 'seismictoss')
  save('Golpes atingem diretamente os dois alvos')
  turn(room, 'splash', 'swordsdance')
  save('Buff persistente no Pokémon adversário')
  for (let round = 0; round < 4 && room.getStateFor('p2').battle!.request?.kind === 'move'; round++)
    turn(room, 'seismictoss', 'splash')
  save('Nocaute do Pokémon da treinadora')
  act(room, 'p2', { type: 'switch', combatantId: 'p2s1' })
  save('Substituto da treinadora aguarda novo lançamento; atributos limpos')
  for (let round = 0; round < 5 && room.getStateFor('p1').battle!.request?.kind === 'move'; round++)
    turn(room, 'splash', 'hypervoice')
  save('Nocaute do jogador aciona comemoração na área da treinadora')
  act(room, 'p1', { type: 'switch', combatantId: 'p1s1' })
  save('Novo Pokémon do jogador sem buffs herdados')
  room.forfeit(winner === 'player' ? 'p2' : 'p1')
  save(winner === 'player' ? 'Derrota da treinadora' : 'Vitória da treinadora')
  room.destroy()
  return snapshots
}

writeFileSync(resolve('client/src/data/pve-presentation-fixture.json'), JSON.stringify({ player: scenario('player'), trainer: scenario('trainer') }))
console.log('PvE visual fixture: real engine attack, boost, KO, replacement and both result branches.')
