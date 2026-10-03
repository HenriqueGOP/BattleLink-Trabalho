import { Battle, Dex, toID } from "@pkmn/sim";
import type { Pokemon, PokemonSet } from "@pkmn/sim";
import type { ActionRequest, BattleSetup, BattleUpdate, BattleView, ChoiceSubmission, CombatantId, EngineOptions, SideId, TeamSet } from "../battle-types";
import { BattleRuleError } from "../battle-types";
import { immutable } from "../immutable";
import { createBattleRngs } from "../rng";
import { BOOST_IDS, STAT_IDS } from "../types";
import { integer, validateBuild, validateSeed } from "../validation";
import { fieldState, other, ownPokemon, pokemonId, publicPokemon, roster } from "./battle-state";
import { EventRecorder } from "./event-recorder";
import { defaultMoveRegistry, HAZARDS, MoveRegistry } from "./move-registry";
import { simulatorPrng } from "./showdown-rng";

const SIDES = ["p1", "p2"] as const;
const format = new Dex.Format({
  name: "[Gen 9] Pokemon Battle", mod: "gen9", gameType: "singles",
  ruleset: ["Max Team Size = 6", "Max Move Count = 4", "Max Level = 100", "Default Level = 50"],
});

/** Estado mutável upstream encapsulado; comandos não fazem I/O ou usam relógios. */
export class BattleSession {
  readonly #battle: Battle;
  readonly #registry: MoveRegistry;
  readonly #recorder: EventRecorder;
  readonly #pending = new Map<SideId, ChoiceSubmission>();
  readonly #receipts = new Map<string, string>();
  #requestId = 1;
  #disposed = false;
  #faulted = false;

  constructor(setup: BattleSetup, options: EngineOptions = {}) {
    validateSeed(setup.seed);
    if (setup.teams.length !== 2) throw new BattleRuleError("INVALID_TEAM", "A partida exige duas equipes.");
    this.#registry = options.additionalMoves?.length ? new MoveRegistry(options.additionalMoves) : defaultMoveRegistry();
    const teams = setup.teams.map((team, side) => this.normalizeTeam(team, SIDES[side]));
    const battle = new Battle({ formatid: format.id, format, strictChoices: true,
      prng: simulatorPrng(options.rng ?? createBattleRngs(setup.seed).combat) }, this.#registry.dex);
    this.#battle = battle;
    this.#recorder = new EventRecorder(battle);
    this.installScopeGuards();
    try {
      battle.setPlayer("p1", { name: "p1", team: teams[0] });
      battle.setPlayer("p2", { name: "p2", team: teams[1] });
      // O jogo usa PP base, sem PP Ups. Defina ambos os slots para sobreviver à troca.
      for (const side of battle.sides) for (const pokemon of side.pokemon) {
        for (let i = 0; i < pokemon.moveSlots.length; i++) {
          const pp = battle.dex.moves.get(pokemon.moveSlots[i].id).pp;
          pokemon.moveSlots[i].pp = pokemon.moveSlots[i].maxpp = pp;
          pokemon.baseMoveSlots[i].pp = pokemon.baseMoveSlots[i].maxpp = pp;
          pokemon.ppUps[i] = 0;
        }
      }
      battle.makeRequest("move");
      this.assertInvariants();
      this.#recorder.sync();
    } catch (error) { battle.destroy(); throw error; }
  }

  private normalizeTeam(team: readonly TeamSet[], side: SideId): PokemonSet[] {
    if (!Array.isArray(team) || team.length < 1 || team.length > 6) throw new BattleRuleError("INVALID_TEAM", "Equipe deve conter de um a seis Pokémon.");
    const used = new Set<string>();
    return team.map((input, index) => {
      validateBuild(input);
      if (!/^[a-z0-9]{1,64}$/.test(input.speciesId)) throw new BattleRuleError("INVALID_TEAM", "ID de espécie inválido.");
      const species = this.#registry.dex.species.get(input.speciesId);
      if (!species.exists || species.id !== input.speciesId || species.gen > 9 || species.num < 1 || species.num > 1025 || species.forme || used.has(species.id)) {
        throw new BattleRuleError("INVALID_TEAM", "Espécie indisponível, alternativa ou repetida.");
      }
      used.add(species.id);
      if (!Array.isArray(input.moves) || input.moves.length < 1 || input.moves.length > 4 || new Set(input.moves).size !== input.moves.length) {
        throw new BattleRuleError("INVALID_TEAM", "Selecione de um a quatro golpes distintos.");
      }
      const pool = this.#registry.dex.species.getMovePool(species.id, true);
      for (const id of input.moves) {
        if (!/^[a-z0-9]{1,64}$/.test(id) || !this.#registry.get(id)?.support.supported || id === "struggle" ||
          (!pool.has(toID(id)) && !this.#registry.addedIds.has(id))) {
          throw new BattleRuleError("INVALID_TEAM", `Golpe indisponível para esta espécie: ${id}`);
        }
      }
      const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      for (const stat of STAT_IDS) { ivs[stat] = input.ivs?.[stat] ?? 31; evs[stat] = input.evs?.[stat] ?? 0; }
      return {
        name: `${side}s${index}`, species: species.name, moves: [...input.moves],
        level: input.level ?? 50, nature: this.#registry.dex.natures.get(input.nature ?? "hardy").name, ivs, evs,
        ability: Object.values(species.abilities).includes("Adaptability") ? "Adaptability" : "No Ability",
        item: "", gender: species.gender ?? "M", happiness: 255, shiny: false,
      };
    });
  }

  private installScopeGuards(): void {
    const battle = this.#battle;
    const allowed = (move: string | { readonly id: string }) => this.#registry.allowed(typeof move === "string" ? toID(move) : move.id);
    const run = battle.actions.runMove.bind(battle.actions);
    battle.actions.runMove = (move, pokemon, location, options) => {
      if (!allowed(move)) { battle.add("-fail", pokemon); return; }
      run(move, pokemon, location, options);
    };
    const use = battle.actions.useMove.bind(battle.actions);
    battle.actions.useMove = (move, pokemon, options): unknown => {
      if (!allowed(move)) { battle.add("-fail", pokemon); return false; }
      return use(move, pokemon, options);
    };
    // As escolhas públicas não oferecem flags de transformação. Defesas adicionais
    // impedem ativações indiretas por callbacks ou futuras alterações do catálogo.
    battle.actions.canTerastallize = () => null;
    battle.actions.canMegaEvo = () => null;
    battle.actions.canUltraBurst = () => null;
    battle.field.setWeather = () => false;
    battle.field.setTerrain = () => false;
  }

  private ensureUsable(): void {
    if (this.#disposed || this.#faulted) throw new BattleRuleError("ENGINE_CONTRACT", "Instância encerrada ou inválida.");
  }
  private side(side: SideId): void {
    if (!SIDES.includes(side)) throw new BattleRuleError("INVALID_ACTION", "Jogador inválido.");
  }
  private request(side: SideId): ActionRequest | null {
    if (this.#battle.ended) return null;
    const player = this.#battle.getSide(side);
    const request = player.activeRequest;
    if (!request || request.wait) return null;
    if (request.teamPreview) throw new BattleRuleError("ENGINE_CONTRACT", "Team preview não faz parte deste formato.");
    const active = player.active[0];
    const reviving = !!active?.side.slotConditions[active.position]?.revivalblessing;
    const forced = !!request.forceSwitch;
    const moveRequest = "active" in request ? request.active[0] : undefined;
    const onlyMove = moveRequest?.moves.length === 1 ? moveRequest.moves[0] : undefined;
    const lockedMoveId = onlyMove && onlyMove.pp === undefined && onlyMove.id !== "struggle" ? onlyMove.id : null;
    const switches = moveRequest?.trapped ? [] : roster(this.#battle, side)
      .filter(pokemon => reviving ? pokemon.fainted : !pokemon.isActive && pokemon.hp > 0)
      .map(pokemonId);
    return immutable({
      id: this.#requestId, kind: reviving ? "revive" : forced ? "switch" : "move", switches, lockedMoveId,
      moves: (moveRequest?.moves ?? []).map(move => ({
        id: move.id, pp: move.pp ?? active.moveSlots.find(slot => slot.id === move.id)?.pp ?? 0,
        maxPp: move.maxpp ?? active.moveSlots.find(slot => slot.id === move.id)?.maxpp ?? 0,
        disabled: !!move.disabled || !this.#registry.allowed(move.id),
      })), submitted: this.#pending.has(side),
    });
  }
  getView(side: SideId): BattleView {
    this.ensureUsable(); this.side(side);
    const battle = this.#battle;
    return immutable({
      phase: battle.ended ? "finished" : battle.requestState === "switch" ? "forced_switch" : "collecting",
      round: battle.turn, sequence: this.#recorder.lastSequence, request: this.request(side), result: this.#recorder.result,
      ownTeam: roster(battle, side).map(ownPokemon),
      opponentTeam: roster(battle, other(side)).map(pokemon => this.#recorder.revealed.has(pokemonId(pokemon))
        ? publicPokemon(pokemon) : { id: pokemonId(pokemon), hidden: true as const }),
      active: { p1: battle.p1.active[0] ? pokemonId(battle.p1.active[0]) : null,
        p2: battle.p2.active[0] ? pokemonId(battle.p2.active[0]) : null }, ...fieldState(battle),
    });
  }
  getEvents(side: SideId, afterSequence = 0) {
    this.ensureUsable(); this.side(side); integer(afterSequence, 0, Number.MAX_SAFE_INTEGER, "Sequência");
    return this.#recorder.events(side, afterSequence);
  }

  submit(input: ChoiceSubmission): BattleUpdate {
    this.ensureUsable();
    if (!input || typeof input !== "object") throw new BattleRuleError("INVALID_ACTION", "Ação inválida.");
    this.side(input.side);
    if (typeof input.actionId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(input.actionId)) throw new BattleRuleError("INVALID_ACTION", "ID da ação inválido.");
    if (!Number.isSafeInteger(input.requestId) || input.requestId < 1 || !input.choice || typeof input.choice !== "object") {
      throw new BattleRuleError("INVALID_ACTION", "Solicitação ou escolha inválida.");
    }
    const submitted = input.choice;
    if ((submitted.type === "move" && (typeof submitted.moveId !== "string" || !/^[a-z0-9]{1,64}$/.test(submitted.moveId))) ||
      (submitted.type === "switch" && (typeof submitted.combatantId !== "string" || !/^p[12]s[0-5]$/.test(submitted.combatantId))) ||
      !["move", "switch"].includes(submitted.type)) throw new BattleRuleError("INVALID_ACTION", "Escolha inválida.");
    const key = `${input.side}:${input.actionId}`;
    const choice = submitted.type === "move" ? { type: "move" as const, moveId: submitted.moveId }
      : { type: "switch" as const, combatantId: submitted.combatantId };
    const fingerprint = JSON.stringify({ requestId: input.requestId, choice });
    const previous = this.#receipts.get(key);
    if (previous !== undefined) {
      if (previous !== fingerprint) throw new BattleRuleError("INVALID_ACTION", "ID da ação reutilizado com outro conteúdo.");
      return immutable({ resolved: false, duplicate: true, sequence: this.#recorder.lastSequence });
    }
    if (this.#battle.ended) throw new BattleRuleError("FINISHED", "A partida terminou.");
    if (input.requestId !== this.#requestId) throw new BattleRuleError("STALE_REQUEST", "Solicitação de turno expirada.");
    const request = this.request(input.side);
    if (!request) throw new BattleRuleError("INVALID_ACTION", "Este jogador deve aguardar.");
    if (request.submitted) throw new BattleRuleError("ALREADY_SUBMITTED", "Ação já confirmada.");
    if (choice.type === "move") {
      const move = request.moves.find(candidate => candidate.id === choice.moveId);
      if (request.kind !== "move" || !move || move.disabled || (move.pp <= 0 && move.id !== "struggle" && request.lockedMoveId !== move.id)) {
        throw new BattleRuleError("INVALID_ACTION", "Golpe indisponível nesta solicitação.");
      }
    } else if (choice.type !== "switch" || !request.switches.includes(choice.combatantId)) {
      throw new BattleRuleError("INVALID_ACTION", "Troca indisponível nesta solicitação.");
    }
    const accepted: ChoiceSubmission = immutable({ side: input.side, requestId: input.requestId, actionId: input.actionId, choice: { ...choice } });
    this.#pending.set(input.side, accepted);
    this.#receipts.set(key, fingerprint);
    if (this.#receipts.size > 256) this.#receipts.delete(this.#receipts.keys().next().value!);
    const required = SIDES.filter(side => this.request(side) !== null);
    if (required.some(side => !this.#pending.has(side))) return immutable({ resolved: false, duplicate: false, sequence: this.#recorder.lastSequence });
    try {
      for (const side of required) {
        const action = this.#pending.get(side)!.choice;
        let command: string;
        if (action.type === "switch") {
          const index = this.#battle.getSide(side).pokemon.findIndex(candidate => pokemonId(candidate) === action.combatantId);
          command = `switch ${index + 1}`;
        } else {
          // Solicitações de carga têm um único slot, mesmo que o golpe original
          // estivesse no quarto slot ou tenha sido chamado por Metronome.
          command = `move ${action.moveId}`;
        }
        if (!this.#battle.choose(side, command)) throw new BattleRuleError("ENGINE_CONTRACT", "O simulador recusou uma ação previamente validada.");
      }
      this.#pending.clear(); this.#requestId++;
      this.assertInvariants(); this.#recorder.sync();
      return immutable({ resolved: true, duplicate: false, sequence: this.#recorder.lastSequence });
    } catch (error) { this.#faulted = true; throw error; }
  }

  forfeit(side: SideId): void {
    this.ensureUsable(); this.side(side);
    if (this.#battle.ended) return;
    this.#recorder.setEndReason("forfeit");
    this.#pending.clear();
    this.#battle.win(other(side));
    this.#recorder.sync();
  }
  destroy(): void {
    if (this.#disposed) return;
    this.#battle.destroy(); this.#disposed = true; this.#pending.clear(); this.#receipts.clear();
  }

  private assertInvariants(): void {
    const battle = this.#battle;
    if (battle.field.weather || battle.field.terrain) throw new BattleRuleError("ENGINE_CONTRACT", "Campo fora do escopo.");
    for (const side of battle.sides) {
      if (Object.keys(side.sideConditions).some(id => HAZARDS.has(id))) throw new BattleRuleError("ENGINE_CONTRACT", "Hazard fora do escopo.");
      for (const pokemon of side.pokemon) this.checkPokemon(pokemon);
    }
  }
  private checkPokemon(pokemon: Pokemon): void {
    integer(pokemon.hp, 0, pokemon.maxhp, "HP");
    for (const stat of BOOST_IDS) integer(pokemon.boosts[stat], -6, 6, "Estágio");
    for (const move of pokemon.moveSlots) integer(move.pp, 0, move.maxpp, "PP");
    if (pokemon.item || !["noability", "adaptability"].includes(pokemon.ability) || pokemon.species.id !== pokemon.baseSpecies.id || pokemon.terastallized || pokemon.volatiles.dynamax) {
      throw new BattleRuleError("ENGINE_CONTRACT", "Mecânica excluída foi ativada.");
    }
  }
}
