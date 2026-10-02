import { PROTOCOL_VERSION } from "./contracts/protocol";
import type { ClientMessage } from "./contracts/protocol";

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
  switch (message.type) {
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
    case "accept_team":
    case "reset_team":
    case "resync":
      return { type: message.type };
    case "choose_pokemon":
      return {
        type: "choose_pokemon",
        pokemon: id(message.pokemon, "pokemon"),
      };
    case "random_team":
      return { type: "random_team", count: integer(message.count, "count", 6) };
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
      };
    }
    case "battle_ready":
      return {
        type: "battle_ready",
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
        "Mensagem desconhecida ou incompatível com pokemon-battle/3.",
      );
  }
}
