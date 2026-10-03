// Offline, from the pinned server simulator. Run after the server build.
const { writeFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { Dex } = require('../server/node_modules/@pkmn/sim');
const engine = require('../server/dist/game/engine');
const dex = Dex.forGen(9);
const moves = engine.listMoves().map(move => {
  const native = dex.moves.get(move.id);
  return { ...move, description: native.shortDesc, target: native.target, status: native.status,
    volatile: native.volatileStatus, boosts: native.boosts, selfBoosts: native.self?.boosts };
});
const moveIndex = new Map(moves.map((move, index) => [move.id, index]));
const species = dex.species.all().filter(value => value.exists && value.num > 0 && value.num <= 1025 && !value.forme && value.gen <= 9)
  .sort((a, b) => a.num - b.num).map(value => ({
    id: value.id, num: value.num, name: value.name, types: value.types.map(type => type.toLowerCase()),
    ability: Object.values(value.abilities).includes('Adaptability') ? 'adaptability' : 'none',
    stats: engine.calculateStats(value.id),
    moveIndices: [...dex.species.getMovePool(value.id, true)].filter(id => engine.getMove(id) && id !== 'struggle').sort().map(id => moveIndex.get(id)),
  }));
const target = resolve(__dirname, '../server/src/data');
mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, 'battle-catalog.json'), JSON.stringify({ version: 'gen9-sim-0.10.11-v1' }) + '\n');
writeFileSync(resolve(target, 'species.json'), JSON.stringify(species) + '\n');
writeFileSync(resolve(target, 'moves.json'), JSON.stringify(moves) + '\n');
console.log(`Local catalog: ${species.length} species, ${moves.length} moves.`);
