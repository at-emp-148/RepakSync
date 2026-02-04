import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getMissingArtwork, resizeByKind } from "../src/main/artwork.js";

test("resizeByKind produces expected grid sizes", async () => {
  const base = sharp({
    create: { width: 1200, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  });
  const grid = await resizeByKind(base.clone(), "grid").png().toBuffer();
  const gridMeta = await sharp(grid).metadata();
  assert.equal(gridMeta.width, 600);
  assert.equal(gridMeta.height, 900);

  const wide = await resizeByKind(base.clone(), "gridWide").png().toBuffer();
  const wideMeta = await sharp(wide).metadata();
  assert.equal(wideMeta.width, 460);
  assert.equal(wideMeta.height, 215);
});

test("getMissingArtwork detects existing correct cover", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-syncer-"));
  const appId = 123456789;
  const coverPath = path.join(dir, `${appId}_p.png`);
  const cover = await sharp({
    create: { width: 600, height: 900, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } }
  })
    .png()
    .toBuffer();
  fs.writeFileSync(coverPath, cover);

  const missing = await getMissingArtwork(dir, appId);
  assert.equal(missing.has("grid"), false);
  assert.equal(missing.has("gridWide"), true);
  assert.equal(missing.has("hero"), true);
});
