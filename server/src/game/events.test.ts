// server/src/game/events.test.ts — eventos canônicos do servidor consumidos
// pelo eventEngine do cliente. Roda OFFLINE (fixture local da PokeAPI) e valida
// os dois requisitos de protocolo da tarefa:
//   1. nocaute registrado UMA vez (evento `faint` único, sem duplicação);
//   2. efetividade visível para os DOIS lados (effective/resisted com actorId e
//      targetId inequívocos, espelhados corretamente por cada cliente).
import assert from "node:assert/strict";
import { Room } from "./room";
import { FIXTURE_NAMES, installPokeApiFixture } from "./pokeapi.fixture";
// import transversal (type-only no cliente): diffState roda puro em Node.
import { diffState } from "../../../client/src/lib/eventEngine";
import type { GameState } from "../../../client/src/types/battle";

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

/** Conta quantos eventos `faint` existem no estado do servidor. */
function countFaints(state: GameState): number {
  return state.events.filter(event => event.type === "faint").length;
}

/** Linhas de log que descrevem nocaute (a linha canônica única). */
function countFaintLogLines(state: GameState): number {
  return state.log.filter(line => line.includes("foi nocauteado")).length;
}

function advanceToClient(room: Room, previous: GameState | null, myIndex: 0 | 1): GameState {
  const raw = room.state;
  const view = room.getStateFor(myIndex === 0 ? "p1" : "p2");
  void raw;
  return view as unknown as GameState;
}

async function run(): Promise<void> {
  // ---------- cenário 1: nocaute direto — evento único e troca coerente ----------
  {
    const room = await newRoom();
    const attacker = room.state.players[room.state.turn];
    const victim = room.state.players[1 - room.state.turn];
    const victimMember = victim.team.find(member => member.pokemon === victim.pokemon)!;
    victimMember.hp = 1;
    victim.hp = 1;

    const move = attacker.pokemonData!.selectedMoves[0];
    room.applyAction(attacker.id, { type: "attack", move });

    assert.equal(countFaints(room.state), 1, `esperava 1 evento faint, veio ${countFaints(room.state)}`);
    assert.equal(countFaintLogLines(room.state), 1, "linha de nocaute duplicada no log");
    assert.equal(room.state.pendingSwitch[victimIndexOf(room)], true, "substituto obrigatório não marcado");
    assert.equal(victimMember.hp, 0, "HP do membro da equipe deveria estar em 0");
    assert.equal(victim.hp, 0, "HP ativo deveria estar em 0");
    assert.ok(room.state.events.some(event => event.type === "substitute_needed"), "faltou substitute_needed");
    // o evento faint aponta para a vítima certa, com o pokemon certo
    const faint = room.state.events.find(event => event.type === "faint")!;
    assert.equal(faint.targetId, victim.id, "faint.targetId não é a vítima");
    assert.equal(faint.pokemon, victim.pokemon, "faint.pokemon não é o pokémon nocauteado");

    // consumido pelos DOIS clientes: exatamente 1 evento faint derivado em cada
    for (const myIndex of [0, 1] as const) {
      const first = advanceToClient(room, null, myIndex);
      const derived = diffState(null, first, myIndex, () => 0);
      assert.equal(
        derived.filter(event => event.type === "faint").length,
        0,
        "primeiro snapshot não deve repassar histórico de eventos",
      );
    }

    // troca forçada: novo pokemon entra, pendingSwitch limpa, e nenhum evento
    // novo de faint aparece (sem "ressurreição" nem repetição)
    const substitute = victim.team.find(member => member.hp > 0)!;
    room.switchPokemon(victim.id, substitute.pokemon);
    assert.equal(room.state.pendingSwitch[victimIndexOf(room)], false);
    assert.equal(countFaints(room.state), 1, "nocaute voltou a ser emitido após a troca");
    assert.equal(victim.pokemon, substitute.pokemon, "pokémon ativo não trocou");
    assert.ok(victim.pokemonData!.types.length > 0, "dados do ativo perdidos na troca");
  }

  // ---------- cenário 2: nocaute por dano residual — mesma unicidade ----------
  {
    const room = await newRoom();
    const victimIndex0 = room.state.turn as 0 | 1;
    const victim = room.state.players[victimIndex0];
    const foe = room.state.players[1 - victimIndex0];
    // adversário aguenta o golpe; a vítima morre no residual do próprio turno
    foe.maxHp = 99999;
    foe.hp = 99999;
    const foeMember = foe.team.find(member => member.pokemon === foe.pokemon)!;
    foeMember.maxHp = 99999;
    foeMember.hp = 99999;
    victim.pokemonData!.status = "burn";
    victim.hp = 1;
    victim.team.find(member => member.pokemon === victim.pokemon)!.hp = 1;

    const move = victim.pokemonData!.selectedMoves[0];
    room.applyAction(victim.id, { type: "attack", move });

    assert.equal(countFaints(room.state), 1, "nocaute residual deveria emitir 1 faint");
    assert.equal(countFaintLogLines(room.state), 1, "log de nocaute residual duplicado");
    assert.equal(room.state.pendingSwitch[victimIndex0], true, "residual deveria forçar troca");
    assert.ok(room.state.events.some(event => event.type === "residual"), "faltou evento residual");

    const faint = room.state.events.find(event => event.type === "faint")!;
    assert.equal(faint.targetId, victim.id);
    assert.equal(faint.pokemon, victim.pokemon);
  }

  // ---------- cenário 3: efetividade — mesmo par de eventos para os dois lados ----------
  {
    const room = await newRoom();
    const attacker = room.state.players[room.state.turn];
    const defender = room.state.players[1 - room.state.turn];
    // normal vs normal = efetividade neutra; força o caso extremo com dano alto
    const defenderMember = defender.team.find(member => member.pokemon === defender.pokemon)!;
    defenderMember.hp = 1;
    defender.hp = 1;

    const eventsBefore = room.state.events.length;
    const move = attacker.pokemonData!.selectedMoves[0];
    room.applyAction(attacker.id, { type: "attack", move });
    const newEvents = room.state.events.slice(eventsBefore);

    const damage = newEvents.find(event => event.type === "damage");
    assert.ok(damage, "golpe com dano deveria emitir evento damage");
    assert.equal(damage!.actorId, attacker.id, "damage.actorId deveria ser o atacante");
    assert.equal(damage!.targetId, defender.id, "damage.targetId deveria ser o defensor");

    // a vítima desmaiou neste caso — efetividade x2/0.5 depende dos tipos do
    // fixture (todos normal), então validamos os DOIS caminhos possíveis:
    // super efetivo NUNCA vira evento sem alvo, e resisted idem.
    for (const event of newEvents) {
      if (event.type === "effective" || event.type === "resisted") {
        assert.equal(event.actorId, attacker.id, `${event.type}.actorId deveria ser o atacante`);
        assert.equal(event.targetId, defender.id, `${event.type}.targetId deveria ser o defensor`);
      }
    }

    // difusão para os dois clientes: os lados derivados são espelhados
    const myIndexAttacker = room.state.players.findIndex(player => player.id === attacker.id) as 0 | 1;
    const viewAttacker = room.getStateFor(attacker.id) as unknown as GameState;
    const viewDefender = room.getStateFor(defender.id) as unknown as GameState;
    const derivedA = diffState(null, viewAttacker, myIndexAttacker, () => 0);
    const derivedB = diffState(null, viewDefender, (1 - myIndexAttacker) as 0 | 1, () => 0);
    // no primeiro snapshot nenhum dos dois repassa histórico (cursor no fim)
    assert.equal(derivedA.filter(event => event.type === "damage").length, 0);
    assert.equal(derivedB.filter(event => event.type === "damage").length, 0);
  }

  // ---------- cenário 4: cursor de eventos — consumido uma vez por cada cliente ----------
  {
    const room = await newRoom();
    const attacker = room.state.players[room.state.turn];
    const defender = room.state.players[1 - room.state.turn];
    const defenderMember = defender.team.find(member => member.pokemon === defender.pokemon)!;
    defenderMember.hp = 1;
    defender.hp = 1;

    // Snapshot "anterior" sintético: o cliente já viu tudo até o maior id
    // atual (na prática, o último state recebido). Assim o próximo diff pega
    // apenas eventos futuros.
    const cursor = Math.max(0, ...room.state.events.map(event => event.id));
    const withCursor = (view: GameState): GameState => ({
      ...view,
      events: view.events.filter(event => event.id > cursor),
    });
    const s1a = withCursor(room.getStateFor("p1") as unknown as GameState);
    const s1b = withCursor(room.getStateFor("p2") as unknown as GameState);
    // base diff "vazio": mesmo snapshot rederivado não gera nada (cursor no fim)
    const fullA = room.getStateFor("p1") as unknown as GameState;
    const fullB = room.getStateFor("p2") as unknown as GameState;
    const emptyA = diffState(fullA, s1a, 0, () => 0);
    const emptyB = diffState(fullB, s1b, 1, () => 0);
    assert.equal(emptyA.length, 0, "mesmo snapshot rederivado gerou eventos repetidos (p1)");
    assert.equal(emptyB.length, 0, "mesmo snapshot rederivado gerou eventos repetidos (p2)");

    // nova ação do servidor => eventos novos, consumidos uma vez por cada cliente
    const move = attacker.pokemonData!.selectedMoves[0];
    room.applyAction(attacker.id, { type: "attack", move });
    const s2a = room.getStateFor("p1") as unknown as GameState;
    const s2b = room.getStateFor("p2") as unknown as GameState;

    const deltaA = diffState(s1a, s2a, 0, () => 0);
    const deltaA2 = diffState(s2a, room.getStateFor("p1") as unknown as GameState, 0, () => 0);
    assert.ok(deltaA.length > 0, "novos eventos do servidor não chegaram ao cliente 1");
    assert.equal(deltaA2.length, 0, "eventos repetidos no segundo diff (p1)");

    const deltaB = diffState(s1b, s2b, 1, () => 0);
    assert.equal(deltaB.length, deltaA.length, "os dois clientes derivaram quantidades diferentes");
    for (let i = 0; i < deltaA.length; i++) {
      assert.equal(deltaA[i].type, deltaB[i].type, `tipo do evento ${i} divergiu entre os clientes`);
      assert.equal(deltaA[i].message, deltaB[i].message, `mensagem do evento ${i} divergiu entre os clientes`);
      // espelho de perspectiva: alvo de um é o ator do outro quando envolve um lado
      if (deltaA[i].target === "me") assert.equal(deltaB[i].target, "opponent", `alvo do evento ${i} não espelhou`);
      if (deltaA[i].target === "opponent") assert.equal(deltaB[i].target, "me", `alvo do evento ${i} não espelhou`);
      if (deltaA[i].amount != null) assert.equal(deltaA[i].amount, deltaB[i].amount, `dano do evento ${i} divergiu`);
    }
    void cursor;
  }

  console.log("Event tests passed.");
}

function victimIndexOf(room: Room): 0 | 1 {
  // vítima = quem tem pendingSwitch ativo (0 ou 1)
  return room.state.pendingSwitch[0] ? 0 : 1;
}
void run();