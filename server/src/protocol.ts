import { ClientMessage, PlayerAction } from "./game/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAction = (value: unknown): value is PlayerAction => {
  if (!isRecord(value) || !["attack", "defend", "special"].includes(String(value.type))) return false;
  return value.move === undefined || typeof value.move === "string";
};

export function parseClientMessage(value: unknown): ClientMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("A mensagem precisa possuir um campo type.");
  }

  switch (value.type) {
    case "join":
      if (typeof value.name !== "string") throw new Error("join exige o campo name.");
      return { type: "join", name: value.name };
    case "choose_pokemon":
      if (typeof value.pokemon !== "string") throw new Error("choose_pokemon exige pokemon.");
      return { type: "choose_pokemon", pokemon: value.pokemon };
    case "action":
      if (!isAction(value.action)) throw new Error("action exige uma ação válida.");
      return { type: "action", action: value.action };
    case "leave":
      return { type: "leave" };
    default:
      throw new Error(`Tipo de mensagem desconhecido: ${value.type}`);
  }
}