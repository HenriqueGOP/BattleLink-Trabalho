import { createHash } from "node:crypto";
import { ShowdownRng } from "./adapters/showdown-rng";
import type { RNG, RngSeed, RngSnapshot } from "./types";
import { integer, validateSeed } from "./validation";

export function createRng(seed: RngSeed): RNG {
  return new ShowdownRng(seed);
}

export function restoreRng(snapshot: RngSnapshot): RNG {
  if (snapshot.algorithm !== "showdown-gen5") throw new RangeError("Algoritmo de RNG não suportado.");
  return createRng(snapshot.seed);
}

/** Domínios independentes; derivar não consome nenhum fluxo. Não gera entropia. */
export function createBattleRngs(seed: RngSeed): Readonly<{ combat: RNG; teams: RNG; presentation: RNG }> {
  validateSeed(seed);
  const derive = (domain: string): RNG => {
    const hash = createHash("sha256").update(`pokemon-battle/rng/v1:${domain}:${seed.join(",")}`).digest();
    return createRng([hash.readUInt16BE(0), hash.readUInt16BE(2), hash.readUInt16BE(4), hash.readUInt16BE(6)]);
  };
  return Object.freeze({ combat: derive("combat"), teams: derive("teams"), presentation: derive("presentation") });
}

export function randomInt(rng: RNG, min: number, maxExclusive: number): number {
  integer(min, -0x80000000, 0x7fffffff, "Limite inferior");
  integer(maxExclusive, min + 1, 0x100000000, "Limite superior exclusivo");
  if (maxExclusive - min > 0x100000000) throw new RangeError("Intervalo excede a resolução de 32 bits do RNG.");
  const value = rng.nextUint32();
  integer(value, 0, 0xffffffff, "Saída do RNG");
  return min + Math.floor((value / 0x100000000) * (maxExclusive - min));
}

export function randomChance(rng: RNG, numerator: number, denominator: number): boolean {
  integer(denominator, 1, 0x100000000, "Denominador");
  integer(numerator, 0, denominator, "Numerador");
  return randomInt(rng, 0, denominator) < numerator;
}
