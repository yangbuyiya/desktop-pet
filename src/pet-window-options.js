const BASE_WINDOW_WIDTH = 240;
const BASE_WINDOW_HEIGHT = 286;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.4;

function clampZoom(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function finiteCoordinate(value, fallback) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? Math.round(coordinate) : fallback;
}

function createPetWindowOptions(options = {}) {
  if (typeof options.preloadPath !== "string" || !options.preloadPath) {
    throw new TypeError("preloadPath is required");
  }

  const zoom = clampZoom(options.zoom);
  const savedBounds = options.savedBounds || {};
  const windowOptions = {
    title: "TaskPet",
    width: Math.round(BASE_WINDOW_WIDTH * zoom),
    height: Math.round(BASE_WINDOW_HEIGHT * zoom),
    x: finiteCoordinate(savedBounds.x, 40),
    y: finiteCoordinate(savedBounds.y, 220),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  };

  if (options.icon) windowOptions.icon = options.icon;
  return windowOptions;
}

module.exports = {
  BASE_WINDOW_HEIGHT,
  BASE_WINDOW_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  createPetWindowOptions
};
