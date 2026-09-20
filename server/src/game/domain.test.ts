// server/src/game/domain.test.ts — fluxo real (choosePokemon async, equipe de 6)
// Roda OFFLINE: a PokeAPI e servida pelo fixture local.
import assert from "node:assert/strict";
import { Room } from "./room";
import { AsyncMutex } from "./mutex";
import { getShowdownMove } from "./showdown-moves";
import { FIXTURE_NAMES, installPokeApiFixture } from "./pokeapi.fixture";

installPokeApiFixture();

const TEAM_A = FIXTURE_NAMES.slice(0, 6);
const TEAM_B = FIXTURE_NAMES.slice(6, 12);

async function newRoom(): Promise<Room> {
  const room = new Room("p1", "p2");
  room.setName("p1", "Alice");
  room.setName("p2", "Bob");
  for (const pokemon of TEAM_A) await room.choosePokemon("p1", pokemon);
  for (const pokemon of TEAM_B) await room.choosePokemon("p2", pokemon);
  return room;
}

/** Deixa o jogador `index` com 1 HP e queimado: ele desmaia no residual do proprio turno. */
function burnToDeath(room: Room, index: 0 | 1): void {
  const player = room.state.players[index];
  player.pokemonData!.status = "burn";
  player.hp = 1;
  player.team.find(member => member.pokemon === player.pokemon)!.hp = 1;
}

async function run(): Promise<void> {
  // ---------- dataset local de golpes ----------
  // Regressao: o caminho de data/moves.json dependia de process.cwd() e quebrava
  // quando o servidor subia de qualquer pasta que nao fosse server/.
  assert.equal(getShowdownMove("tackle")?.name, "Tackle", "dataset do Showdown nao carregou");

  // ---------- montagem das equipes ----------
  const room = await newRoom();
  const alice = room.state.players[0];
  const bob = room.state.players[1];
  assert.equal(alice.name, "Alice");
  assert.equal(alice.team.length, 6, "equipe de Alice incompleta");
  assert.equal(bob.team.length, 6, "equipe de Bob incompleta");
  assert.equal(room.state.phase, "battle", "batalha deveria ter comecado");
  assert.ok(alice.pokemon, "Pokemon ativo de Alice nao foi definido");
  assert.equal(room.state.players.every(player => player.maxHp > 0), true);

  // ---------- mutex: ordem FIFO preservada ----------
  const mutex = new AsyncMutex();
  const order: number[] = [];
  const first = mutex.acquire().then(async unlock => {
    order.push(1);
    await Promise.resolve();
    order.push(2);
    unlock();
  });
  const second = mutex.acquire().then(unlock => {
    order.push(3);
    unlock();
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2, 3]);

  // ---------- acao de quem nao e o turno e rejeitada ----------
  const attacker = room.state.players[room.state.turn];
  const notTurn = room.state.players[1 - room.state.turn];
  assert.throws(
    () => room.applyAction(notTurn.id, { type: "attack", move: attacker.pokemonData?.selectedMoves[0] }),
    /sua vez|turno/i,
  );

  // ---------- REGRESSAO: reset_team depois que a batalha comecou ----------
  // battleBegun so virava true em terastallize/switch/action, entao dava para
  // remontar a equipe e o startBattle() seguinte zerava o estado de combate do
  // ADVERSARIO (status, stat stages, Terastal e PP).
  assert.throws(() => room.resetTeam("p1"), /batalha já começou/i, "reset_team deveria estar travado");

  // ---------- REGRESSAO: PP zerado nao pode mutar o estado ----------
  // A checagem de PP acontecia DEPOIS de acordar/descongelar/decrementar a
  // confusao, entao a excecao subia com o estado ja alterado e sem broadcast.
  {
    const room2 = await newRoom();
    const actor = room2.state.players[room2.state.turn];
    const move = actor.pokemonData!.selectedMoves[0];
    actor.pokemonData!.pp[move] = 0;
    actor.pokemonData!.confusionTurns = 3;
    const turnBefore = room2.state.turn;
    assert.throws(() => room2.applyAction(actor.id, { type: "attack", move }), /sem PP/i);
    assert.equal(actor.pokemonData!.confusionTurns, 3, "confusao foi consumida apesar do erro");
    assert.equal(room2.state.turn, turnBefore, "o turno passou apesar do erro");
  }

  // ---------- REGRESSAO: PP nao e gasto quando o Pokemon nao se move ----------
  {
    const room3 = await newRoom();
    const actor = room3.state.players[room3.state.turn];
    const move = actor.pokemonData!.selectedMoves[0];
    const ppBefore = actor.pokemonData!.pp[move];
    actor.pokemonData!.status = "sleep";
    actor.pokemonData!.sleepTurns = 2;
    room3.applyAction(actor.id, { type: "attack", move });
    assert.equal(actor.pokemonData!.pp[move], ppBefore, "PP foi gasto durante o sono");
  }

  // ---------- REGRESSAO: oponente nao age enquanto ha troca forcada pendente ----------
  // Nocaute por dano residual no turno da propria vitima passava o turno para o
  // oponente, que atacava um Pokemon com 0 HP ("-0 HP") e repetia o log de KO.
  {
    const room4 = await newRoom();
    const victim = room4.state.turn;
    const foe = room4.state.players[1 - victim];
    // o adversario aguenta o golpe; a vitima morre do residual no fim do turno
    foe.maxHp = 99999;
    foe.hp = 99999;
    const foeMember = foe.team.find(member => member.pokemon === foe.pokemon)!;
    foeMember.maxHp = 99999;
    foeMember.hp = 99999;
    burnToDeath(room4, victim as 0 | 1);

    const move = room4.state.players[victim].pokemonData!.selectedMoves[0];
    room4.applyAction(room4.state.players[victim].id, { type: "attack", move });

    assert.equal(room4.state.pendingSwitch[victim], true, "a vitima deveria dever uma troca");
    assert.equal(room4.state.phase, "battle");
    const foeMove = foe.pokemonData!.selectedMoves[0];
    assert.throws(
      () => room4.applyAction(foe.id, { type: "attack", move: foeMove }),
      /aguarde o oponente/i,
      "o oponente conseguiu atacar um Pokemon nocauteado",
    );

    // depois da troca forcada o jogo volta ao normal
    const substitute = room4.state.players[victim].team.find(member => member.hp > 0)!;
    room4.switchPokemon(room4.state.players[victim].id, substitute.pokemon);
    assert.equal(room4.state.pendingSwitch[victim], false);
    room4.applyAction(foe.id, { type: "attack", move: foeMove });
  }

  // ---------- REGRESSAO: snapshot nao vaza os segredos do adversario ----------
  {
    const room5 = await newRoom();
    const view = room5.getStateFor("p1");
    const mine = view.players.find(player => player.id === "p1")!;
    const theirs = view.players.find(player => player.id === "p2")!;
    assert.ok(mine.pokemonData!.selectedMoves.length > 0, "o proprio moveset sumiu");
    assert.ok(Object.keys(mine.pokemonData!.pp).length > 0, "o proprio PP sumiu");
    assert.equal(theirs.pokemonData!.selectedMoves.length, 0, "moveset do adversario vazou");
    assert.deepEqual(theirs.pokemonData!.pp, {}, "PP do adversario vazou");
    assert.equal(theirs.team.length, 6, "o banco do adversario precisa existir para o HUD");
    assert.ok(theirs.team.every(member => member.moves.length === 0), "golpes do banco adversario vazaram");
    assert.ok(theirs.team.filter(member => member.pokemon === "unknown").length >= 5, "espécies do banco adversário vazaram");
    assert.ok(theirs.team.every(member => Object.keys(member.stats).length === 0), "atributos do adversário vazaram");
    assert.equal(theirs.pokemonData!.teraType, "unknown", "Tera Type do adversário vazou antes da terastalização");
    // o que uma batalha real revela continua visivel
    assert.equal(theirs.pokemon, room5.state.players[1].pokemon);
    assert.equal(theirs.hp, room5.state.players[1].hp);
  }

  // ---------- segurança: só golpes equipados podem ser usados ----------
  {
    const room6 = await newRoom();
    const actor = room6.state.players[room6.state.turn];
    const unequipped = actor.pokemonData!.moves.find(move => !actor.pokemonData!.selectedMoves.includes(move.name));
    if (unequipped) {
      assert.throws(() => room6.applyAction(actor.id, { type: "attack", move: unequipped.name }), /não está equipado/i);
    }
  }

  console.log("Domain tests passed.");
}

void run();
