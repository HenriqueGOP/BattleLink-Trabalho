import { validateFormat } from "./contracts/formats";
import { DIFFICULTIES, trainerById } from "./contracts/trainers";
import { PROTOCOL_VERSION } from "./contracts/protocol";
import type { ClientMessage } from "./contracts/protocol";

const SETUP_COMMANDS = new Set(["choose_pokemon", "remove_pokemon", "reorder_team", "random_team", "set_moves", "reset_team", "accept_team"]);

/** Echo only a safe setup identifier, even when the rest of the payload is rejected. */
export function readSetupEditId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const message = raw as Record<string, unknown>;
  if (typeof message.type !== "string" || !SETUP_COMMANDS.has(message.type)) return;
  const value = message.editId;
  if (typeof value !== "string" || value.length > 64 || !/^[A-Za-z0-9_-]+$/.test(value.trim())) return;
  return value.trim();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Mensagem ou ação inválida.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max = 64): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`Campo "${field}" inválido ou grande demais.`);
  return value.trim();
}
function id(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[a-z0-9]+$/.test(result))
    throw new Error(`Campo "${field}" deve ser um ID do catálogo.`);
  return result;
}
function integer(value: unknown, field: string, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new Error(`Campo "${field}" inválido.`);
  return value;
}
export function parseClientMessage(raw: unknown): ClientMessage {
  const message = record(raw);
  const editing = typeof message.type === "string" && SETUP_COMMANDS.has(message.type);
  const correlation = editing && message.editId !== undefined ? { editId: text(message.editId, "editId") } : {};
  if (correlation.editId && !/^[A-Za-z0-9_-]+$/.test(correlation.editId)) throw new Error("editId inválido.");
  const bound = editing || ["action", "battle_ready", "resync", "rematch"].includes(String(message.type));
  const match = bound ? { matchId: text(message.matchId, "matchId") } : {};
  const commandId = () => { const value = text(message.commandId, "commandId"); if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("commandId inválido."); return value; };
  switch (message.type) {
    case "queue_join":
    case "private_create": return { type: message.type, format: validateFormat(message.format), commandId: commandId() };
    case "queue_cancel":
    case "room_leave": return { type: message.type, ...match };
    case "private_join": {
      const code = text(message.code, "code", 16).toUpperCase().replace(/[ -]/g, "");
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error("Código de sala inválido.");
      return { type: "private_join", code, commandId: commandId() };
    }
    case "pve_start": {
      const trainerId = id(message.trainerId, "trainerId");
      if (!trainerById(trainerId) || !DIFFICULTIES.includes(message.difficulty as never)) throw new Error("Desafio inválido.");
      return { type: "pve_start", trainerId, difficulty: message.difficulty as "easy" | "normal" | "hard", format: validateFormat(message.format), commandId: commandId() };
    }
    case "rematch": {
      if (typeof message.accept !== "boolean" || typeof message.keepTeam !== "boolean") throw new Error("Resposta inválida.");
      return { type: "rematch", matchId: match.matchId!, accept: message.accept, keepTeam: message.keepTeam };
    }
    case "join": {
      if (message.protocol !== PROTOCOL_VERSION)
        throw new Error(
          "Protocolo incompatível. Atualize ambos os clientes e o servidor.",
        );
      const token =
        message.token === undefined
          ? undefined
          : text(message.token, "token", 256);
      return {
        type: "join",
        name: text(message.name, "name", 24),
        protocol: PROTOCOL_VERSION,
        catalogVersion: text(message.catalogVersion, "catalogVersion"),
        ...(token ? { token } : {}),
      };
    }
    case "leave":
    case "resync":
      return { type: message.type, ...match };
    case "accept_team":
    case "reset_team":
      return { type: message.type, ...correlation, ...match };
    case "choose_pokemon":
    case "remove_pokemon":
      return {
        type: message.type,
        pokemon: id(message.pokemon, "pokemon"),
        ...correlation, ...match,
      };
    case "reorder_team": {
      if (!Array.isArray(message.pokemon) || !message.pokemon.length || message.pokemon.length > 6) throw new Error("Ordem exige de um a seis IDs.");
      const pokemon = message.pokemon.map((value, index) => id(value, `pokemon[${index}]`));
      if (new Set(pokemon).size !== pokemon.length) throw new Error("Não repita Pokémon.");
      return { type: "reorder_team", pokemon, ...correlation, ...match };
    }
    case "random_team":
      return { type: "random_team", count: integer(message.count, "count", 6), ...correlation, ...match };
    case "set_moves": {
      if (
        !Array.isArray(message.moves) ||
        !message.moves.length ||
        message.moves.length > 4
      )
        throw new Error('Campo "moves" exige de um a quatro IDs.');
      const moves = message.moves.map((move, i) => id(move, `moves[${i}]`));
      if (new Set(moves).size !== moves.length)
        throw new Error("Não repita golpes.");
      return {
        type: "set_moves",
        pokemon: id(message.pokemon, "pokemon"),
        moves,
        ...correlation, ...match,
      };
    }
    case "battle_ready":
      return {
        type: "battle_ready",
        ...match,
        preparationId: text(message.preparationId, "preparationId"),
      };
    case "action": {
      const requestId = integer(
        message.requestId,
        "requestId",
        Number.MAX_SAFE_INTEGER,
      );
      const actionId = text(message.actionId, "actionId");
      if (!/^[A-Za-z0-9_-]+$/.test(actionId))
        throw new Error("actionId inválido.");
      const choice = record(message.choice);
      if (choice.type === "move")
        return {
          type: "action",
          ...match,
          requestId,
          actionId,
          choice: { type: "move", moveId: id(choice.moveId, "choice.moveId") },
        };
      if (
        choice.type === "switch" &&
        typeof choice.combatantId === "string" &&
        /^p[12]s[0-5]$/.test(choice.combatantId)
      ) {
        return {
          type: "action",
          ...match,
          requestId,
          actionId,
          choice: {
            type: "switch",
            combatantId: choice.combatantId as `p${1 | 2}s${number}`,
          },
        };
      }
      throw new Error("Ação inválida. Escolha golpe ou troca.");
    }
    default:
      throw new Error(
        "Mensagem desconhecida ou incompatível com pokemon-battle/4.",
      );
  }
}
