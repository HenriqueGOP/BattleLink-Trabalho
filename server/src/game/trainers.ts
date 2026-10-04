import { catalog, moveById, speciesById, suggestedMoves } from "../contracts/catalog";
import { formatSize, type FormatChoice } from "../contracts/formats";
import { trainerById } from "../contracts/trainers";
import type { TeamSet } from "./engine";

const rosters: Record<string, readonly [readonly string[], readonly string[], readonly string[]]> = {
  vespera: [["spiritomb", "umbreon", "grimmsnarl"], ["chandelure", "corviknight", "mimikyu"], ["houndoom", "weavile", "zoroark"]],
  mare: [["milotic", "lapras", "lanturn"], ["gardevoir", "roserade", "altaria"], ["starmie", "gastrodon", "pelipper"]],
  teo: [["ampharos", "magnezone", "rotom"], ["porygonz", "klinklang", "noivern"], ["luxray", "galvantula", "electivire"]],
  brasa: [["blaziken", "arcanine", "talonflame"], ["lucario", "hitmontop", "krookodile"], ["chandelure", "torkoal", "magmortar"]],
  nina: [["mimikyu", "gengar", "drifblim"], ["wigglytuff", "espeon", "meowstic"], ["chandelure", "banette", "dusknoir"]],
  flora: [["leavanny", "roserade", "tsareena"], ["ribombee", "flygon", "ampharos"], ["breloom", "tangrowth", "decidueye"]],
  nival: [["frosmoth", "glaceon", "cryogonal"], ["reuniclus", "bronzong", "kingdra"], ["mamoswine", "weavile", "walrein"]],
  rixa: [["toxicroak", "toxtricity", "crobat"], ["scrafty", "obstagoon", "bisharp"], ["roserade", "drapion", "tentacruel"]],
  aren: [["lycanroc", "gigalith", "rhyperior"], ["excadrill", "braviary", "lucario"], ["tyranitar", "aerodactyl", "crustle"]],
  lia: [["altaria", "noivern", "staraptor"], ["heliolisk", "mienshao", "espeon"], ["corviknight", "braviary", "talonflame"]],
  bento: [["aggron", "copperajah", "metagross"], ["mudsdale", "conkeldurr", "snorlax"], ["magnezone", "klinklang", "steelix"]],
};
// Fixa o loadout na inicialização; nunca consulta rede ou RNG da partida.
const builds = new Map<string, TeamSet>();
for (const id of new Set(Object.values(rosters).flatMap(groups => groups.flat()))) {
  const species = speciesById(id)!;
  const legal = species.moveIds.map(moveById).filter(move => move?.support.supported && move.id !== "struggle");
  const attacks = suggestedMoves(id).filter(id => moveById(id)?.category !== "Status");
  const utility = legal.filter(move => move && move.category === "Status" && (move.heal || move.status || move.boosts || move.selfBoosts))
    .sort((a, b) => Number(!!b?.heal) - Number(!!a?.heal) || a!.id.localeCompare(b!.id))[0];
  const chosen = [...attacks.slice(0, utility ? 3 : 4), ...(utility ? [utility.id] : [])];
  for (const move of legal) if (chosen.length < 4 && move && !chosen.includes(move.id)) chosen.push(move.id);
  if (chosen.length !== 4) throw new Error(`Loadout incompleto: ${id}`);
  builds.set(id, Object.freeze({ speciesId: id, moves: Object.freeze(chosen) }));
}
export function trainerTeam(id: string, format: FormatChoice): readonly TeamSet[] {
  const trainer = trainerById(id), roster = rosters[id];
  if (!trainer || !roster) throw new Error("Treinador desconhecido.");
  if (format.id === "monotype" && format.type !== trainer.type) throw new Error("Tipo incompatível com este treinador.");
  const ids = formatSize(format) === 3 ? roster[0] : [...roster[0], ...roster[format.id === "monotype" ? 2 : 1]];
  return ids.map(id => builds.get(id)!);
}
export const trainerCatalogVersion = `trainers-1:${catalog.version}`;
