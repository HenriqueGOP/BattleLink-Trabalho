import assert from 'node:assert/strict';
import { Room } from './game/room';
import { TEAM } from './game/room.fixture';
import { parseClientMessage, readSetupEditId } from './protocol';
import { decodeServerMessage } from './contracts/decode';
import { previewTeamEdit } from '../../client/src/lib/teamEditing';
import { resolveBattleSprite } from '../../client/src/lib/assets';
import { spriteLayout, spriteMetrics, spriteMetricPaths, SCENE_LAYOUT } from '../../client/src/lib/presentation/sceneLayout';
import metrics from '../../client/src/data/sprite-metrics.json';

for (const slot of [0,2,5]) {
  const room = new Room('p1','p2',[1,2,3,4]);
  for (const side of ['p1','p2']) for (const id of TEAM) room.choosePokemon(side,id);
  room.setMoves('p1','smeargle',['splash']);
  const before = room.getStateFor('p1');
  const removed = before.team[slot].speciesId;
  const predicted = previewTeamEdit(before,{type:'remove_pokemon',pokemon:removed});
  assert.equal(before.team.length,6,'Preview never mutates authoritative state');
  room.removePokemon('p1',removed);
  assert.deepEqual(predicted.team,room.getStateFor('p1').team);
  room.choosePokemon('p1',removed);
  const filled = room.getStateFor('p1');
  assert.equal(new Set(filled.team.map(member=>member.id)).size,6,'Remove + append never duplicates combatant IDs');
  const order = filled.team.map(member=>member.speciesId).reverse();
  const preview = previewTeamEdit(filled,{type:'reorder_team',pokemon:order});
  room.reorderTeam('p1',order);
  const reordered = room.getStateFor('p1');
  assert.deepEqual(preview.team,reordered.team);
  for (const member of reordered.team) {
    const original=filled.team.find(entry=>entry.speciesId===member.speciesId)!;
    assert.deepEqual(member.moves,original.moves);
    assert.equal(member.shiny,original.shiny);
  }
  assert.equal(room.getStateFor('p2').team.some(member=>member.id.startsWith('p1')),false);
  assert.throws(()=>room.reorderTeam('p1',[...order.slice(1),order[1]]));
  assert.throws(()=>room.reorderTeam('p1',order.slice(1)));
  assert.throws(()=>room.reorderTeam('p1',[...order.slice(1),'charizard']));
  assert.throws(()=>room.removePokemon('outsider',order[0]));
  assert.throws(()=>room.removePokemon('p1','unknown'));
  room.acceptTeam('p1');
  assert.throws(()=>room.resetTeam('p1'));
  assert.throws(()=>room.removePokemon('p1',order[0]));
  assert.throws(()=>room.reorderTeam('p1',order));
  room.acceptTeam('p2');
  const ready=room.getStateFor('p1');
  assert.equal(ready.battle?.ownTeam[0].speciesId,order[0],'Chosen order determines initial combatant');
  assert.equal(ready.revealedShiny.p1s0,reordered.team[0].shiny);
  assert.throws(()=>room.reorderTeam('p2',TEAM));
  room.destroy();
}
for (const command of [{type:'remove_pokemon',matchId:'match-fixture',pokemon:'pikachu',editId:'edit-1'},{type:'reorder_team',matchId:'match-fixture',pokemon:['pikachu','eevee'],editId:'edit-2'}]) assert.deepEqual(parseClientMessage(command),command);
for (const command of [{type:'reorder_team',pokemon:['pikachu','pikachu']},{type:'reorder_team',pokemon:[]},{type:'remove_pokemon',pokemon:'https://bad.test'},{type:'remove_pokemon',pokemon:'pikachu',editId:'../bad'}]) assert.throws(()=>parseClientMessage(command));
const room = new Room('a','b');
assert.equal(readSetupEditId({type:'reorder_team',pokemon:null,editId:'safe-id'}),'safe-id');
for (const raw of [null, [], {type:'join',editId:'safe-id'}, {type:'remove_pokemon',editId:'../unsafe'}, {type:'remove_pokemon',editId:'x'.repeat(65)}, {type:'remove_pokemon',editId:123}]) assert.equal(readSetupEditId(raw),undefined);
const state={type:'state',state:room.getStateFor('a'),editId:'edit-1'};
assert.deepEqual(decodeServerMessage(state),state);
assert.throws(()=>decodeServerMessage({...state,editId:123}));
room.destroy();
for (const path of spriteMetricPaths) {
  assert.match(path, /^\/pokemon\//, 'Metrics keys are canonical local asset paths');
  assert.equal(spriteMetrics(path).width,(metrics as Record<string, number[]>)[path][0], 'Measured assets must not use fallback geometry');
  const data=spriteMetrics(path), [left,top,right,bottom]=data.bounds;
  assert.ok(left>=0&&top>=0&&right<=data.width&&bottom<=data.height&&right>left&&bottom>top,path);
  const layout=spriteLayout(path);
  const scale=parseFloat(String(layout.width))/data.width;
  assert.ok(Math.abs(parseFloat(String(layout.top))+data.feet[1]*scale-100)<.00001,`${path}: feet remain at base`);
}
assert.equal(SCENE_LAYOUT.opponent.depth,.82);
for (const id of ['bulbasaur','charizard','flabebe','wailord']) {
  const self=resolveBattleSprite(id,false,false), foe=resolveBattleSprite(id,true,false);
  assert.ok(self.staticSrc.includes('/back/'),`${id}: correct back fallback`);
  assert.ok(!foe.staticSrc.includes('/back/'),`${id}: correct front fallback`);
  for (const asset of [self,foe]) {
    const animated=spriteMetrics(asset.src),still=spriteMetrics(asset.staticSrc);
    const a=spriteLayout(asset.src,asset.staticSrc),s=spriteLayout(asset.staticSrc);
    const visibleA=Math.max(animated.bounds[2]-animated.bounds[0],animated.bounds[3]-animated.bounds[1])*parseFloat(String(a.width))/animated.width;
    const visibleS=Math.max(still.bounds[2]-still.bounds[0],still.bounds[3]-still.bounds[1])*parseFloat(String(s.width))/still.width;
    assert.ok(Math.abs(visibleA-visibleS)<.00001,`${id}: GIF/PNG have the same visible extent`);
  }
}
console.log('Team editing passed: removal, permutation, optimistic reconciliation, privacy, moves/shiny, phase locks, lead IDs and 7468 sprite baselines.');
