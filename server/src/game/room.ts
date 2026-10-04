import { formatSize, type FormatChoice } from "../contracts/formats";
import { trainerById, type Difficulty } from "../contracts/trainers";
import { trainerTeam } from "./trainers";
import { botChoice } from "./bot";
import { randomBytes, randomUUID } from "node:crypto";
import {
  catalog,
  moveById,
  speciesById,
  suggestedMoves,
} from "../contracts/catalog";
import { ARENA_IDS } from "../contracts/protocol";
import type {
  ArenaId,
  ClientMessage,
  GamePhase,
  Participant,
  RoomResult,
  RoomSnapshot,
  Selection,
} from "../contracts/protocol";
import {
  BattleRuleError,
  BattleSession,
  createBattleRngs,
  createRng,
  randomChance,
  randomInt,
} from "./engine";
import type {
  BattleUpdate,
  CombatantId,
  RNG,
  RngSeed,
  TeamSet,
} from "./engine";
import { immutable } from "./engine/immutable";
import { AsyncMutex } from "./mutex";

const SIDES = ["p1", "p2"] as const;
const MAX_EVENTS = 240;
export interface RoomOptions {
  readonly id?: string; readonly format?: FormatChoice; readonly mode?: "automatic" | "private" | "pve";
  readonly inviteCode?: string; readonly trainerId?: string; readonly difficulty?: Difficulty;
}
const seedFromEntropy = (): RngSeed => {
  const bytes = randomBytes(8);
  return [
    bytes.readUInt16BE(0),
    bytes.readUInt16BE(2),
    bytes.readUInt16BE(4),
    bytes.readUInt16BE(6),
  ];
};

/** Orquestra ciclo, equipes e identidades; somente BattleSession resolve regras. */
export class Room {
  readonly id: string;
  readonly matchId = `match-${randomUUID()}`;
  readonly format: FormatChoice;
  readonly options: RoomOptions;
  private readonly botRng: RNG;
  private rematchDeadline: number | null = null;
  private rematchVotes: [boolean | null, boolean | null] = [null, null];
  private rematchEnabled = true;
  readonly mutex = new AsyncMutex();
  private readonly players: [Participant, Participant];
  private readonly teams: [Selection[], Selection[]] = [[], []];
  private readonly teamRng: [RNG, RNG];
  private readonly presentationRng: RNG;
  private readonly seed: RngSeed;
  private engine: BattleSession | null = null;
  private phase: GamePhase = "setup";
  private result: RoomResult | null = null;
  private preparationId: string | null = null;
  private prepared: [boolean, boolean] = [false, false];
  private readonly arena: ArenaId;
  private readonly log: string[] = ["Partida encontrada. Monte sua equipe."];
  private closed = false;
  private lastSequence = 0;

  constructor(
    player1: string,
    player2: string,
    seed: RngSeed = seedFromEntropy(),
    options: RoomOptions = {},
  ) {
    this.id = options.id ?? `room-${randomUUID()}`;
    this.options = options;
    this.format = options.format ?? { id: "classic" };
    this.botRng = createRng(seed.map(word => word ^ 0xa17e) as unknown as RngSeed);
    this.seed = immutable([...seed] as RngSeed);
    this.players = [
      { id: player1, name: "Jogador 1", ready: false, teamCount: 0 },
      { id: player2, name: "Jogador 2", ready: false, teamCount: 0 },
    ];
    const streams = createBattleRngs(seed);
    const nextSeed = (): RngSeed => [
      randomInt(streams.teams, 0, 65536),
      randomInt(streams.teams, 0, 65536),
      randomInt(streams.teams, 0, 65536),
      randomInt(streams.teams, 0, 65536),
    ];
    this.teamRng = [createRng(nextSeed()), createRng(nextSeed())];
    this.presentationRng = streams.presentation;
    this.arena = (options.trainerId ? trainerById(options.trainerId)?.arena : undefined) ??
      ARENA_IDS[randomInt(this.presentationRng, 0, ARENA_IDS.length)];
    if (options.trainerId) {
      this.setName(player2, trainerById(options.trainerId)!.name);
      this.loadTeam(player2, trainerTeam(options.trainerId, this.format).map((member, index) => ({ id: `p2s${index}` as CombatantId, speciesId: member.speciesId, moves: member.moves, shiny: false })));
      this.acceptTeam(player2);
      this.prepared[1] = true;
    }
  }

  /** Metadados públicos; nunca contém equipe, escolhas ou seed. */
  get state() {
    return immutable({
      phase: this.phase,
      players: this.players.map((player) => ({ ...player })),
    });
  }
  get preparing(): boolean {
    return this.phase === "preparing";
  }
  private index(id: string): 0 | 1 {
    const index = this.players.findIndex((player) => player.id === id);
    if (index < 0) throw new Error("Jogador não pertence à partida.");
    if (this.closed) throw new Error("Sala encerrada.");
    return index as 0 | 1;
  }
  private setup(index: 0 | 1): void {
    if (this.phase !== "setup")
      throw new Error("A batalha já começou. Equipe e golpes estão travados.");
    if (this.players[index].ready)
      throw new Error(
        "Equipe já confirmada. As escolhas estão travadas.",
      );
  }
  private append(text: string): void {
    this.log.push(text);
    if (this.log.length > 40) this.log.shift();
  }
  private updateCount(index: 0 | 1): void {
    this.players[index] = {
      ...this.players[index],
      teamCount: this.teams[index].length,
    };
  }
  setName(id: string, name: string): void {
    const index = this.index(id);
    this.players[index] = {
      ...this.players[index],
      name: name.trim().slice(0, 24) || "Jogador",
    };
  }
  choosePokemon(id: string, speciesId: string): void {
    const index = this.index(id);
    this.setup(index);
    if (this.teams[index].length >= formatSize(this.format))
      throw new Error(`A equipe já tem ${formatSize(this.format)} Pokémon.`);
    if (!speciesById(speciesId))
      throw new Error("Pokémon desconhecido no catálogo local.");
    if (this.teams[index].some((member) => member.speciesId === speciesId))
      throw new Error("Este Pokémon já está na equipe.");
    const moves = suggestedMoves(speciesId);
    if (!moves.length)
      throw new Error("Esta espécie não tem golpes compatíveis.");
    if (this.format.id === "monotype" && !speciesById(speciesId)?.types.includes(this.format.type!)) throw new Error("Pokémon fora do tipo escolhido.");
    this.teams[index].push(
      immutable({
        id: `${SIDES[index]}s${this.teams[index].length}` as CombatantId,
        speciesId,
        moves,
        shiny: randomChance(this.presentationRng, 1, 20),
      }),
    );
    this.updateCount(index);
    this.append(
      `${this.players[index].name} adicionou um Pokémon à equipe (${this.teams[index].length}/${formatSize(this.format)}).`,
    );
  }
  randomTeam(id: string, count: number): void {
    const index = this.index(id);
    this.setup(index);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > formatSize(this.format) - this.teams[index].length
    )
      throw new Error("Quantidade inválida para o sorteio.");
    const available = catalog.species.filter(
      (species) =>
        (this.format.id !== "monotype" || species.types.includes(this.format.type!)) &&
        !this.teams[index].some((member) => member.speciesId === species.id) &&
        suggestedMoves(species.id).length > 0,
    );
    if (available.length < count) throw new Error("Não há espécies suficientes para este formato.");
    for (let n = 0; n < count; n++) {
      const selected = available.splice(
        randomInt(this.teamRng[index], 0, available.length),
        1,
      )[0];
      this.choosePokemon(id, selected.id);
    }
  }
  private reindexTeam(index: 0 | 1): void {
    this.teams[index] = this.teams[index].map((member, position) => immutable({ ...member, id: `${SIDES[index]}s${position}` as CombatantId }));
    this.updateCount(index);
  }
  removePokemon(id: string, speciesId: string): void {
    const index = this.index(id);
    this.setup(index);
    const slot = this.teams[index].findIndex(member => member.speciesId === speciesId);
    if (slot < 0) throw new Error("Pokémon não pertence à equipe.");
    this.teams[index].splice(slot, 1);
    this.reindexTeam(index);
    this.append(`${this.players[index].name} removeu um Pokémon da equipe (${this.teams[index].length}/${formatSize(this.format)}).`);
  }
  reorderTeam(id: string, speciesIds: readonly string[]): void {
    const index = this.index(id);
    this.setup(index);
    const team = this.teams[index];
    if (!Array.isArray(speciesIds) || !speciesIds.length || speciesIds.length !== team.length || new Set(speciesIds).size !== team.length || speciesIds.some(speciesId => !team.some(member => member.speciesId === speciesId))) {
      throw new Error("A ordem deve conter exatamente os Pokémon da sua equipe.");
    }
    this.teams[index] = speciesIds.map(speciesId => team.find(member => member.speciesId === speciesId)!);
    this.reindexTeam(index);
    // Positions and the selected lead remain private until they enter the battle.
    this.append(`${this.players[index].name} reorganizou a equipe.`);
  }
  setMoves(id: string, speciesId: string, moves: readonly string[]): void {
    const index = this.index(id);
    this.setup(index);
    const slot = this.teams[index].findIndex(
      (member) => member.speciesId === speciesId,
    );
    const species = speciesById(speciesId);
    if (slot < 0 || !species) throw new Error("Pokémon não pertence à equipe.");
    if (
      !Array.isArray(moves) ||
      !moves.length ||
      moves.length > 4 ||
      new Set(moves).size !== moves.length ||
      moves.some(
        (move) =>
          !species.moveIds.includes(move) ||
          !moveById(move)?.support.supported ||
          move === "struggle",
      )
    )
      throw new Error("Golpes inválidos ou indisponíveis para esta espécie.");
    this.teams[index][slot] = immutable({
      ...this.teams[index][slot],
      moves: [...moves],
    });
    this.append(`${this.players[index].name} atualizou os golpes da equipe.`);
  }
  resetTeam(id: string): void {
    const index = this.index(id);
    this.setup(index);
    this.teams[index] = [];
    this.players[index] = {
      ...this.players[index],
      ready: false,
      teamCount: 0,
    };
    this.append(`${this.players[index].name} vai refazer a equipe.`);
  }
  acceptTeam(id: string): void {
    const index = this.index(id);
    this.setup(index);
    if (this.teams[index].length !== formatSize(this.format))
      throw new Error(`Monte uma equipe de ${formatSize(this.format)} Pokémon antes de confirmar.`);
    this.players[index] = { ...this.players[index], ready: true };
    this.append(`${this.players[index].name} confirmou a equipe.`);
    if (!this.players.every((player) => player.ready)) return;
    try {
      this.reindexTeam(0);
      this.reindexTeam(1);
      this.engine = new BattleSession({
        seed: this.seed,
        teams: this.teams.map((team) =>
          team.map((member) => ({
            speciesId: member.speciesId,
            moves: member.moves,
          })),
        ) as [TeamSet[], TeamSet[]],
      });
      this.phase = "preparing";
      this.preparationId = randomUUID();
    } catch (error) {
      this.abort();
      throw error instanceof BattleRuleError
        ? error
        : new BattleRuleError(
            "ENGINE_CONTRACT",
            "Falha ao preparar a batalha.",
          );
    }
  }
  battleReady(id: string, preparationId: string): void {
    const index = this.index(id);
    if (
      preparationId !== this.preparationId ||
      !["preparing", "battle"].includes(this.phase)
    )
      throw new Error("Preparação expirada.");
    if (this.phase === "battle") return; // confirmação repetida é inofensiva
    this.prepared[index] = true;
    if (this.prepared.every(Boolean)) {
      this.phase = "battle";
      this.append("Batalha iniciada! Escolha sua ação.");
    }
  }
  preparationExpired(): void {
    if (!this.preparing) return;
    const winner =
      this.prepared[0] !== this.prepared[1]
        ? SIDES[this.prepared[0] ? 0 : 1]
        : null;
    this.result = { winner, reason: "preparation_timeout" };
    this.phase = "finished";
    this.append("A preparação excedeu o tempo disponível. Partida encerrada.");
  }
  applyAction(
    id: string,
    action: Extract<ClientMessage, { type: "action" }>,
  ): BattleUpdate {
    const index = this.index(id);
    if (!this.engine || (this.phase !== "battle" && this.phase !== "finished"))
      throw new Error("Aguarde os dois jogadores confirmarem a preparação.");
    if (
      this.result &&
      this.result.reason !== "knockout" &&
      this.result.reason !== "draw"
    )
      throw new Error("A partida terminou.");
    try {
      const update = this.engine.submit({
        side: SIDES[index],
        requestId: action.requestId,
        actionId: action.actionId,
        choice: action.choice,
      });
      const result = this.engine.getView(SIDES[index]).result;
      if (result) {
        this.result = {
          winner: result.winner,
          reason: result.winner ? "knockout" : "draw",
        };
        this.phase = "finished";
      }
      return update;
    } catch (error) {
      if (
        !(error instanceof BattleRuleError) ||
        error.code === "ENGINE_CONTRACT"
      ) {
        this.abort();
        throw new BattleRuleError(
          "ENGINE_CONTRACT",
          "A partida foi interrompida por uma falha de execução.",
        );
      }
      throw error;
    }
  }
  forfeit(id: string): void {
    const index = this.index(id);
    if (this.phase === "finished") return;
    this.engine?.forfeit(SIDES[index]);
    this.result = { winner: SIDES[1 - index], reason: "disconnect" };
    this.phase = "finished";
    this.append(
      `${this.players[1 - index].name} venceu por desconexão do oponente.`,
    );
  }
  private abort(): void {
    this.engine?.destroy();
    this.engine = null;
    this.result = { winner: null, reason: "engine_error" };
    this.phase = "finished";
    this.append("A partida foi interrompida por uma falha de execução.");
  }
  getStateFor(id: string): RoomSnapshot {
    const index = this.index(id),
      viewer = SIDES[index];
    const battle = this.engine?.getView(viewer) ?? null;
    const sequence = battle?.sequence ?? this.lastSequence;
    this.lastSequence = sequence;
    const eventFloor = Math.max(0, sequence - MAX_EVENTS);
    const shiny: Partial<Record<CombatantId, boolean>> = {};
    if (battle)
      for (const pokemon of [...battle.ownTeam, ...battle.opponentTeam]) {
        if ("hidden" in pokemon) continue;
        const team = this.teams[pokemon.id.startsWith("p1") ? 0 : 1];
        shiny[pokemon.id] =
          team.find((member) => member.id === pokemon.id)?.shiny ?? false;
      }
    return immutable({
      roomId: this.id,
      matchId: this.matchId, format: this.format, mode: this.options.mode ?? "automatic",
      inviteCode: this.options.inviteCode ?? null, trainerId: this.options.trainerId ?? null, difficulty: this.options.difficulty ?? null,
      rematch: { expiresAt: this.rematchDeadline, votes: this.rematchVotes.map(vote => vote !== null) as [boolean, boolean], available: this.rematchEnabled },
      phase: this.phase,
      viewer,
      players: this.players.map((player) => ({ ...player })) as [
        Participant,
        Participant,
      ],
      team: [...this.teams[index]],
      arena: this.arena,
      battle,
      events: this.engine?.getEvents(viewer, eventFloor) ?? [],
      eventFloor,
      sequence,
      revealedShiny: shiny,
      preparation:
        this.preparationId && this.phase === "preparing"
          ? { id: this.preparationId, ready: this.prepared[index] }
          : null,
      result: this.result,
      log: [...this.log],
    });
  }
  assertMatch(matchId: string | undefined): void {
    if (matchId !== this.matchId) throw new BattleRuleError("STALE_REQUEST", "Esta mensagem pertence a outra partida.");
  }
  loadTeam(id: string, members: readonly Selection[]): void {
    for (const member of members) {
      this.choosePokemon(id, member.speciesId);
      this.setMoves(id, member.speciesId, [...member.moves]);
      const index = this.index(id), slot = this.teams[index].length - 1;
      this.teams[index][slot] = immutable({ ...this.teams[index][slot], shiny: member.shiny });
    }
  }
  get botRequest(): number | null {
    const request = this.options.mode === "pve" && this.phase === "battle" ? this.engine?.getView("p2").request : null;
    return request && !request.submitted ? request.id : null;
  }
  playBot(policy: typeof botChoice = botChoice): void {
    if (!this.engine || !this.botRequest) return;
    const view = this.engine.getView("p2");
    if (!view.request || view.request.submitted) return;
    let choice;
    try { choice = policy(view, this.engine.getEvents("p2"), this.options.difficulty ?? "normal", this.botRng); }
    catch {
      const move = view.request.moves.find(move => !move.disabled && (move.pp > 0 || move.id === "struggle" || view.request!.lockedMoveId === move.id));
      choice = view.request.kind === "move" && move ? { type: "move" as const, moveId: move.id }
        : { type: "switch" as const, combatantId: view.request.switches[0] };
    }
    this.applyAction(this.players[1].id, { type: "action", matchId: this.matchId, requestId: view.request.id, actionId: `bot-${view.request.id}`, choice });
  }
  openRematch(now = Date.now()): void {
    if (this.phase === "finished" && this.rematchDeadline === null && this.rematchEnabled && this.result && ["knockout", "draw"].includes(this.result.reason)) this.rematchDeadline = now + 30000;
    if (this.result && !["knockout", "draw"].includes(this.result.reason)) this.rematchEnabled = false;
  }
  voteRematch(id: string, keep: boolean, now = Date.now()): boolean {
    const index = this.index(id);
    if (this.phase !== "finished" || !this.rematchEnabled || !this.rematchDeadline || now >= this.rematchDeadline) throw new Error("Revanche indisponível ou expirada.");
    if (this.rematchVotes[index] !== null && this.rematchVotes[index] !== keep) throw new Error("Resposta da revanche já registrada.");
    this.rematchVotes[index] = keep;
    if (this.options.mode === "pve") this.rematchVotes[1] = true;
    return this.rematchVotes.every(vote => vote !== null);
  }
  expireRematch(): void { this.rematchEnabled = false; }
  rematchTeam(id: string): readonly Selection[] | null { const index = this.index(id); return this.rematchVotes[index] ? [...this.teams[index]] : null; }
  destroy(): void {
    if (this.closed) return;
    this.engine?.destroy();
    this.engine = null;
    this.closed = true;
  }
}
