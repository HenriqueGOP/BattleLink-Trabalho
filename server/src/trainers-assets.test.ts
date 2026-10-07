import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TRAINERS } from "./contracts/trainers";
import {
  trainerAssets,
  TRAINER_POSES,
  TRAINER_FRAME,
} from "../../client/src/lib/trainerAssets";
import { MENU_ART } from "../../client/src/lib/menuAssets";
import { TYPE_IDS } from "./game/engine/types";
import manifest from "../../client/public/trainers/manifest.json";
import {
  MOVE_TYPE_GLYPHS,
  moveTypeGlyph,
} from "../../client/src/components/MoveIdentity/moveTypeGlyphs";

interface RasterMetadata {
  bytes: number;
  width: number;
  height: number;
  path?: string;
  alpha?: boolean;
  sha256?: string;
  source?: string;
}
interface AtlasMetadata extends RasterMetadata {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  foot: number[];
  bounds: number[][];
  poses: string[];
  framesPerState?: number;
  frameHashes?: string[];
}
type TrainerMetadata = Record<
  "art" | "portrait" | "splash" | "background",
  RasterMetadata
> & {
  atlas: AtlasMetadata;
  motion: AtlasMetadata;
};

/** Read encoded dimensions/alpha independently of the JSON declarations. */
function webpMetadata(bytes: Buffer) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(
    bytes.readUInt32LE(4) + 8,
    bytes.length,
    "RIFF payload is complete",
  );
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    assert.ok(data + size <= bytes.length, "WebP chunk is complete");
    if (kind === "VP8X")
      return {
        width: bytes.readUIntLE(data + 4, 3) + 1,
        height: bytes.readUIntLE(data + 7, 3) + 1,
        alpha: Boolean(bytes[data] & 0x10),
      };
    if (kind === "VP8L") {
      assert.equal(bytes[data], 0x2f);
      const packed = bytes.readUInt32LE(data + 1);
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
        alpha: Boolean((packed >>> 28) & 1),
      };
    }
    if (kind === "VP8 ")
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
        alpha: false,
      };
    offset = data + size + (size & 1);
  }
  assert.fail("WebP has no supported image chunk");
}

async function run() {
  assert.equal(trainerAssets("../../outside"), undefined);
  assert.equal(trainerAssets(null), undefined);
  assert.equal(Object.keys(manifest.trainers).length, 11);
  const backgroundHashes = new Set<string>();
  const motionHashes = new Set<string>();
  for (const trainer of TRAINERS) {
    const metadata = manifest.trainers[
      trainer.id as keyof typeof manifest.trainers
    ] as unknown as TrainerMetadata;
    const paths = trainerAssets(trainer.id)!;
    assert.deepEqual(metadata.atlas.foot, [80, 194]);
    assert.equal(
      metadata.atlas.frameWidth * metadata.atlas.columns,
      metadata.atlas.width,
    );
    assert.equal(
      metadata.atlas.frameHeight * metadata.atlas.rows,
      metadata.atlas.height,
    );
    assert.deepEqual(metadata.atlas.poses, ["idle", "throw"]);
    for (const [x, y, width, height] of metadata.atlas.bounds)
      assert.ok(x >= 0 && y >= 0 && x + width <= 160 && y + height === 194);
    assert.deepEqual(metadata.motion.poses, TRAINER_POSES);
    assert.equal(metadata.motion.framesPerState, 6);
    assert.equal(metadata.motion.columns, TRAINER_FRAME.columns);
    assert.equal(metadata.motion.rows, TRAINER_FRAME.rows);
    assert.equal(metadata.motion.frameWidth, TRAINER_FRAME.width);
    assert.equal(metadata.motion.frameHeight, TRAINER_FRAME.height);
    assert.equal(metadata.motion.bounds.length, 36);
    assert.equal(metadata.motion.width, 960);
    assert.equal(metadata.motion.height, 1200);
    assert.deepEqual(metadata.motion.foot, [80, 194]);
    for (const [x, y, width, height] of metadata.motion.bounds)
      assert.ok(
        x >= 0 &&
          y >= 0 &&
          width > 0 &&
          height > 0 &&
          x + width <= 160 &&
          y + height === 194,
        `${trainer.id}: all 36 visible silhouettes share the foot baseline`,
      );
    const hashes = metadata.motion.frameHashes;
    assert.ok(
      hashes && hashes.length === 36,
      `${trainer.id}: decoded/cropped frame hashes cover every atlas cell`,
    );
    for (const hash of hashes) assert.match(hash, /^[0-9a-f]{64}$/);
    for (let row = 0; row < TRAINER_POSES.length; row++)
      assert.equal(
        new Set(hashes.slice(row * 6, (row + 1) * 6)).size,
        6,
        `${trainer.id}/${TRAINER_POSES[row]}: six distinct drawings after cropping translation offsets`,
      );
    assert.match(metadata.motion.sha256!, /^[0-9a-f]{64}$/);
    assert.equal(metadata.background.path, paths.background);
    assert.equal(metadata.background.width, 1600);
    assert.equal(metadata.background.height, 900);
    assert.equal(metadata.background.alpha, false);
    assert.equal(
      metadata.background.source,
      `docs/art-sources/trainer-backgrounds/${trainer.id}.png`,
    );
    for (const kind of [
      "art",
      "portrait",
      "atlas",
      "splash",
      "motion",
      "background",
    ] as const) {
      assert.match(paths[kind], /^\/trainers\/[a-z]+\/[a-z]+\.webp$/);
      const bytes = await readFile(
        resolve(__dirname, "../../client/public", `.${paths[kind]}`),
      );
      const actual = webpMetadata(bytes);
      assert.equal(
        actual.width,
        metadata[kind].width,
        `${trainer.id}/${kind}: encoded width`,
      );
      assert.equal(
        actual.height,
        metadata[kind].height,
        `${trainer.id}/${kind}: encoded height`,
      );
      assert.equal(bytes.length, metadata[kind].bytes);
      assert.ok(
        bytes.length <=
          (kind === "atlas" || kind === "motion" ? 150 : 350) * 1024,
      );
      assert.equal(
        actual.alpha,
        kind !== "background",
        `${trainer.id}/${kind}: transparent figure or opaque environment`,
      );
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (metadata[kind].sha256)
        assert.equal(
          hash,
          metadata[kind].sha256,
          `${trainer.id}/${kind}: packaged bytes match the audited manifest`,
        );
      if (kind === "motion") motionHashes.add(hash);
      if (kind === "background") backgroundHashes.add(hash);
    }
  }
  assert.equal(
    motionHashes.size,
    11,
    "Every trainer owns a different motion atlas",
  );
  assert.equal(
    backgroundHashes.size,
    11,
    "Every boss owns a different image, not an alias to a common background",
  );
  const interfaceManifest = JSON.parse(
    await readFile(
      resolve(__dirname, "../../client/public/interface/manifest.json"),
      "utf8",
    ),
  ) as {
    assets: Record<string, { bytes: number; path: string; alpha: boolean }>;
  };
  const menuFiles = Object.values(MENU_ART).flat();
  assert.equal(menuFiles.length, 24);
  assert.equal(
    new Set(menuFiles).size,
    24,
    "Every menu owns two distinct images",
  );
  const menuHashes = new Map<string, string>();
  for (const name of [...menuFiles, "logo"]) {
    const asset = interfaceManifest.assets[name];
    assert.ok(asset, name);
    const bytes = await readFile(
      resolve(__dirname, "../../client/public", `.${asset.path}`),
    );
    assert.equal(bytes.length, asset.bytes);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    menuHashes.set(name, createHash("sha256").update(bytes).digest("hex"));
  }
  assert.notEqual(
    menuHashes.get(MENU_ART.quick[0]),
    menuHashes.get(MENU_ART.friends[0]),
    "Quick and friends actually load different background bytes",
  );
  const moveCss = await readFile(
    resolve(
      __dirname,
      "../../client/src/components/MoveIdentity/MoveIdentity.module.css",
    ),
    "utf8",
  );
  assert.deepEqual(Object.keys(MOVE_TYPE_GLYPHS).sort(), [...TYPE_IDS].sort());
  assert.equal(
    new Set(Object.values(MOVE_TYPE_GLYPHS)).size,
    18,
    "All 18 attack types have distinct crisp SVG silhouettes",
  );
  for (const type of TYPE_IDS)
    assert.equal(moveTypeGlyph(type), MOVE_TYPE_GLYPHS[type]);
  for (const invalid of ["__proto__", "constructor", "unknown"])
    assert.equal(moveTypeGlyph(invalid), MOVE_TYPE_GLYPHS.normal);
  assert.ok(
    !moveCss.includes("/interface/type-"),
    "Attack buttons no longer load the raster frames with internal outlines",
  );
  const iconComponent = await readFile(
    resolve(
      __dirname,
      "../../client/src/components/MoveIdentity/MoveTypeIcon.tsx",
    ),
    "utf8",
  );
  assert.ok(
    iconComponent.includes('viewBox="0 0 24 24"') &&
      iconComponent.includes("moveTypeGlyph(type)"),
    "Buttons render the shipped vector geometry",
  );
  assert.ok(
    !iconComponent.includes("<image"),
    "SVG icons do not stretch small raster artwork",
  );
  console.log(
    "Trainer/interface assets passed: 55 transparent trainer files, 11 independent 1600×900 boss backgrounds, 11 aligned 6×6 motion atlases with 396 cropped frame hashes, 24 menu images and 18 vector type glyphs; encoded dimensions, SHA256, whitelist and budgets.",
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
