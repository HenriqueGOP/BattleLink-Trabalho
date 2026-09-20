// server/src/protocol.ts
import { ClientMessage } from "./game/types";

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Campo "${field}" inválido.`);
  return value.trim();
}

export function parseClientMessage(raw: unknown): ClientMessage {
  if (!raw || typeof raw !== "object") throw new Error("Mensagem inválida.");
  const message = raw as Record<string, unknown>;
  switch (message.type) {
    case "join": return { type: "join", name: asString(message.name, "name").slice(0, 24) };
    case "leave": return { type: "leave" };
    case "choose_pokemon": return { type: "choose_pokemon", pokemon: asString(message.pokemon, "pokemon") };
    case "set_moves": {
      if (!Array.isArray(message.moves)) throw new Error('Campo "moves" deve ser uma lista.');
      return {
        type: "set_moves",
        pokemon: asString(message.pokemon, "pokemon"),
        moves: message.moves.map((move, index) => asString(move, `moves[${index}]`)),
      };
    }
    case "reset_team": return { type: "reset_team" };
    case "terastallize": return { type: "terastallize" };
    case "switch_pokemon": return { type: "switch_pokemon", pokemon: asString(message.pokemon, "pokemon") };
    case "action": {
      const action = message.action;
      if (!action || typeof action !== "object") throw new Error("Ação inválida.");
      const record = action as Record<string, unknown>;
      if (record.type !== "attack" && record.type !== "defend" && record.type !== "special") throw new Error("Ação inválida. Use attack, defend ou special.");
      const move = record.type === "attack" ? asString(record.move, "action.move") : undefined;
      return { type: "action", action: { type: record.type, move } };
    }
    default: throw new Error("Mensagem desconhecida. Tipos aceitos: join, leave, choose_pokemon, set_moves, terastallize, switch_pokemon, action.");
  }
}
