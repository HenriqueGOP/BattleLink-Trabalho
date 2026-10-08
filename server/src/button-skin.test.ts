import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import skinManifest from "../../client/public/interface/button-skins/manifest.json";

const root = resolve(__dirname, "../..");
const source = (path: string) => readFile(resolve(root, path), "utf8");

async function run() {
  assert.equal(skinManifest.license, "CC0-1.0");
  assert.equal(skinManifest.source, "https://kenney.nl/assets/ui-pack-sci-fi");
  assert.equal(skinManifest.slice, 14);
  assert.equal(skinManifest.borderWidth, 7);
  assert.deepEqual(Object.keys(skinManifest.assets).sort(), ["idle", "pressed"]);
  const directory = resolve(root, "client/public/interface/button-skins");
  assert.deepEqual((await readdir(directory)).sort(), [
    "License.txt", "button_rectangle.svg", "button_rectangle_depth.svg", "manifest.json",
  ]);
  for (const asset of Object.values(skinManifest.assets)) {
    const bytes = await readFile(resolve(root, "client/public", `.${asset.path}`));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    assert.match(bytes.toString(), /<svg width="192" height="64"/);
    assert.doesNotMatch(bytes.toString(), /<text|<script|<image|(?:href|src)="https?:\/\//);
    assert.equal(asset.width, 192);
    assert.equal(asset.height, 64);
  }
  assert.notEqual(skinManifest.assets.idle.sha256, skinManifest.assets.pressed.sha256);
  assert.match(await source("client/public/interface/button-skins/License.txt"), /Creative Commons Zero, CC0/);
  assert.match(await source(".gitattributes"), /client\/public\/interface\/button-skins\/\*\.svg -text/,
    "Git must preserve the verified source hashes even when Windows enables autocrlf");
  const css = await source("client/src/components/MoveIdentity/ButtonSkin.module.css");
  assert.match(css, /border-image-slice:\s*14\s*;/);
  assert.match(css, /border-image-width:\s*7px/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:disabled/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /data-motion-preference='reduced'/);
  assert.match(css, /transform:\s*none/);
  assert.doesNotMatch(css, /\bfill\b|@keyframes|animation:/);
  assert.ok(css.includes(skinManifest.assets.idle.path));
  assert.ok(css.includes(skinManifest.assets.pressed.path));
  for (const page of [
    "client/src/pages/BattlePage/BattlePage.tsx",
    "client/src/pages/BattlePage/components/MoveMenu/MoveMenu.tsx",
    "client/src/pages/TeamSetupPage/TeamSetupPage.tsx",
  ]) {
    const text = await source(page);
    assert.match(text, /buttonSkin\.frame/);
    assert.doesNotMatch(text, /MoveButtonArt|moveButtonInkStyle|buttonStateFrames/);
  }
  const moves = await source("client/src/pages/BattlePage/components/MoveMenu/MoveMenu.tsx");
  assert.match(moves, /legal\.disabled/);
  assert.match(moves, /legal\.pp <= 0/);
  assert.match(moves, /request\?\.lockedMoveId === 'recharge'/);
  assert.match(moves, /chosenAction\?\.requestId === request\.id/);
  assert.match(moves, /onAttack\(moveName\)/);
  assert.match(moves, /MoveTypeIcon type=\{type\}/);
  const setup = await source("client/src/pages/TeamSetupPage/TeamSetupPage.tsx");
  assert.equal((setup.match(/MoveTypeIcon type=\{move\.type\} watermark/g) ?? []).length, 2,
    "Both original equipped and candidate type watermarks must remain mounted");
  assert.match(setup, /styles\.moveCard\} \$\{moveIdentity\.surface/);
  const setupCss = await source("client/src/pages/TeamSetupPage/TeamSetupPage.module.css");
  assert.match(setupCss, /grid-auto-rows:\s*max-content/,
    "Compact equipped moves must grow to fit the stats instead of clipping inside an 88px row");
  assert.match(setupCss, /\.tab\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*12px 32px minmax\(0, 1fr\) 16px/,
    "Compact team names must wrap within a measured grid column without overlapping adjacent rows");
  for (const obsolete of [
    "client/public/interface/buttons", "client/src/components/MoveIdentity/MoveButtonArt.tsx",
    "client/src/components/MoveIdentity/moveButtonRegistry.ts",
    "client/src/pages/BattlePage/MoveButtonGallery.tsx",
  ]) await assert.rejects(access(resolve(root, obsolete)));
  console.log("Static button skin passed: official CC0 SVG hashes, nine-slice borders, real controls, authoritative states, reduced motion and removal of frame playback.");
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
