/** Development contact sheet, rendered from the exact shipped SVG paths. */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require(process.env.BATTLELINK_SHARP || "sharp");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "client/src/components/MoveIdentity/moveTypeGlyphs.ts"),
  "utf8",
);
const tokens = fs.readFileSync(
  path.join(root, "client/src/styles/tokens.css"),
  "utf8",
);
const glyphs = [...source.matchAll(/^  (\w+):\s*'([^']+)'/gm)];
if (glyphs.length !== 18) throw new Error('The contact sheet must render all 18 type glyphs.');
const labels = {
  normal: "Normal",
  fire: "Fogo",
  water: "Água",
  grass: "Planta",
  electric: "Elétrico",
  ice: "Gelo",
  fighting: "Lutador",
  flying: "Voador",
  poison: "Veneno",
  ground: "Terrestre",
  rock: "Pedra",
  bug: "Inseto",
  ghost: "Fantasma",
  steel: "Aço",
  psychic: "Psíquico",
  dragon: "Dragão",
  dark: "Sombrio",
  fairy: "Fada",
};
const cells = glyphs.map(([, type, glyph], index) => {
  const color = tokens.match(new RegExp(`--type-${type}: (#[0-9a-f]+)`))[1];
  const components = [1, 3, 5].map((offset) =>
    Math.round(
      parseInt(color.slice(offset, offset + 2), 16) * 0.72 + 255 * 0.28,
    ),
  );
  const fill = `rgb(${components.join(",")})`;
  const x = 20 + (index % 6) * 148,
    y = 66 + Math.floor(index / 6) * 130;
  return `<g transform="translate(${x} ${y})"><rect width="132" height="112" rx="10" fill="#0b263d"/><rect width="3" height="112" rx="1.5" fill="${color}"/><g transform="translate(42 14) scale(2)"><path d="${glyph}" fill="${fill}" fill-rule="evenodd"/></g><text x="66" y="92" fill="#f3f8ff" text-anchor="middle" font-family="Arial,sans-serif" font-size="14">${labels[type]}</text></g>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="466"><rect width="920" height="466" fill="#071a2d"/><text x="20" y="36" fill="#f3f8ff" font-family="Arial,sans-serif" font-size="23" font-weight="700">Battle Link · 18 símbolos de golpe</text>${cells.join("")}</svg>`;
const output = path.join(root, "docs/evidence/frontend-polish/type-icons.png");
fs.mkdirSync(path.dirname(output), { recursive: true });
sharp(Buffer.from(svg))
  .png()
  .toFile(output)
  .then(() => console.log(output));
