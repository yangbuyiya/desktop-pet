const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DEFAULT_PET_FRAME = Object.freeze({
  width: 192,
  height: 208,
  columns: 8,
  rows: 9
});

const STORAGE_LABELS = {
  codex: ".codex 宠物",
  custom: "自定义文件夹"
};

const PET_SOURCE_LABELS = {
  builtin: "内置",
  pets: "目录"
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function listDirectories(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

function sanitizeId(input, fallback = "pet") {
  const base = String(input || fallback)
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || fallback;
}

function positiveInteger(value, fallback, minimum = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum ? number : fallback;
}

function normalizePetFrame(frame = {}) {
  return {
    width: positiveInteger(frame.width, DEFAULT_PET_FRAME.width),
    height: positiveInteger(frame.height, DEFAULT_PET_FRAME.height),
    columns: positiveInteger(frame.columns, DEFAULT_PET_FRAME.columns, 8),
    rows: positiveInteger(frame.rows, DEFAULT_PET_FRAME.rows, 8)
  };
}

function resolveSpritesheetPath(directory, manifestPath) {
  const spritesheetPath = path.resolve(directory, manifestPath || "spritesheet.webp");
  const relative = path.relative(directory, spritesheetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return spritesheetPath;
}

function getPetStorageRoots({ codexHome, customPetsDir }) {
  return {
    codexPetsRoot: path.join(codexHome, "pets"),
    customPetsRoot: customPetsDir ? path.resolve(customPetsDir) : ""
  };
}

function normalizePetStorage(value, roots) {
  if (value === "custom" && roots.customPetsRoot) return "custom";
  return "codex";
}

function getActivePetsRoot({ codexHome, settings = {} }) {
  const roots = getPetStorageRoots({
    codexHome,
    customPetsDir: settings.customPetsDir
  });
  const petStorage = normalizePetStorage(settings.petStorage, roots);
  const petsRoot = petStorage === "custom" ? roots.customPetsRoot : roots.codexPetsRoot;

  return {
    petStorage,
    petsRoot,
    ...roots,
    options: [
      { id: "codex", label: STORAGE_LABELS.codex, path: roots.codexPetsRoot },
      { id: "custom", label: STORAGE_LABELS.custom, path: roots.customPetsRoot }
    ]
  };
}

function discoverPetsInDirectory(petsRoot, source = "pets") {
  const prefix = source === "builtin" ? "builtin" : "pets";
  return listDirectories(petsRoot)
    .map((dir) => {
      const manifest = readJson(path.join(dir, "pet.json")) || {};
      const id = String(manifest.id || path.basename(dir));
      const spritesheetPath = resolveSpritesheetPath(dir, manifest.spritesheetPath);

      if (!spritesheetPath || !fs.existsSync(spritesheetPath)) return null;

      return {
        id,
        key: `${prefix}:${id}`,
        displayName: String(manifest.displayName || id),
        description: String(manifest.description || ""),
        source,
        sourceLabel: PET_SOURCE_LABELS[source] || source,
        root: dir,
        spritesheetPath,
        frame: normalizePetFrame(manifest.frame)
      };
    })
    .filter(Boolean);
}

function discoverPets(petsRoot, options = {}) {
  const bundledPets = options.bundledPetsRoot
    ? discoverPetsInDirectory(options.bundledPetsRoot, "builtin")
    : [];
  return [
    ...bundledPets,
    ...discoverPetsInDirectory(petsRoot, "pets")
  ];
}

function toPetPayload(pet) {
  if (!pet) return null;
  return {
    id: pet.id,
    key: pet.key,
    displayName: pet.displayName,
    description: pet.description,
    source: pet.source,
    sourceLabel: pet.sourceLabel,
    spritesheetUrl: pathToFileURL(pet.spritesheetPath).toString(),
    frame: { ...pet.frame }
  };
}

module.exports = {
  DEFAULT_PET_FRAME,
  discoverPets,
  getActivePetsRoot,
  normalizePetFrame,
  sanitizeId,
  toPetPayload
};
