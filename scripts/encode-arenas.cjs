// Encode original arena art without resizing or retouching it.
// Usage: SHARP_MODULE=<absolute module path> node scripts/encode-arenas.cjs forest=<source.png> ...
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sharp = require(process.env.SHARP_MODULE || "sharp");
const ids = new Set([
  "forest",
  "stadium",
  "cave",
  "beach",
  "space",
  "night-city",
]);
const hash = (data) => createHash("sha256").update(data).digest("hex");

async function main() {
  const directory = path.resolve(__dirname, "../client/public/arenas");
  const manifestPath = path.join(directory, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  for (const argument of process.argv.slice(2)) {
    const split = argument.indexOf("=");
    const id = argument.slice(0, split);
    if (split < 1 || !ids.has(id)) throw new Error("Unknown arena identifier");
    const source = await fs.readFile(argument.slice(split + 1));
    const { width, height } = await sharp(source).metadata();
    const output = await sharp(source)
      .webp({ quality: 82, effort: 6 })
      .toBuffer();
    if (output.length > 600 * 1024)
      throw new Error(`${id} exceeds the arena budget`);
    const fallback = manifest[id]?.fallback ?? manifest[id];
    await fs.writeFile(path.join(directory, `${id}.webp`), output);
    manifest[id] = {
      path: `/arenas/${id}.webp`,
      bytes: output.length,
      sha256: hash(output),
      width,
      height,
      origin: "original-imagegen-art",
      license: "project-original-generated-art",
      sourceSha256: hash(source),
      prompt: "docs/art-prompts/arena-refresh.json",
      encoding: "WebP quality 82; original dimensions",
      fallback,
    };
    process.stdout.write(`${id}: ${width}×${height}, ${output.length} bytes\n`);
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
