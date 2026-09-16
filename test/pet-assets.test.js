const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const repoRoot = path.join(__dirname, "..");

function personalitySource() {
  return fs.readFileSync(path.join(repoRoot, "dashboard/src/lib/pet-personality.js"), "utf8");
}

function configuredCharacterIds() {
  const match = personalitySource().match(/PET_CHARACTER_IDS\s*=\s*(\[[^;]+\])/);
  assert.ok(match, "PET_CHARACTER_IDS must remain a literal array so assets can be validated");
  return JSON.parse(match[1]);
}

/**
 * Characters drawn from something other than a sprite atlas, and so with no
 * sheet to validate. Read from the RENDERERS map rather than hardcoded: "not
 * clawd" used to imply "has an atlas", and `bot` broke that.
 */
function nonAtlasCharacterIds() {
  const match = personalitySource().match(/const RENDERERS\s*=\s*Object\.assign\([^{]*\{([^}]+)\}/);
  assert.ok(match, "RENDERERS must remain a literal object so assets can be validated");
  return [...match[1].matchAll(/([a-z0-9-]+)\s*:/g)].map((entry) => entry[1]);
}

/** Intrinsic canvas size of a WebP, read from its VP8X / VP8 / VP8L chunk. */
function webpSize(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "VP8X") {
      return {
        width: 1 + (buffer[offset + 12] | (buffer[offset + 13] << 8) | (buffer[offset + 14] << 16)),
        height: 1 + (buffer[offset + 15] | (buffer[offset + 16] << 8) | (buffer[offset + 17] << 16)),
      };
    }
    if (id === "VP8 ") {
      return {
        width: buffer.readUInt16LE(offset + 14) & 0x3fff,
        height: buffer.readUInt16LE(offset + 16) & 0x3fff,
      };
    }
    if (id === "VP8L") {
      const bits = buffer.readUInt32LE(offset + 9);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

test("every atlas-backed pet ships a web atlas", () => {
  const vectorOrCustomDrawn = nonAtlasCharacterIds();
  assert.deepEqual(vectorOrCustomDrawn, ["clawd", "bot"]);
  const atlasCharacters = configuredCharacterIds().filter(
    (id) => !vectorOrCustomDrawn.includes(id),
  );
  // zzh is this fork's default pet (see MODIFICATIONS.md); the first three are upstream.
  assert.deepEqual(atlasCharacters, ["sprout", "byte", "ember", "zzh"]);

  for (const id of atlasCharacters) {
    const webPath = path.join(repoRoot, `dashboard/public/pets/${id}/spritesheet.webp`);
    assert.ok(fs.existsSync(webPath), `${id} web atlas is missing`);

    const web = fs.readFileSync(webPath);
    assert.equal(web.subarray(0, 4).toString("ascii"), "RIFF", `${id} web atlas is not RIFF`);
    assert.equal(web.subarray(8, 12).toString("ascii"), "WEBP", `${id} web atlas is not WebP`);
  }
});

test("upstream v1 atlas pets keep their macOS counterpart", () => {
  for (const id of ["sprout", "byte", "ember"]) {
    const macPath = path.join(repoRoot, `TokenTrackerBar/TokenTrackerBar/PetSprites/pet-${id}.png`);
    assert.ok(fs.existsSync(macPath), `${id} macOS atlas is missing`);

    const png = fs.readFileSync(macPath);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 1_536, `${id} macOS atlas width must be 1536`);
    assert.equal(png.readUInt32BE(20), 1_872, `${id} macOS atlas height must be 1872`);
  }
});

test("the fork default zzh uses the 11-row v2 atlas geometry", () => {
  const web = fs.readFileSync(path.join(repoRoot, "dashboard/public/pets/zzh/spritesheet.webp"));
  const size = webpSize(web);
  assert.ok(size, "zzh atlas has no readable dimension chunk");
  // 192x208 frames => 8 columns x 11 rows. The v2 sheet is what gives the desktop
  // pet its 16-way look direction (see atlasRows in PetAtlasAnimated.jsx).
  assert.deepEqual(size, { width: 1_536, height: 2_288 });
});
