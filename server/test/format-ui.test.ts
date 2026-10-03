import assert from "node:assert/strict";
import {
  categoryLabel,
  formatPokemonName,
  matchesPokemonSearch,
  normalizeSearch,
  typeLabel,
} from "../../client/src/lib/format";
import { catalog, speciesById } from "../src/contracts/catalog";

/** Isolated UI helpers: no browser, sockets, storage or game state. */
export function runFormatUiTests(): void {
  for (const [id, displayName] of [
    ["pikachu", "Pikachu"],
    ["mrmime", "Mr. Mime"],
    ["hooh", "Ho-Oh"],
    ["farfetchd", "Farfetch’d"],
    ["flabebe", "Flabébé"],
    ["nidoranf", "Nidoran-F"],
  ]) {
    assert.equal(
      formatPokemonName(id).normalize("NFC"),
      displayName,
      `Canonical display name: ${id}`,
    );
  }
  assert.equal(formatPokemonName("unknown-form"), "Unknown Form");
  assert.equal(formatPokemonName("éclair_form"), "Éclair Form");
  assert.equal(formatPokemonName("pokémon_áureo"), "Pokémon Áureo");
  assert.equal(formatPokemonName(""), "");

  assert.equal(
    normalizeSearch("  São-Paulo, Pokémon #0025!  "),
    "saopaulopokemon0025",
  );
  assert.equal(
    normalizeSearch("É ê Ã ç à í ó ü"),
    "eeaca iou".replaceAll(" ", ""),
  );
  assert.equal(normalizeSearch("Flabébé"), "flabebe");
  assert.equal(normalizeSearch("Flabébé".normalize("NFD")), "flabebe");
  assert.equal(normalizeSearch("Mr. Mime / Farfetch’d"), "mrmimefarfetchd");
  assert.equal(normalizeSearch("#1025"), "1025");
  assert.equal(normalizeSearch(""), "");

  const pikachu = Object.freeze({ id: 25, name: "pikachu" });
  const flabebe = Object.freeze({ id: 669, name: "flabebe" });
  for (const query of [
    "PIKACHU",
    "Píkáchu",
    "pika",
    "25",
    "025",
    "#025",
    "# 00025",
    "",
  ]) {
    assert.equal(
      matchesPokemonSearch(pikachu, query),
      true,
      `Query should match: ${query}`,
    );
  }
  for (const query of ["flabébé", "FLABEBE", "Flabébé".normalize("NFD")]) {
    assert.equal(matchesPokemonSearch(flabebe, query), true);
  }
  assert.equal(
    matchesPokemonSearch({ id: 122, name: "mrmime" }, "Mr. Mime"),
    true,
  );
  assert.equal(
    matchesPokemonSearch({ id: 83, name: "farfetchd" }, "Farfetch’d"),
    true,
  );
  assert.equal(
    matchesPokemonSearch({ id: 1025, name: "pecharunt" }, "#1025"),
    true,
  );
  assert.equal(
    matchesPokemonSearch({ id: 233, name: "porygon2" }, "Porygon 2"),
    true,
  );
  assert.equal(matchesPokemonSearch(pikachu, "26"), false);
  assert.equal(matchesPokemonSearch(pikachu, "#250"), false);
  assert.equal(
    matchesPokemonSearch({ id: 125, name: "electabuzz" }, "#025"),
    false,
  );
  assert.equal(matchesPokemonSearch({ id: 233, name: "porygon2" }, "2"), false);
  assert.equal(matchesPokemonSearch(flabebe, "pikachu"), false);

  const expectedTypes = {
    normal: "Normal",
    fire: "Fogo",
    water: "Água",
    electric: "Elétrico",
    grass: "Planta",
    ice: "Gelo",
    fighting: "Lutador",
    poison: "Veneno",
    ground: "Terra",
    flying: "Voador",
    psychic: "Psíquico",
    bug: "Inseto",
    rock: "Pedra",
    ghost: "Fantasma",
    dragon: "Dragão",
    dark: "Sombrio",
    steel: "Aço",
    fairy: "Fada",
    stellar: "Estelar",
  };
  for (const [type, label] of Object.entries(expectedTypes)) {
    assert.equal(typeLabel(type), label);
    assert.equal(typeLabel(type.toUpperCase()), label);
  }
  assert.equal(typeLabel("tipo futuro"), "tipo futuro");
  assert.equal(categoryLabel("physical"), "Físico");
  assert.equal(categoryLabel("Physical"), "Físico");
  assert.equal(categoryLabel("SPECIAL"), "Especial");
  assert.equal(categoryLabel("status"), "Status");
  assert.equal(categoryLabel(null), "—");
  assert.equal(categoryLabel(undefined), "—");
  assert.equal(categoryLabel("future"), "—");

  // Display/search results do not replace the IDs used by choose_pokemon.
  assert.deepEqual(pikachu, { id: 25, name: "pikachu" });
  assert.deepEqual(flabebe, { id: 669, name: "flabebe" });
  for (const species of catalog.species) {
    const before = JSON.stringify(species);
    const canonicalId = species.id;
    assert.equal(formatPokemonName(canonicalId), species.name);
    assert.equal(
      matchesPokemonSearch({ id: species.num, name: canonicalId }, canonicalId),
      true,
    );
    assert.equal(species.id, canonicalId);
    assert.equal(speciesById(canonicalId), species);
    assert.equal(
      JSON.stringify(species),
      before,
      `Catalog remains intact: ${canonicalId}`,
    );
  }
  console.log(
    "Formatação UI: nomes, acentos, busca, categorias e IDs intactos passaram.",
  );
}

runFormatUiTests();
