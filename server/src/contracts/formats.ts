import { TYPE_IDS, type TypeId } from "../game/engine/types";

export type FormatId = "classic" | "quick" | "monotype";
export interface FormatChoice { readonly id: FormatId; readonly type?: TypeId }
export const FORMATS = Object.freeze([
  { id: "classic", name: "Clássico", teamSize: 6, description: "Seis parceiros. Uma estratégia completa." },
  { id: "quick", name: "Duelo rápido", teamSize: 3, description: "Três parceiros para uma batalha ágil." },
  { id: "monotype", name: "Monotipo", teamSize: 6, description: "Seis Pokémon unidos por um tipo." },
] as const);
export function validateFormat(value: unknown): FormatChoice {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formato inválido.");
  const input = value as Record<string, unknown>;
  if (!FORMATS.some(format => format.id === input.id)) throw new Error("Formato desconhecido.");
  if (input.id === "monotype") {
    if (!TYPE_IDS.includes(input.type as TypeId)) throw new Error("Escolha o tipo do desafio.");
    return Object.freeze({ id: "monotype", type: input.type as TypeId });
  }
  if (input.type !== undefined) throw new Error("Este formato não usa tipo temático.");
  return Object.freeze({ id: input.id as FormatId });
}
export const formatSize = (format: FormatChoice): 3 | 6 => format.id === "quick" ? 3 : 6;
export const formatKey = (format: FormatChoice): string => `${format.id}:${format.type ?? ""}`;
