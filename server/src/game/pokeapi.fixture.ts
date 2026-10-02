// server/src/game/pokeapi.fixture.ts
import { setPokeApiTransport, PokeApiTransport } from "./pokeapi";

/**
 * Fixture offline da PokeAPI para os testes.
 *
 * Antes, domain.test.ts fazia 12 chamadas HTTP reais a pokeapi.co. Isso deixava
 * a suite dependente de internet, sujeita ao rate limit da API e vermelha em
 * qualquer CI sem saida externa. Aqui o mesmo formato de payload e servido de
 * memoria, entao o teste e deterministico e roda offline.
 */

export const FIXTURE_NAMES = [
  "charizard",
  "blastoise",
  "venusaur",
  "pikachu",
  "snorlax",
  "gyarados",
  "gengar",
  "machamp",
  "lapras",
  "eevee",
  "dragonite",
  "mewtwo",
];

/** Golpes servidos a todos: um fisico com PP, um de status. Ids reais do Showdown. */
const MOVE_NAMES = ["tackle", "body-slam", "growl", "quick-attack"];

function pokemonPayload(name: string, index: number) {
  return {
    id: index + 1,
    name,
    types: [{ type: { name: "normal" } }],
    abilities: [{ ability: { name: "run-away" } }],
    sprites: {
      front_default: `https://sprites.test/${name}-front.png`,
      back_default: `https://sprites.test/${name}-back.png`,
      front_shiny: `https://sprites.test/${name}-shiny.png`,
      back_shiny: `https://sprites.test/${name}-shiny-back.png`,
      other: {},
    },
    cries: { latest: null, legacy: null },
    stats: [
      { base_stat: 80, stat: { name: "hp" } },
      { base_stat: 90, stat: { name: "attack" } },
      { base_stat: 70, stat: { name: "defense" } },
      { base_stat: 85, stat: { name: "special-attack" } },
      { base_stat: 75, stat: { name: "special-defense" } },
      // velocidade decrescente: torna a ordem do primeiro turno deterministica
      { base_stat: 120 - index, stat: { name: "speed" } },
    ],
    moves: MOVE_NAMES.map((move) => ({
      move: { name: move },
      version_group_details: [
        {
          version_group: { name: "scarlet-violet" },
          move_learn_method: { name: "level-up" },
          level_learned_at: 5,
        },
      ],
    })),
  };
}

/** Liga o fixture. Chame no inicio do teste; `setPokeApiTransport(null)` desliga. */
export const fixturePokeApiTransport: PokeApiTransport = async (url) => {
  if (url.includes("/pokemon?limit=")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: FIXTURE_NAMES.map((name) => ({ name })) }),
    };
  }
  const match = url.match(/\/pokemon\/([a-z0-9-]+)$/);
  const index = match ? FIXTURE_NAMES.indexOf(match[1]) : -1;
  if (index >= 0) {
    return { ok: true, status: 200, json: async () => pokemonPayload(FIXTURE_NAMES[index], index) };
  }
  return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
};

export function installPokeApiFixture(): void {
  setPokeApiTransport(fixturePokeApiTransport);
}
