import { PRNG } from "@pkmn/sim";
import type { RNG, RngSeed, RngSnapshot } from "../types";
import { integer, validateSeed } from "../validation";

function simulatorSeed(seed: RngSeed): ReturnType<typeof PRNG.convertSeed> {
  validateSeed(seed);
  return PRNG.convertSeed([...seed]);
}

export class ShowdownRng implements RNG {
  private readonly prng: PRNG;

  constructor(seed: RngSeed) {
    this.prng = new PRNG(simulatorSeed(seed));
  }

  nextUint32(): number {
    return this.prng.rng.next();
  }

  snapshot(): RngSnapshot {
    const state = this.prng.getSeed();
    if (!/^\d+,\d+,\d+,\d+$/.test(state)) throw new Error("Estado inesperado do PRNG do simulador.");
    const words = state.split(",").map(Number);
    const seed: RngSeed = [words[0], words[1], words[2], words[3]];
    validateSeed(seed);
    return Object.freeze({
      algorithm: "showdown-gen5",
      seed: Object.freeze(seed),
    });
  }
}

/** Adapter interno: toda chamada do simulador avança o RNG injetado. */
export function simulatorPrng(rng: RNG): PRNG {
  const prng = new PRNG(simulatorSeed(rng.snapshot().seed));
  prng.rng = {
    next: () => {
      const value = rng.nextUint32();
      integer(value, 0, 0xffffffff, "Saída do RNG");
      return value;
    },
    getSeed: () => simulatorSeed(rng.snapshot().seed),
  };
  return prng;
}
