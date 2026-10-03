import { simulatorStats } from "./adapters/showdown";
import type { StatBuild, Stats } from "./types";
import { integer, validateBuild } from "./validation";

export function calculateStats(speciesId: string, build: StatBuild = {}): Stats {
  validateBuild(build);
  return simulatorStats(speciesId, build);
}

export function stageMultiplier(stage: number): number {
  integer(stage, -6, 6, "Estágio");
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function accuracyMultiplier(stage: number): number {
  integer(stage, -6, 6, "Estágio de precisão/evasão");
  return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
}
