import data from "../data/battle-catalog.json";
import speciesData from "../data/species.json";
import moveData from "../data/moves.json";
import type { MoveData } from "../game/engine/battle-types";
import type {
  Boosts,
  MajorStatus,
  Stats,
  SupportedAbility,
  TypeId,
} from "../game/engine/types";

export interface SpeciesData {
  readonly id: string;
  readonly num: number;
  readonly name: string;
  readonly types: readonly TypeId[];
  readonly ability: SupportedAbility;
  readonly stats: Stats;
  readonly moveIds: readonly string[];
}
export type CatalogMove = MoveData & {
  readonly description: string;
  readonly target: string;
  readonly status?: MajorStatus;
  readonly volatile?: string;
  readonly boosts?: Boosts;
  readonly selfBoosts?: Boosts;
};
// O arquivo empacotado usa índices para não repetir nomes de golpes em 1025 learnsets.
export const catalog = {
  ...data,
  moves: moveData,
  species: speciesData.map(({ moveIndices, ...species }) => ({
    ...species,
    moveIds: moveIndices.map((index) => moveData[index].id),
  })),
} as unknown as {
  readonly version: string;
  readonly species: readonly SpeciesData[];
  readonly moves: readonly CatalogMove[];
};
const species = new Map(catalog.species.map((value) => [value.id, value]));
const moves = new Map(catalog.moves.map((value) => [value.id, value]));
export const speciesById = (id: string): SpeciesData | undefined =>
  species.get(id);
export const moveById = (id: string): CatalogMove | undefined => moves.get(id);

export function suggestedMoves(id: string): string[] {
  const pokemon = speciesById(id);
  if (!pokemon) return [];
  const available = pokemon.moveIds
    .map(moveById)
    .filter((move): move is CatalogMove => !!move?.support.supported);
  const score = (move: CatalogMove) =>
    move.category === "Status"
      ? 0
      : 100 +
        (pokemon.types.includes(move.type) ? 50 : 0) +
        Math.min(move.basePower, 100) +
        (move.accuracy === true ? 100 : move.accuracy) / 10;
  return available
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
    .slice(0, 4)
    .map((move) => move.id);
}
