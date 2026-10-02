// server/src/game/room.ts — v4
import { ActionType, ActivePokemonData, BattleEvent, BattleEventType, GameState, PlayerAction, PlayerId, PlayerState, StatStages, TeamMemberState } from "./types";
import { AsyncMutex } from "./mutex";
import { fetchPokemonDetail, isKnownPokemon, MoveData, PokemonDetail } from "./pokeapi";
import { effectiveness, mapStatKey, stageMultiplier, STAGE_LABEL } from "./battle";

const TEAM_SIZE = 6;
const MAX_SELECTED_MOVES = 4;

/** Cenarios de campo disponiveis (espelham client/src/config/battleBackgrounds). O servidor sorteia. */
const BATTLE_BACKGROUNDS = ["meadow", "forest", "cave", "night", "beach", "city"];
const STATUSES = ["burn", "poison", "bad_poison", "paralysis", "sleep", "freeze"];
const SHINY_CHANCE = 0.05;
const CONFUSION_SELF_HIT_CHANCE = 1 / 3;
const CONFUSION_BASE_POWER = 40;
const MIN_BP = 60; // Tera: golpes do tipo Tera com BP < 60 viram 60
const MAX_LOG_ENTRIES = 100;
const MAX_EVENT_ENTRIES = 240;

// CLIMA É APENAS VISUAL
const WEATHERS: Array<string | null> = [null, null, null, "rain", "sun", "sandstorm", "snow"];
const TERRAINS: Array<string | null> = [null, null, null, "electric", "grassy", "misty", "psychic"];

let nextRoomNumber = 1;

function pick<T>(list: T[]): T { return list[Math.floor(Math.random() * list.length)]; }
function freshStages(): StatStages { return { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 }; }

export interface PreparedPokemonSelection {
  actorId: PlayerId;
  name: string;
  detail: PokemonDetail;
  teamVersion: number;
}

export class Room {
  public readonly id: string;
  public state: GameState;
  public readonly mutex = new AsyncMutex();
  private teamVersions = new Map<PlayerId, number>();
  private teraUsed: [boolean, boolean] = [false, false];
  private nextEventId = 1;

  constructor(player1: PlayerId, player2: PlayerId) {
    this.id = `room-${Date.now()}-${nextRoomNumber++}`;
    this.state = {
      phase: "setup",
      players: [
        { id: player1, name: "Jogador 1", pokemon: null, hp: 0, maxHp: 0, team: [], ready: false },
        { id: player2, name: "Jogador 2", pokemon: null, hp: 0, maxHp: 0, team: [], ready: false },
      ],
      turn: 0,
      pendingSwitch: [false, false],
      field: { weather: null, terrain: null, background: null, hazards: [{ stealthRock: false, spikes: 0 }, { stealthRock: false, spikes: 0 }] },
      log: [`Batalha iniciada! ${player1} vs ${player2}`],
      logOffset: 0,
      events: [],
      winner: null,
      finishReason: null,
    };
  }

  /**
   * Snapshot na visao de UM jogador. O broadcast antigo mandava `room.state`
   * cru para os dois, entregando ao adversario a equipe inteira, os golpes, o
   * PP e o Tera Type do outro lado. Aqui o banco do adversario vira so o que
   * uma batalha real revela: nome, se esta vivo e o Pokemon em campo.
   */
  public getStateFor(viewerId: PlayerId): GameState {
    if (this.state.log.length > MAX_LOG_ENTRIES) {
      const removed = this.state.log.length - MAX_LOG_ENTRIES;
      this.state.log.splice(0, removed);
      this.state.logOffset += removed;
    }
    const viewerIndex = this.state.players.findIndex(item => item.id === viewerId);
    if (viewerIndex < 0) throw new Error("Jogador não pertence à partida.");
    const foeIndex = 1 - viewerIndex;
    const players = [...this.state.players] as [PlayerState, PlayerState];
    players[foeIndex] = Room.hideSecrets(this.state.players[foeIndex]);
    return { ...this.state, players };
  }

  /** Remove do PlayerState tudo que o adversario nao poderia saber. */
  private static hideSecrets(player: PlayerState): PlayerState {
    const active = player.pokemonData;
    return {
      ...player,
      // O HUD só precisa saber quantos Pokémon ainda estão vivos. Espécie,
      // atributos e golpes do banco não são informações públicas.
      team: player.team.map(member => ({
        pokemon: member.pokemon === player.pokemon ? member.pokemon : "unknown",
        types: member.pokemon === player.pokemon ? member.types : [],
        image: member.pokemon === player.pokemon ? member.image : null,
        abilities: [],
        moves: [],
        selectedMoves: [],
        pp: {},
        maxHp: member.pokemon === player.pokemon ? member.maxHp : 1,
        hp: member.pokemon === player.pokemon ? member.hp : Number(member.hp > 0),
        status: member.pokemon === player.pokemon ? member.status : null,
        isShiny: member.pokemon === player.pokemon ? member.isShiny : false,
        isTerastallized: member.pokemon === player.pokemon ? member.isTerastallized : false,
        sleepTurns: member.pokemon === player.pokemon ? member.sleepTurns : 0,
        stats: {},
        sprites: { front: null, back: null, shinyFront: null, shinyBack: null },
        cries: { latest: null, legacy: null },
      })),
      pokemonData: active && {
        ...active,
        // O Pokémon em campo é visível; golpes, PP, atributos e Tera Type
        // só ficam públicos depois da terastalização.
        moves: [],
        selectedMoves: [],
        pp: {},
        stats: {},
        teraType: active.isTerastallized ? active.teraType : "unknown",
      },
    };
  }

  public setName(playerId: PlayerId, name: string): void {
    const player = this.state.players.find(item => item.id === playerId);
    if (player && name.trim()) player.name = name.trim().slice(0, 24);
  }

  public async choosePokemon(actorId: PlayerId, pokemon: string): Promise<void> {
    const prepared = await this.preparePokemon(actorId, pokemon);
    const unlock = await this.mutex.acquire();
    try { this.commitPokemon(prepared); }
    finally { unlock(); }
  }

  /** Busca externa sem mutar estado nem ocupar o mutex. */
  public async preparePokemon(actorId: PlayerId, pokemon: string): Promise<PreparedPokemonSelection> {
    const name = String(pokemon).toLowerCase().trim();
    this.validateSelection(actorId, name);
    const teamVersion = this.teamVersions.get(actorId) ?? 0;
    if (!await isKnownPokemon(name)) throw new Error(`Pokémon "${name}" não existe na PokéAPI.`);
    const detail = await fetchPokemonDetail(name);
    return { actorId, name, detail, teamVersion };
  }

  /** Chamado sob o mutex: revalida tudo após a busca assíncrona. */
  public commitPokemon({ actorId, name, detail, teamVersion }: PreparedPokemonSelection): void {
    const player = this.validateSelection(actorId, name);
    if ((this.teamVersions.get(actorId) ?? 0) !== teamVersion) throw new Error("A equipe mudou durante a seleção. Escolha novamente.");
    const pp: Record<string, number> = {};
    for (const move of detail.moves) pp[move.name] = move.pp ?? 10;
    const maxHp = 60 + (detail.stats.hp ?? 50);
    const isShiny = Math.random() < SHINY_CHANCE;
    player.team.push({
      pokemon: name, types: detail.types,
      image: isShiny ? (detail.sprites.shinyFront ?? detail.sprites.front) : detail.sprites.front,
      abilities: detail.abilities,
      moves: detail.moves as MoveData[],
      selectedMoves: detail.moves.slice(-MAX_SELECTED_MOVES).map(move => move.name),
      maxHp, hp: maxHp, status: null, isShiny,
      isTerastallized: false, sleepTurns: 0,
      pp,
      stats: detail.stats, sprites: detail.sprites, cries: detail.cries,
    });
    // O histórico é público: espécies e shiny do banco permanecem só na visão do dono.
    this.state.log.push(`${player.name} adicionou um Pokémon à equipe (${player.team.length}/${TEAM_SIZE}).`);
  }

  public setMoves(actorId: PlayerId, pokemon: string, moves: unknown): void {
    const player = this.requirePlayer(actorId);
    this.requireSetup(player);
    const member = this.requireMember(player, pokemon);
    if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_SELECTED_MOVES) throw new Error(`Envie entre 1 e ${MAX_SELECTED_MOVES} golpes.`);
    const names = moves.map(move => typeof move === "string" ? move.trim() : "");
    if (names.some(name => !name)) throw new Error("Todo golpe deve ter um nome válido.");
    if (new Set(names).size !== names.length) throw new Error("Não repita golpes equipados.");
    for (const moveName of names) {
      if (!member.moves.some(move => move.name === moveName)) throw new Error(`${member.pokemon} não conhece o golpe ${moveName}.`);
    }
    member.selectedMoves = [...new Set(names)];
    if (player.pokemon === member.pokemon && player.pokemonData) player.pokemonData.selectedMoves = [...member.selectedMoves];
    this.state.log.push(`${player.name} atualizou os golpes da equipe.`);
  }

  public acceptTeam(actorId: PlayerId): void {
    const player = this.requirePlayer(actorId);
    this.requireSetup(player);
    if (player.team.length !== TEAM_SIZE) throw new Error("Monte uma equipe de 6 Pokémon antes de confirmar.");
    player.ready = true;
    this.state.log.push(`${player.name} confirmou a equipe.`);
    if (this.state.players.every(item => item.ready)) this.startBattle();
  }

  public forfeit(actorId: PlayerId): void {
    this.requirePlayer(actorId);
    if (this.state.phase === "finished") return;
    const winner = this.state.players.find(player => player.id !== actorId)!;
    this.state.phase = "finished";
    this.state.finishReason = "disconnect";
    this.state.winner = winner.id;
    this.state.pendingSwitch = [false, false];
    const message = `${winner.name} venceu por desconexão do oponente.`;
    this.state.log.push(message);
    this.emit("victory", message, { actorId: winner.id, targetId: actorId });
  }

  /** TERASTALIZAÇÃO — mecânica oficial Gen 9:
   * 1. tipos defensivos viram APENAS o Tera Type;
   * 2. golpe do tipo Tera ganha STAB E tipos originais continuam com STAB;
   * 3. se Tera == um dos tipos originais, aquele tipo sobe pra ×2 STAB;
   * 4. golpes do tipo Tera com BP < 60 viram BP 60 (não multi-hit, não priority>0).
   */
  public terastallize(actorId: PlayerId): void {
    this.requireBattle();
    this.requireCurrentTurn(actorId);
    const player = this.state.players[this.state.turn];
    const data = this.requireActive(player);
    if (this.state.pendingSwitch[this.state.turn]) throw new Error("Escolha um substituto primeiro.");
    this.requireOpponentReady();
    const index = this.state.turn;
    if (this.teraUsed[index]) throw new Error("Você já terastalizou nesta partida.");
    data.isTerastallized = true;
    this.teraUsed[index] = true;
    const member = this.requireMember(player, player.pokemon ?? "");
    member.isTerastallized = true;
    const message = `${player.name} TERASTALIZOU! ${player.pokemon} agora é do tipo ${data.teraType.toUpperCase()}!`;
    this.state.log.push(message);
    this.emit("tera", message, { actorId, targetId: actorId, pokemon: player.pokemon ?? undefined });
    this.endTurn();
  }

  public switchPokemon(actorId: PlayerId, pokemon: string): void {
    this.requireBattle();
    const player = this.requirePlayer(actorId);
    const index = this.state.players.indexOf(player) as 0 | 1;
    const member = this.requireMember(player, pokemon);
    if (member.pokemon === player.pokemon) throw new Error("Este Pokémon já está em campo.");
    if (member.hp <= 0) throw new Error("Este Pokémon está nocauteado.");
    const forced = this.state.pendingSwitch[index];
    if (!forced) {
      this.requireCurrentTurn(actorId);
      this.requireOpponentReady();
    }
    this.syncActiveToMember(player);
    player.pokemon = member.pokemon;
    player.maxHp = member.maxHp;
    player.hp = member.hp;
    player.pokemonData = this.activeDataFor(member);
    this.state.pendingSwitch[index] = false;
    const message = `${player.name} enviou ${member.pokemon}!`;
    this.state.log.push(message);
    this.emit("switch_in", message, { actorId, targetId: actorId, pokemon: member.pokemon });
    if (!forced) this.endTurn();
  }

  /** Ação "defend" foi REMOVIDA do protocolo novo. Mantida no union por compatibilidade
   *  com clientes antigos, mas o servidor responde com erro orientando o novo fluxo. */
  public applyAction(actorId: PlayerId, action: PlayerAction): void {
    this.requireBattle();
    this.requireCurrentTurn(actorId);
    if (this.state.pendingSwitch[this.state.turn]) throw new Error("Escolha um substituto primeiro (clique numa pokébola).");
    this.requireOpponentReady();
    if (action.type === "defend") throw new Error("A ação Defesa foi removida. Use um golpe equipado.");
    const current = this.state.players[this.state.turn];
    const opponent = this.state.players[1 - this.state.turn];
    if (!current.pokemon || !opponent.pokemon) throw new Error("Aguarde os dois jogadores montarem as equipes.");

    if (!action || action.type !== "attack") {
      if (action && action.type === "special") throw new Error("A ação Especial foi removida. Use um golpe equipado.");
      throw new Error("Ação inválida. Use um golpe equipado.");
    }

    this.useMove(current, opponent, action.move);
    this.endTurn();
  }

  public resetTeam(actorId: PlayerId): void {
    const player = this.requirePlayer(actorId);
    if (this.state.phase !== "setup") throw new Error("A batalha já começou ou terminou — não é possível refazer a equipe.");
    this.teamVersions.set(actorId, (this.teamVersions.get(actorId) ?? 0) + 1);
    player.ready = false;
    player.team = [];
    player.pokemon = null;
    player.hp = 0;
    player.maxHp = 0;
    player.pokemonData = undefined;
    this.state.log.push(`${player.name} vai refazer a equipe do zero.`);
  }

  public get winner(): PlayerId | null { return this.state.winner; }

  private emit(type: BattleEventType, message: string, data: Omit<BattleEvent, "id" | "type" | "message"> = {}): void {
    this.state.events.push({ id: this.nextEventId++, type, message, ...data });
    if (this.state.events.length > MAX_EVENT_ENTRIES) this.state.events.splice(0, this.state.events.length - MAX_EVENT_ENTRIES);
  }

  // ---------- motor interno ----------

  private startBattle(): void {
    // Só duas confirmações oficiais iniciam o combate; a partir daqui a equipe é imutável.
    this.state.phase = "battle";
    for (const player of this.state.players) {
      const member = player.team[0];
      player.pokemon = member.pokemon;
      player.maxHp = member.maxHp;
      player.hp = member.hp;
      player.pokemonData = this.activeDataFor(member);
    }
    this.state.field = {
      weather: pick(WEATHERS), // visual
      terrain: pick(TERRAINS),
      background: pick(BATTLE_BACKGROUNDS), // cenário do campo - igual para os dois jogadores
      hazards: [{ stealthRock: false, spikes: 0 }, { stealthRock: false, spikes: 0 }],
    };
    const speedOf = (player: PlayerState) => {
      const base = player.pokemonData?.stats.speed ?? 50;
      return player.pokemonData?.status === "paralysis" ? base / 2 : base;
    };
    this.state.turn = speedOf(this.state.players[1]) > speedOf(this.state.players[0]) ? 1 : 0;
    this.state.log.push("As duas equipes estão confirmadas — a batalha vai começar!");
    this.state.log.push(`${this.state.players[this.state.turn].name} age primeiro (Pokémon mais veloz).`);
    this.emit("battle_start", "A batalha vai começar!");
    this.emit("turn_change", `${this.state.players[this.state.turn].name} começa.`, { targetId: this.state.players[this.state.turn].id });
  }

  private activeDataFor(member: TeamMemberState): ActivePokemonData {
    return {
      moves: member.moves as MoveData[], selectedMoves: [...member.selectedMoves], types: member.types,
      // Tera Type fixo: o primeiro tipo do Pokémon (implementação simplificada;
      // no jogo real seria configurável — depois podemos sortear aleatório)
      teraType: member.types[0] ?? "normal",
      isTerastallized: member.isTerastallized, status: member.status,
      isShiny: member.isShiny,
      statStages: freshStages(), sleepTurns: member.sleepTurns,
      poisonCounter: 1, flinched: false,
      confusionTurns: 0,
      pp: { ...member.pp },
      cries: member.cries, sprites: member.sprites, stats: member.stats,
    };
  }

  /** STAB OFICIAL (Gen 9 com Tera):
   * - terastallizado, golpe do tipo Tera:
   *     se Tera ∈ tipos originais → 2.0 (1.5 vira 2)
   *     senão → 1.5
   * - terastallizado, golpe de tipo ORIGINAL (mas não Tera): mantém 1.5
   * - não terastallizado: 1.5 se golpe ∈ tipos atuais
   */
  private stabMultiplier(data: ActivePokemonData, moveType: string): number {
    if (!data.isTerastallized) {
      return data.types.includes(moveType) ? 1.5 : 1;
    }
    // terastallizado
    const isTeraMove = moveType === data.teraType;
    const isOriginalMove = data.types.includes(moveType);
    if (isTeraMove && isOriginalMove) return 2.0; // Tera == tipo original → 2x
    if (isTeraMove) return 1.5; // Tera é tipo novo → 1.5
    if (isOriginalMove) return 1.5; // tipos originais continuam com STAB
    return 1;
  }

  /** BP < 60 do tipo Tera vira 60 — mas NÃO em multi-hit nem priority > 0 */
  private teraPowerBoost(data: ActivePokemonData, move: MoveData): number | null {
    if (!data.isTerastallized) return move.power;
    if (move.power == null) return null;
    if (move.type !== data.teraType) return move.power;
    const isMultiHit = (move.minHits ?? 1) > 1 || (move.maxHits ?? 1) > 1;
    if (isMultiHit || (move.priority ?? 0) > 0) return move.power;
    return move.power < MIN_BP ? MIN_BP : move.power;
  }

  private useMove(attacker: PlayerState, defender: PlayerState, moveName: string | undefined): void {
    const data = this.requireActive(attacker);
    const defenderData = this.requireActive(defender);
    const move = moveName ? data.moves.find(item => item.name === moveName) : undefined;
    if (!moveName || !move) throw new Error(`Golpe "${moveName ?? ""}" não está disponível.`);
    if (!data.selectedMoves.includes(move.name)) throw new Error(`Golpe "${move.name}" não está equipado.`);
    const label = move.name;

    // 1. VALIDACAO PURA — tudo que pode lancar excecao vem ANTES de qualquer
    //    mutacao. Antes o PP era conferido no passo 2, ou seja, depois de
    //    acordar / descongelar / decrementar a confusao: a excecao subia com o
    //    estado ja alterado e o index.ts respondia `error` sem fazer broadcast,
    //    entao o jogador perdia turnos de status sem ver nada na tela.
    if (move && (data.pp[move.name] ?? move.pp ?? 10) <= 0) {
      throw new Error(`${attacker.pokemon} está sem PP para ${label} — escolha outro golpe.`);
    }

    // 2. impedimentos
    if (data.flinched) {
      data.flinched = false;
      const message = `${attacker.name}: ${attacker.pokemon} vacilou e não conseguiu se mover!`;
      this.state.log.push(message);
      this.emit("flinch", message, { targetId: attacker.id, pokemon: attacker.pokemon ?? undefined });
      return;
    }
    if (data.status === "sleep") {
      if (data.sleepTurns > 0) {
        data.sleepTurns -= 1;
        this.state.log.push(`${attacker.name}: ${attacker.pokemon} está dormindo e não se moveu.`);
        return;
      }
      data.status = null;
      this.syncStatus(attacker);
      const message = `${attacker.name}: ${attacker.pokemon} acordou!`;
      this.state.log.push(message);
      this.emit("status_cure", message, { targetId: attacker.id, pokemon: attacker.pokemon ?? undefined });
    }
    if (data.status === "freeze") {
      if (Math.random() < 0.2) {
        data.status = null;
        this.syncStatus(attacker);
        const message = `${attacker.name}: ${attacker.pokemon} descongelou!`;
        this.state.log.push(message);
        this.emit("status_cure", message, { targetId: attacker.id, pokemon: attacker.pokemon ?? undefined });
      } else {
        this.state.log.push(`${attacker.name}: ${attacker.pokemon} está congelado e não se moveu.`);
        return;
      }
    }
    if (data.status === "paralysis" && Math.random() < 0.25) {
      this.state.log.push(`${attacker.name}: ${attacker.pokemon} está paralisado e não conseguiu atacar!`);
      return;
    }
    if (data.confusionTurns > 0) {
      data.confusionTurns -= 1;
      this.state.log.push(`${attacker.name}: ${attacker.pokemon} está confuso!`);
      if (Math.random() < CONFUSION_SELF_HIT_CHANCE) {
        const selfAttack = (data.stats.attack ?? 80) * stageMultiplier(data.statStages.attack);
        const selfDefense = Math.max(1, (data.stats.defense ?? 80) * stageMultiplier(data.statStages.defense));
        const selfDamage = Math.min(attacker.hp, Math.max(1, Math.floor(((22 * CONFUSION_BASE_POWER * selfAttack) / selfDefense) / 50 + 2)));
        this.setHp(attacker, attacker.hp - selfDamage);
        const message = `${attacker.pokemon} se machucou na confusão (-${selfDamage} HP)!`;
        this.state.log.push(message);
        this.emit("damage", message, { actorId: attacker.id, targetId: attacker.id, pokemon: attacker.pokemon ?? undefined, amount: selfDamage });
        return;
      }
      if (data.confusionTurns === 0) this.state.log.push(`${attacker.name}: ${attacker.pokemon} saiu da confusão!`);
    }

    // 3. PP — so consome quando o golpe realmente sai (dormindo/paralisado nao gasta)
    if (move) data.pp[move.name] = (data.pp[move.name] ?? move.pp ?? 10) - 1;

    // 4. precisão
    const accuracy = move?.accuracy ?? 100;
    const accStage = data.statStages.accuracy - defenderData.statStages.evasion;
    const accMultiplier = accStage >= 0 ? (3 + accStage) / 3 : 3 / (3 - accStage);
    if (Math.random() * 100 >= accuracy * accMultiplier) {
      const message = `${attacker.name} usou ${label}, mas ${defender.name} ESQUIVOU!`;
      this.state.log.push(message);
      this.emit("miss", message, { actorId: attacker.id, targetId: defender.id, pokemon: defender.pokemon ?? undefined, move: label });
      return;
    }

    // 6. OHKO
    if (move && move.metaCategory === "ohko") {
      const amount = defender.hp;
      this.setHp(defender, 0);
      const message = `${attacker.name} acertou ${label} — nocaute imediato!`;
      this.state.log.push(message);
      this.emit("damage", message, { actorId: attacker.id, targetId: defender.id, pokemon: defender.pokemon ?? undefined, amount, move: label });
      return;
    }

    // 7. golpes de status
    if (!move || move.power == null) {
      this.applyStatusMove(attacker, defender, move, label);
      return;
    }

    // 8. golpe com dano — TERA APLICADO AQUI
    const physical = move.category === "physical";
    const attackKey = physical ? "attack" : "specialAttack";
    const defenseKey = physical ? "defense" : "specialDefense";
    const critChance = move.critRate >= 3 ? 1 : move.critRate === 2 ? 0.5 : move.critRate === 1 ? 0.125 : 1 / 24;
    const isCrit = Math.random() < critChance;

    const atkStage = data.statStages[attackKey];
    const attackStat = (data.stats[attackKey] ?? 80) * stageMultiplier(isCrit && atkStage < 0 ? 0 : atkStage);
    const defStage = defenderData.statStages[defenseKey];
    const defenseStat = Math.max(1, (defenderData.stats[defenseKey] ?? 80) * stageMultiplier(isCrit && defStage > 0 ? 0 : defStage));

    // ⭐ TERALIZAÇÃO: BP<60 do tipo Tera vira 60
    const effectivePower = this.teraPowerBoost(data, move);
    if (effectivePower == null) return;
    const baseDamage = Math.floor(((22 * effectivePower * attackStat) / defenseStat) / 50 + 2);

    // ⭐ TERALIZAÇÃO: tipos DEFENSIVOS viram SÓ o Tera Type
    const defenderTypes = defenderData.isTerastallized ? [defenderData.teraType] : defenderData.types;
    const multiplier = effectiveness(move.type, defenderTypes);
    if (multiplier === 0) {
      const message = `${attacker.name} usou ${label}, mas não afeta ${defender.pokemon}!`;
      this.state.log.push(message);
      this.emit("immune", message, { actorId: attacker.id, targetId: defender.id, pokemon: defender.pokemon ?? undefined, move: label });
      return;
    }

    // ⭐ TERALIZAÇÃO: STAB oficial
    const stab = this.stabMultiplier(data, move.type);
    const burnPenalty = physical && data.status === "burn" ? 0.5 : 1;

    const hits = this.rollHits(move);
    let totalDamage = 0;
    let actualHits = 0;
    for (let hit = 0; hit < hits && defender.hp > 0; hit++) {
      const randomFactor = 0.85 + Math.random() * 0.15;
      const dmg = Math.min(defender.hp, Math.max(1, Math.floor(baseDamage * stab * multiplier * randomFactor * burnPenalty * (isCrit ? 1.5 : 1))));
      this.setHp(defender, defender.hp - dmg);
      totalDamage += dmg;
      actualHits++;
    }
    if (isCrit) this.state.log.push("Acerto crítico!");
    const damageMessage = `${attacker.name} usou ${label}${actualHits > 1 ? ` — acertou ${actualHits} vezes` : ""} (-${totalDamage} HP). ${stab > 1.5 ? `[STAB ×2 (Tera)]` : ""} ${(move as any).description ?? ""}`;
    this.state.log.push(damageMessage);
    this.emit("damage", damageMessage, { actorId: attacker.id, targetId: defender.id, pokemon: defender.pokemon ?? undefined, amount: totalDamage, move: label, crit: isCrit, hits: actualHits });
    if (multiplier > 1) {
      this.state.log.push("Foi super efetivo!");
      this.emit("effective", "Foi super efetivo!", { actorId: attacker.id, targetId: defender.id });
    } else if (multiplier < 1) {
      this.state.log.push("Não foi muito efetivo…");
      this.emit("resisted", "Não foi muito efetivo…", { actorId: attacker.id, targetId: defender.id });
    }

    // drenagem
    if (move.drain > 0 && totalDamage > 0) {
      const before = attacker.hp;
      this.setHp(attacker, Math.min(attacker.maxHp, attacker.hp + Math.max(1, Math.floor(totalDamage * move.drain / 100))));
      const amount = attacker.hp - before;
      const message = `${attacker.pokemon} drenou energia (+${amount} HP).`;
      this.state.log.push(message);
      this.emit("heal", message, { actorId: attacker.id, targetId: attacker.id, pokemon: attacker.pokemon ?? undefined, amount, move: label });
    }

    // flinch
    if (defender.hp > 0 && move.flinchChance > 0 && Math.random() * 100 < move.flinchChance) {
      defenderData.flinched = true;
      const message = `${defender.pokemon} vacilou com o impacto!`;
      this.state.log.push(message);
      this.emit("flinch", message, { actorId: attacker.id, targetId: defender.id, pokemon: defender.pokemon ?? undefined });
    }

    // efeitos secundários
    if (defender.hp > 0) this.applySecondaryEffects(attacker, defender, move);

    // self stat changes (Draco Meteor -2 SpA etc.)
        if ((move as any).selfStatChanges && (move as any).selfStatChanges.length > 0) {
      // Draco Meteor (raiz, sem chance) → sempre; Meteor Mash (secondary 20%) → sorteia
      if (Math.random() * 100 < ((move as any).statChance || 100)) {
        this.applyStatChanges(attacker, (move as any).selfStatChanges, true);
      }
    }
  }

  private applySecondaryEffects(attacker: PlayerState, defender: PlayerState, move: MoveData): void {
    const asAny = move as any;
    // statChanges no alvo (Icy Wind, etc.)
    if (asAny.statChanges && asAny.statChanges.length > 0 && asAny.statChance > 0) {
      if (Math.random() * 100 < asAny.statChance) {
        this.applyStatChanges(defender, asAny.statChanges, false);
      }
    }
    // status/flinch/confusion (ailment)
    if (asAny.ailment && asAny.ailment !== "none" && (asAny.ailmentChance ?? 0) > 0) {
      if (Math.random() * 100 < (asAny.ailmentChance ?? 0)) {
        this.applyStatus(defender, asAny.ailment);
      }
    }
  }

  private rollHits(move: MoveData): number {
    const min = move.minHits ?? 1;
    const max = move.maxHits ?? 1;
    if (max <= 1) return 1;
    if (min === max) return min;
    if (min === 2 && max === 5) {
      const roll = Math.random();
      return roll < 0.375 ? 2 : roll < 0.75 ? 3 : roll < 0.875 ? 4 : 5;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private applyStatChanges(target: PlayerState, changes: Array<{ stat: string; change: number }>, isSelf: boolean): boolean {
    let didSomething = false;
    for (const change of changes) {
      const key = mapStatKey(change.stat);
      const stages = target.pokemonData?.statStages;
      if (!stages || !(key in stages)) continue;
      const before = stages[key];
      const after = Math.max(-6, Math.min(6, before + change.change));
      stages[key] = after;
      if (after !== before) {
        const direction = change.change > 0 ? "subiu" : "caiu";
        const message = `O ${STAGE_LABEL[key] ?? key.toUpperCase()} de ${target.pokemon} ${direction}!`;
        this.state.log.push(message);
        this.emit(change.change > 0 ? "stat_up" : "stat_down", message, { targetId: target.id, pokemon: target.pokemon ?? undefined, stat: key });
        didSomething = true;
      }
    }
    return didSomething;
  }

  private applyStatusMove(attacker: PlayerState, defender: PlayerState, move: MoveData | undefined, label: string): void {
    if (!move) return;
    const isSelfTarget = ["self", "user", "allySide", "allyTeam", "allies", "adjacentAllyOrSelf"].includes(move.target ?? "");
    const target = isSelfTarget ? attacker : defender;
    const data = this.requireActive(target);
    let didSomething = false;

    // Rest é um efeito composto: cura total + cura do status + dois turnos de sono.
    if (move.selfSleepTurns && (target.hp >= target.maxHp || data.status === "sleep")) {
      this.state.log.push(`${attacker.name} usou ${label}, mas o golpe falhou.`);
      return;
    }
    if (move.cureStatus && data.status) {
      data.status = null;
      data.sleepTurns = 0;
      data.poisonCounter = 1;
      this.syncStatus(target);
      const message = `${target.name}: ${target.pokemon} foi curado do status!`;
      this.state.log.push(message);
      this.emit("status_cure", message, { actorId: attacker.id, targetId: target.id, pokemon: target.pokemon ?? undefined, move: label });
      didSomething = true;
    }
    if (move.healing > 0) {
      const before = target.hp;
      this.setHp(target, target.hp + Math.round(target.maxHp * move.healing / 100));
      const amount = target.hp - before;
      const message = `${target.name}: ${target.pokemon} usou ${label} e recuperou ${amount} HP.`;
      this.state.log.push(message);
      this.emit("heal", message, { actorId: attacker.id, targetId: target.id, pokemon: target.pokemon ?? undefined, amount, move: label });
      didSomething = amount > 0 || didSomething;
    }
    if (move.selfSleepTurns) {
      this.applyStatus(attacker, "sleep");
      attacker.pokemonData!.sleepTurns = move.selfSleepTurns;
      this.syncStatus(attacker);
      didSomething = true;
    }

    // buffs/debuffs — alvo decide pelo target do golpe
    if (move.statChanges && move.statChanges.length > 0) {
      didSomething = this.applyStatChanges(target, move.statChanges, isSelfTarget) || didSomething;
    }
    if (move.selfStatChanges.length > 0) {
      didSomething = this.applyStatChanges(attacker, move.selfStatChanges, true) || didSomething;
    }

    // status
    const ailment = move.ailment;
    if (ailment && ailment !== "none") {
      didSomething = this.applyStatus(target, ailment) || didSomething;
    }

    if (!didSomething) {
      this.state.log.push(`${attacker.name} usou ${label}, mas nada aconteceu. ${move.description ?? ""}`);
    }
  }

  private applyStatus(target: PlayerState, ailment: string): boolean {
    const status = ailment === "bad-poison" || ailment === "tox" ? "bad_poison" : ailment === "poison" || ailment === "psn" ? "poison" : ailment;
    const data = target.pokemonData;
    if (!data) return false;

    if (status === "confusion") {
      if (data.confusionTurns > 0) return false;
      data.confusionTurns = 2 + Math.floor(Math.random() * 3);
      const message = `${target.name}: ${target.pokemon} ficou CONFUSO!`;
      this.state.log.push(message);
      this.emit("status_apply", message, { targetId: target.id, pokemon: target.pokemon ?? undefined, status });
      return true;
    }

    if (!STATUSES.includes(status)) return false;
    if (data.status) return false;
    // ⭐ TERALIZAÇÃO: imunidades de tipo usam o Tera Type quando terastallizado
    const types = data.isTerastallized ? [data.teraType] : data.types;
    if (status === "burn" && types.includes("fire")) return false;
    if ((status === "poison" || status === "bad_poison") && (types.includes("poison") || types.includes("steel"))) return false;
    if (status === "freeze" && types.includes("ice")) return false;
    if (status === "paralysis" && types.includes("electric")) return false;
    data.status = status;
    if (status === "sleep") data.sleepTurns = 1 + Math.floor(Math.random() * 3);
    if (status === "bad_poison") data.poisonCounter = 1;
    this.syncStatus(target);
    const messages: Record<string, string> = {
      burn: "foi QUEIMADO!", poison: "foi ENVENENADO!", bad_poison: "foi gravemente ENVENENADO!",
      paralysis: "ficou PARALISADO!", sleep: "adormeceu!", freeze: "foi CONGELADO!",
    };
    const message = `${target.name}: ${target.pokemon} ${messages[status]}`;
    this.state.log.push(message);
    this.emit("status_apply", message, { targetId: target.id, pokemon: target.pokemon ?? undefined, status });
    return true;
  }

  private setHp(player: PlayerState, value: number): void {
    player.hp = Math.max(0, Math.min(player.maxHp, value));
    const member = player.team.find(item => item.pokemon === player.pokemon);
    if (member) member.hp = player.hp;
  }

  private syncActiveToMember(player: PlayerState): void {
    const member = player.team.find(item => item.pokemon === player.pokemon);
    if (member && player.pokemonData) {
      member.status = player.pokemonData.status;
      member.hp = player.hp;
      member.pp = { ...player.pokemonData.pp };
      member.isTerastallized = player.pokemonData.isTerastallized;
      member.sleepTurns = player.pokemonData.sleepTurns;
    }
  }

  private syncStatus(player: PlayerState): void {
    const member = player.team.find(item => item.pokemon === player.pokemon);
    if (member && player.pokemonData) {
      member.status = player.pokemonData.status;
      member.sleepTurns = player.pokemonData.sleepTurns;
    }
  }

  private endTurn(): void {
    for (const player of this.state.players) {
      const data = player.pokemonData;
      if (!data || player.hp <= 0) continue;
      let residual = 0;
      if (data.status === "burn") residual = Math.max(1, Math.floor(player.maxHp / 16));
      else if (data.status === "poison") residual = Math.max(1, Math.floor(player.maxHp / 8));
      else if (data.status === "bad_poison") {
        residual = Math.max(1, Math.floor((player.maxHp * data.poisonCounter) / 16));
        data.poisonCounter = Math.min(15, data.poisonCounter + 1);
      }
      if (residual > 0) {
        residual = Math.min(player.hp, residual);
        this.setHp(player, player.hp - residual);
        const message = `${player.name} sofreu dano residual (-${residual} HP).`;
        this.state.log.push(message);
        this.emit("residual", message, { targetId: player.id, pokemon: player.pokemon ?? undefined, amount: residual });
      }
      if (data.status === "freeze" && Math.random() < 0.2) {
        data.status = null;
        this.syncStatus(player);
        this.state.log.push(`${player.name}: ${player.pokemon} descongelou!`);
      }
      if (this.state.field.terrain === "grassy" && player.hp > 0 && player.hp < player.maxHp && !data.types.includes("flying")) {
        const before = player.hp;
        this.setHp(player, Math.min(player.maxHp, player.hp + Math.max(1, Math.floor(player.maxHp / 16))));
        if (player.hp > before) {
          const amount = player.hp - before;
          const message = `${player.pokemon} foi curado pelo campo gramado (+${amount} HP).`;
          this.state.log.push(message);
          this.emit("heal", message, { targetId: player.id, pokemon: player.pokemon ?? undefined, amount });
        }
      }
    }
    this.checkFaints();
    if (this.state.phase === "finished") return;
    this.state.turn = (1 - this.state.turn) as 0 | 1;
    this.emit("turn_change", `${this.state.players[this.state.turn].name} deve agir.`, { targetId: this.state.players[this.state.turn].id });
  }

  private checkFaints(): void {
    const wiped = this.state.players.map(player => player.team.length > 0 && player.team.every(member => member.hp <= 0));
    if (wiped[0] && wiped[1]) {
      this.state.phase = "finished";
      this.state.finishReason = "knockout";
      this.state.winner = null;
      this.state.log.push("As duas equipes caíram ao mesmo tempo — EMPATE!");
      this.emit("draw", "As duas equipes caíram ao mesmo tempo — EMPATE!");
      return;
    }
    this.state.players.forEach((player, index) => {
      if (player.hp > 0 || !player.pokemon) return;
      if (this.state.pendingSwitch[index]) return;
      const member = player.team.find(item => item.pokemon === player.pokemon);
      if (member) member.hp = 0;
      const faintMessage = `${player.name}: ${player.pokemon} foi nocauteado!`;
      this.state.log.push(faintMessage);
      this.emit("faint", faintMessage, { targetId: player.id, pokemon: player.pokemon });
      const alive = player.team.filter(item => item.hp > 0);
      if (alive.length === 0) {
        this.state.phase = "finished";
        this.state.finishReason = "knockout";
        this.state.winner = this.state.players[1 - index].id;
        const message = `${this.state.players[1 - index].name} VENCEU a batalha!`;
        this.state.log.push(message);
        this.emit(this.state.winner === this.state.players[0].id ? "victory" : "defeat", message, { actorId: this.state.winner, targetId: player.id });
      } else {
        this.state.pendingSwitch[index] = true;
        const message = `${player.name} deve escolher um substituto.`;
        this.state.log.push(message);
        this.emit("substitute_needed", message, { targetId: player.id });
      }
    });
  }

  private requirePlayer(actorId: PlayerId): PlayerState {
    const player = this.state.players.find(item => item.id === actorId);
    if (!player) throw new Error("Jogador não pertence à partida.");
    return player;
  }
  private requireSetup(player: PlayerState): void {
    if (this.state.phase !== "setup") throw new Error("A batalha já começou ou terminou — os golpes e a equipe estão travados.");
    if (player.ready) throw new Error("Sua equipe já foi confirmada. Use reset_team antes da batalha para refazê-la.");
  }
  private validateSelection(actorId: PlayerId, name: string): PlayerState {
    const player = this.requirePlayer(actorId);
    this.requireSetup(player);
    if (player.team.length >= TEAM_SIZE) throw new Error("Sua equipe já está completa (6 Pokémon).");
    if (player.team.some(member => member.pokemon === name)) throw new Error("Este Pokémon já está na sua equipe.");
    return player;
  }
  private requireBattle(): void {
    if (this.state.phase === "finished") throw new Error("A partida já terminou.");
    if (this.state.phase !== "battle") throw new Error("Aguarde os dois jogadores confirmarem as equipes.");
  }
  private requireCurrentTurn(actorId: PlayerId): void {
    if (actorId !== this.state.players[this.state.turn].id) throw new Error("Não é sua vez!");
  }
  /**
   * Trava a acao enquanto o ADVERSARIO ainda deve um substituto. Sem isso, um
   * nocaute por dano residual (queimadura/veneno) no turno da propria vitima
   * passava o turno para o oponente, que atacava um Pokemon com 0 HP ("-0 HP")
   * e repetia o log de nocaute.
   */
  private requireOpponentReady(): void {
    if (this.state.pendingSwitch[1 - this.state.turn]) {
      throw new Error("Aguarde o oponente enviar um substituto.");
    }
  }
  private requireMember(player: PlayerState, pokemon: string): TeamMemberState {
    const member = player.team.find(item => item.pokemon === String(pokemon).toLowerCase().trim());
    if (!member) throw new Error("Este Pokémon não está na sua equipe.");
    return member;
  }
  private requireActive(player: PlayerState): ActivePokemonData {
    if (!player.pokemonData) throw new Error("Nenhum Pokémon ativo.");
    return player.pokemonData;
  }
}
