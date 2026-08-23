const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_PET_FRAME,
  discoverPets,
  getActivePetsRoot,
  normalizePetFrame,
  sanitizeId,
  toPetPayload
} = require("../src/pet-library");

const WEBP = Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ", "binary");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "taskpet-test-"));
}

function writePet(root, id, manifestPatch = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "spritesheet.webp"), WEBP);
  fs.writeFileSync(path.join(dir, "pet.json"), JSON.stringify({
    id,
    displayName: `Pet ${id}`,
    spritesheetPath: "spritesheet.webp",
    ...manifestPatch
  }));
}

test("discoverPets reads only the provided pets root", () => {
  const root = tempDir();
  const petsRoot = path.join(root, ".codex", "pets");
  const runsRoot = path.join(root, ".codex", "pet-runs");
  writePet(petsRoot, "boba");
  writePet(path.join(runsRoot, "run-1", "final"), "generated");

  const pets = discoverPets(petsRoot);
  assert.equal(pets.length, 1);
  assert.equal(pets[0].id, "boba");
  assert.equal(pets[0].source, "pets");
});

test("discoverPets includes bundled pets with stable keys", () => {
  const root = tempDir();
  const bundledPetsRoot = path.join(root, "app", "assets", "pets");
  const petsRoot = path.join(root, ".codex", "pets");
  writePet(bundledPetsRoot, "starter");
  writePet(petsRoot, "starter");

  const pets = discoverPets(petsRoot, { bundledPetsRoot });

  assert.equal(pets.length, 2);
  assert.deepEqual(pets.map((pet) => pet.source), ["builtin", "pets"]);
  assert.deepEqual(pets.map((pet) => pet.key), ["builtin:starter", "pets:starter"]);
});

test("getActivePetsRoot defaults to .codex pets", () => {
  const root = tempDir();
  const codexHome = path.join(root, ".codex");

  assert.equal(getActivePetsRoot({ codexHome, settings: {} }).petsRoot, path.join(codexHome, "pets"));
});

test("getActivePetsRoot supports a configured custom folder", () => {
  const root = tempDir();
  const codexHome = path.join(root, ".codex");
  const customPetsDir = path.join(root, "custom-pets");

  const storage = getActivePetsRoot({
    codexHome,
    settings: {
      petStorage: "custom",
      customPetsDir
    }
  });

  assert.equal(storage.petStorage, "custom");
  assert.equal(storage.petsRoot, customPetsDir);
  assert.deepEqual(storage.options.map((option) => option.id), ["codex", "custom"]);
});

test("getActivePetsRoot falls back to .codex when custom folder is missing", () => {
  const root = tempDir();
  const codexHome = path.join(root, ".codex");

  const storage = getActivePetsRoot({
    codexHome,
    settings: {
      petStorage: "custom"
    }
  });

  assert.equal(storage.petStorage, "codex");
  assert.equal(storage.petsRoot, path.join(codexHome, "pets"));
});

test("sanitizeId keeps ids filesystem-safe", () => {
  assert.equal(sanitizeId("hello / world"), "hello-world");
});

test("Codex-compatible frame geometry is the default", () => {
  assert.deepEqual(normalizePetFrame(), DEFAULT_PET_FRAME);
  assert.deepEqual(normalizePetFrame({ width: -1, columns: 4, rows: 7 }), DEFAULT_PET_FRAME);
});

test("pet manifests can provide explicit frame geometry", () => {
  const root = tempDir();
  const petsRoot = path.join(root, ".codex", "pets");
  writePet(petsRoot, "wide", {
    frame: { width: 96, height: 104, columns: 8, rows: 9 }
  });

  const [pet] = discoverPets(petsRoot);
  assert.deepEqual(pet.frame, { width: 96, height: 104, columns: 8, rows: 9 });

  const payload = toPetPayload(pet);
  assert.deepEqual(payload.frame, pet.frame);
  assert.match(payload.spritesheetUrl, /^file:/);
  assert.equal("root" in payload, false);
  assert.equal("spritesheetPath" in payload, false);
});

test("pet manifests cannot load a spritesheet outside their package", () => {
  const root = tempDir();
  const petsRoot = path.join(root, "pets");
  fs.mkdirSync(petsRoot, { recursive: true });
  fs.writeFileSync(path.join(petsRoot, "outside.webp"), WEBP);
  writePet(petsRoot, "unsafe", { spritesheetPath: "../outside.webp" });

  assert.deepEqual(discoverPets(petsRoot), []);
});
