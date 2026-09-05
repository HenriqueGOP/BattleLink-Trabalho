// src/game/room.ts
import {
  GameState, PlayerId, PlayerAction, ActionType, LOCAL_POKEMON
} from "./types";
import { AsyncMutex } from "./mutex";

let nextRoomNumber = 1;

export class Room {
  public readonly id: string;
  public state: GameState;
  public readonly mutex = new AsyncMutex();

  constructor(player1: PlayerId, player2: PlayerId) {
    this.id = `room-${Date.now()}-${nextRoomNumber++}`;
    this.state = {
      phase: "battle",
      players: [
        { id: player1, name: "Jogador 1", pokemon: null, hp: 0, maxHp: 0, energy: 3 },
        { id: player2, name: "Jogador 2", pokemon: null, hp: 0, maxHp: 0, energy: 3 },
      ],
      turn: 0,
      log: [`Batalha iniciada! ${player1} vs ${player2}`],
      winner: null,
    };
  }

  /** Retorna o estado, filtrando o que cada jogador pode ver (anti-cheat) */
  public getStateFor(viewerId: PlayerId): GameState {
    // No futuro: esconder a "mão" do oponente aqui
    return this.state;
  }

  public setName(playerId: PlayerId, name: string): void {
    const player = this.state.players.find(item => item.id === playerId);
    if (player && name.trim()) player.name = name.trim().slice(0, 24);
  }

  public choosePokemon(actorId: PlayerId, pokemon: string): void {
    const player = this.state.players.find(item => item.id === actorId);
    if (!player) throw new Error("Jogador não pertence à partida.");
    const definition = LOCAL_POKEMON[pokemon.toLowerCase()];
    if (!definition) throw new Error("Pokémon inválido. Use charizard, blastoise ou venusaur.");
    if (player.pokemon) throw new Error("Seu Pokémon já foi escolhido.");
    player.pokemon = pokemon.toLowerCase();
    player.maxHp = definition.maxHp;
    player.hp = definition.maxHp;
    this.state.log.push(`${player.name} escolheu ${player.pokemon}.`);
  }

  /** Deve ser chamado dentro do mutex: esta é a região crítica do estado oficial. */
  public applyAction(actorId: PlayerId, action: PlayerAction): void {
    if (this.state.players.some(player => !player.pokemon)) {
      throw new Error("Aguarde os dois jogadores escolherem seus Pokémon.");
    }
    const current = this.state.players[this.state.turn];
    const opponent = this.state.players[1 - this.state.turn];
    if (this.state.phase === "finished") throw new Error("A partida já terminou.");

    if (actorId !== current.id) {
      throw new Error("Não é sua vez!");
    }

    const cost: Record<ActionType, number> = { attack: 1, defend: 1, special: 3 };

    if (!action || !Object.prototype.hasOwnProperty.call(cost, action.type)) {
      throw new Error("Ação inválida. Use attack, defend ou special.");
    }
    if (current.energy < cost[action.type]) {
      throw new Error("Energia insuficiente!");
    }

    current.energy -= cost[action.type];

    switch (action.type) {
      case "attack":
        opponent.hp = Math.max(0, opponent.hp - 15);
        this.state.log.push(`${current.name} usou ${action.move ?? "tackle"} (-15 HP)`);
        break;
      case "defend":
        current.hp = Math.min(current.maxHp, current.hp + 5);
        this.state.log.push(`${current.name} se defendeu (+5 HP)`);
        break;
      case "special":
        opponent.hp = Math.max(0, opponent.hp - 40);
        this.state.log.push(`${current.name} usou ESPECIAL (-40 HP)!`);
        break;
    }

    // Regenera energia e troca o turno
    opponent.energy = Math.min(5, opponent.energy + 1);
    this.state.turn = (1 - this.state.turn) as 0 | 1;

    if (opponent.hp <= 0) {
      this.state.phase = "finished";
      this.state.winner = current.id;
      this.state.log.push(`${current.name} VENCEU!`);
    }
  }

  public get winner(): PlayerId | null {
    return this.state.winner;
  }
}