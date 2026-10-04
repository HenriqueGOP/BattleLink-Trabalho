import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TRAINERS } from "./contracts/trainers";
import { trainerAssets, TRAINER_POSES } from "../../client/src/lib/trainerAssets";
import { MENU_ART } from "../../client/src/lib/menuAssets";
import { TYPE_IDS } from "./game/engine/types";
import manifest from "../../client/public/trainers/manifest.json";

async function run() {
  assert.equal(trainerAssets("../../outside"), undefined);
  assert.equal(trainerAssets(null), undefined);
  assert.equal(Object.keys(manifest.trainers).length, 11);
  for (const trainer of TRAINERS) {
    const metadata = manifest.trainers[trainer.id as keyof typeof manifest.trainers] as unknown as Record<string, { bytes: number; width: number; height: number; columns: number; rows: number; frameWidth: number; frameHeight: number; foot: number[]; bounds: number[][]; poses: string[]; framesPerState: number }>;
    const paths = trainerAssets(trainer.id)!;
    assert.deepEqual(metadata.atlas.foot, [80, 194]);
    assert.equal(metadata.atlas.frameWidth * metadata.atlas.columns, metadata.atlas.width);
    assert.equal(metadata.atlas.frameHeight * metadata.atlas.rows, metadata.atlas.height);
    assert.deepEqual(metadata.atlas.poses, ["idle", "throw"]);
    for (const [x, y, width, height] of metadata.atlas.bounds) assert.ok(x >= 0 && y >= 0 && x + width <= 160 && y + height === 194);
    assert.deepEqual(metadata.motion.poses, TRAINER_POSES);
    assert.equal(metadata.motion.framesPerState, 2);
    assert.equal(metadata.motion.bounds.length, 12);
    assert.equal(metadata.motion.width, 960);
    assert.equal(metadata.motion.height, 400);
    assert.deepEqual(metadata.motion.foot, [80, 194]);
    for (const [x, y, width, height] of metadata.motion.bounds) assert.ok(x >= 0 && y >= 0 && x + width <= 160 && y + height === 194);
    for (const kind of ["art", "portrait", "atlas", "splash", "motion"] as const) {
      assert.match(paths[kind], /^\/trainers\/[a-z]+\/[a-z]+\.webp$/);
      const bytes = await readFile(resolve(__dirname, "../../client/public", `.${paths[kind]}`));
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert.equal(bytes.length, metadata[kind].bytes);
      assert.ok(bytes.length <= (kind === "atlas" || kind === "motion" ? 150 : 350) * 1024);
      // VP8X's alpha flag or lossless VP8L's alpha bit: generated alpha is retained.
      const tag = bytes.toString("ascii", 12, 16);
      assert.ok(tag === "VP8X" ? Boolean(bytes[20] & 0x10) : tag === "VP8L" && Boolean(bytes[24] & 0x10), `${trainer.id}/${kind}: alpha channel`);
    }
  }
  const interfaceManifest = JSON.parse(await readFile(resolve(__dirname, '../../client/public/interface/manifest.json'), 'utf8')) as {assets: Record<string, {bytes: number; path: string; alpha: boolean}>};
  const menuFiles = Object.values(MENU_ART).flat();
  assert.equal(menuFiles.length, 24);
  assert.equal(new Set(menuFiles).size, 24, 'Every menu owns two distinct images');
  for (const name of [...menuFiles, 'logo', ...TYPE_IDS.map(id => `type-${id}`)]) {
    const asset = interfaceManifest.assets[name];
    assert.ok(asset, name);
    const bytes = await readFile(resolve(__dirname, '../../client/public', `.${asset.path}`));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    if (name.startsWith('type-')) assert.ok(asset.alpha, name);
  }
  const moveCss = await readFile(resolve(__dirname, '../../client/src/components/MoveIdentity/MoveIdentity.module.css'), 'utf8');
  for (const type of TYPE_IDS) assert.ok(moveCss.includes(`/interface/type-${type}.webp`));
  assert.ok(!moveCss.includes('gradient'), 'Move ornaments come from raster images');
  console.log("Trainer/interface assets passed: 55 transparent trainer files, 11 aligned six-state/two-frame atlases, 24 exclusive menu images and 18 type ornaments; whitelist and budgets.");
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
