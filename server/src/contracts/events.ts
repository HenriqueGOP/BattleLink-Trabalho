import type { BattleEvent, CombatantId } from "../game/engine/battle-types";
import type { RoomSnapshot } from "./protocol";
import { moveById, speciesById } from "./catalog";

export function eventMessage(event: BattleEvent, state: RoomSnapshot): string {
  const name = (id: CombatantId | null): string => {
    if (!id) return "Campo";
    const pokemon = [
      ...(state.battle?.ownTeam ?? []),
      ...(state.battle?.opponentTeam ?? []),
    ].find((pokemon) => pokemon.id === id);
    const species =
      pokemon && "speciesId" in pokemon
        ? speciesById(pokemon.speciesId)?.name
        : null;
    return species ?? state.players[id.startsWith("p1") ? 0 : 1].name;
  };
  switch (event.type) {
    case "battle_start":
      return "Batalha iniciada!";
    case "round_start":
      return `Rodada ${event.number}: os dois jogadores escolhem uma ação.`;
    case "move":
      return `${name(event.actor)} usou ${moveById(event.moveId)?.name ?? event.moveId}.`;
    case "damage":
      return `${name(event.target)} perdeu ${event.amount} HP.`;
    case "heal":
      return `${name(event.target)} recuperou ${event.amount} HP.`;
    case "critical":
      return "Acerto crítico!";
    case "super_effective":
      return `Super efetivo contra ${name(event.target)}!`;
    case "resisted":
      return `Pouco efetivo contra ${name(event.target)}.`;
    case "immune":
      return `${name(event.target)} é imune.`;
    case "miss":
      return `${name(event.actor)} errou o golpe.`;
    case "hit_count":
      return `${event.hits} hits em ${name(event.target)}.`;
    case "faint":
      return `${name(event.target)} foi nocauteado!`;
    case "switch":
      return `${speciesById(event.pokemon.speciesId)?.name ?? "Pokémon"} entrou em campo.`;
    case "status":
      return `${name(event.target)}: ${event.status ?? "status curado"}.`;
    case "boost":
      return `${name(event.target)}: ${event.stat.toUpperCase()} ${event.before} → ${event.after}.`;
    case "unable":
      return `${name(event.actor)} não agiu (${event.reason}).`;
    case "effect":
      return `${name(event.target)}: ${moveById(event.effectId ?? "")?.name ?? event.effectId ?? "efeito"} (${event.operation}).`;
    case "battle_end":
      return event.result.winner
        ? `${state.players[event.result.winner === "p1" ? 0 : 1].name} venceu!`
        : "Empate!";
    case "state_sync":
      return "";
  }
}
