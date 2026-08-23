const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  discoverPets: discoverPetsInRoot,
  getActivePetsRoot,
  toPetPayload
} = require("./pet-library");
const { PET_ACTIONS, PetStateController } = require("./pet-state");
const {
  BASE_WINDOW_HEIGHT,
  BASE_WINDOW_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  createPetWindowOptions
} = require("./pet-window-options");

const APP_NAME = "TaskPet";
const APP_ID = "com.taskpet.shell";
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const LOGO_PATH = path.join(__dirname, "assets", "logo.png");
const BUNDLED_PETS_ROOT = path.join(__dirname, "assets", "pets");
const IS_SMOKE_TEST = process.argv.includes("--smoke-test");

let petWindow = null;
let tray = null;
let pets = [];
let activePet = null;
let settings = {};
let smokeTimeout = null;

const petState = new PetStateController({
  onChange: (state) => broadcastPetState(state)
});

app.setName(APP_NAME);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  settings = readJson(getSettingsPath()) || {};
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
  } catch (error) {
    console.warn(`Failed to save TaskPet settings: ${error.message}`);
  }
}

function createAppIcon() {
  try {
    const image = nativeImage.createFromPath(LOGO_PATH);
    if (!image.isEmpty()) return image;
  } catch (error) {
    console.warn(`Failed to load TaskPet icon: ${error.message}`);
  }

  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEUAAAAYIi9i5v9y8qaZfP/90WYfKz2xyNj28m6BAAAAB3RSTlMA///f39+fn6uU/gAAAEFJREFUeNqVj0kOwCAIBQO//2XnplkYQYJGk0BHyDKJg1xmEAjJQWYNZUdGgTYosAkfiBPwYQnKN3qHf6Snw6gudTW2DdqgAhoBA3kwAAAAAElFTkSuQmCC"
  );
}

function getPetStorageInfo() {
  return getActivePetsRoot({ codexHome: CODEX_HOME, settings: {} });
}

function discoverPets() {
  const storage = getPetStorageInfo();
  const preferred = process.env.TASKPET_PET_ID
    || process.env.PET_ID
    || settings.activePetKey
    || activePet?.key;

  pets = discoverPetsInRoot(storage.petsRoot, {
    bundledPetsRoot: BUNDLED_PETS_ROOT
  });
  activePet = pets.find((pet) => pet.id === preferred || pet.key === preferred)
    || pets[0]
    || null;
}

function petStatePayload(state = petState.snapshot()) {
  return {
    ...state,
    actions: PET_ACTIONS,
    activePet: toPetPayload(activePet)
  };
}

function sendToPetWindow(channel, payload) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(channel, payload);
}

function isPetWindowSender(event) {
  return Boolean(
    petWindow
    && !petWindow.isDestroyed()
    && event?.sender === petWindow.webContents
  );
}

function broadcastPetState(state) {
  sendToPetWindow("taskpet:state-changed", petStatePayload(state));
}

function broadcastPet() {
  sendToPetWindow("taskpet:pet-changed", toPetPayload(activePet));
}

function broadcastZoom() {
  sendToPetWindow("taskpet:zoom-changed", {
    zoom: clampZoom(settings.zoom),
    bounds: petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null
  });
}

function selectPet(key) {
  const nextPet = pets.find((pet) => pet.key === key);
  if (!nextPet) return false;

  activePet = nextPet;
  settings.activePetKey = nextPet.key;
  saveSettings();
  broadcastPet();
  rebuildTrayMenu();
  return true;
}

function reloadPets() {
  discoverPets();
  broadcastPet();
  rebuildTrayMenu();
}

async function openCodexPetsFolder() {
  const target = getPetStorageInfo().petsRoot;
  try {
    fs.mkdirSync(target, { recursive: true });
    const error = await shell.openPath(target);
    if (error) console.warn(`Failed to open pet folder: ${error}`);
  } catch (error) {
    console.warn(`Failed to open pet folder: ${error.message}`);
  }
}

function createPetWindow() {
  petWindow = new BrowserWindow(createPetWindowOptions({
    preloadPath: path.join(__dirname, "preload.js"),
    icon: createAppIcon(),
    savedBounds: settings.windowBounds,
    zoom: settings.zoom
  }));

  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  petWindow.once("ready-to-show", () => {
    if (!IS_SMOKE_TEST) petWindow.show();
  });
  petWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`TaskPet renderer failed to load (${errorCode}): ${errorDescription}`);
    if (IS_SMOKE_TEST) app.exit(1);
  });
  petWindow.on("closed", () => {
    petWindow = null;
  });
}

function saveWindowBounds() {
  if (!petWindow || petWindow.isDestroyed()) return;
  settings.windowBounds = petWindow.getBounds();
  saveSettings();
}

function resizePetWindow(zoomInput) {
  if (!petWindow || petWindow.isDestroyed()) return { ok: false };

  const zoom = clampZoom(zoomInput);
  const bounds = petWindow.getBounds();
  const width = Math.round(BASE_WINDOW_WIDTH * zoom);
  const height = Math.round(BASE_WINDOW_HEIGHT * zoom);
  petWindow.setBounds({ x: bounds.x, y: bounds.y, width, height });
  settings.zoom = zoom;
  settings.windowBounds = petWindow.getBounds();
  saveSettings();
  broadcastZoom();
  return { ok: true, zoom, bounds: petWindow.getBounds() };
}

function petTrayItems() {
  const items = pets.map((pet) => ({
    label: `${pet.displayName} · ${pet.sourceLabel}`,
    type: "radio",
    checked: pet.key === activePet?.key,
    click: () => selectPet(pet.key)
  }));

  if (items.length === 0) {
    items.push({ label: "未发现可用宠物", enabled: false });
  }

  return [
    ...items,
    { type: "separator" },
    { label: "重新加载宠物", click: () => reloadPets() },
    { label: "打开 Codex 宠物目录", click: () => openCodexPetsFolder() }
  ];
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "显示 / 隐藏桌宠",
      click: () => {
        if (!petWindow || petWindow.isDestroyed()) return;
        petWindow.isVisible() ? petWindow.hide() : petWindow.show();
      }
    },
    { label: "宠物", submenu: petTrayItems() },
    { type: "separator" },
    { label: "退出 TaskPet", click: () => app.quit() }
  ]);
}

function rebuildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const icon = createAppIcon().resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.isVisible() ? petWindow.hide() : petWindow.show();
  });
}

function registerIpcHandlers() {
  ipcMain.handle("taskpet:get-initial-state", (event) => isPetWindowSender(event) ? ({
    ...petStatePayload(),
    config: {
      zoom: clampZoom(settings.zoom),
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      baseWindowWidth: BASE_WINDOW_WIDTH,
      baseWindowHeight: BASE_WINDOW_HEIGHT
    }
  }) : null);

  ipcMain.handle("taskpet:get-window-bounds", (event) => {
    if (!isPetWindowSender(event)) return null;
    return petWindow.getBounds();
  });

  ipcMain.handle("taskpet:move-window", (event, point) => {
    if (!isPetWindowSender(event) || !point || typeof point !== "object") return false;
    const x = Math.round(Number(point.x));
    const y = Math.round(Number(point.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    petWindow.setPosition(x, y);
    return true;
  });

  ipcMain.handle("taskpet:resize-window", (event, payload) => {
    if (!isPetWindowSender(event)) return { ok: false };
    const zoom = Number(payload?.zoom);
    if (!Number.isFinite(zoom)) return { ok: false };
    return resizePetWindow(zoom);
  });

  ipcMain.handle("taskpet:finish-drag", (event) => {
    if (!isPetWindowSender(event)) return false;
    saveWindowBounds();
    petState.finishDrag();
    return true;
  });

  ipcMain.on("taskpet:drag-direction", (event, direction) => {
    if (!isPetWindowSender(event) || (direction !== "drag-left" && direction !== "drag-right")) return;
    petState.startDrag(direction);
  });

  ipcMain.on("taskpet:renderer-ready", (event) => {
    if (!IS_SMOKE_TEST || !petWindow || event.sender !== petWindow.webContents) return;
    clearTimeout(smokeTimeout);
    smokeTimeout = null;
    console.log("TaskPet smoke test ready");
    setTimeout(() => app.quit(), 100);
  });
}

function configureMacMenuBarMode() {
  if (process.platform !== "darwin") return;
  app.setActivationPolicy("accessory");
  app.dock.hide();
}

app.whenReady().then(() => {
  configureMacMenuBarMode();
  if (process.platform === "win32") app.setAppUserModelId(APP_ID);
  loadSettings();
  discoverPets();
  registerIpcHandlers();
  createPetWindow();
  createTray();
  if (IS_SMOKE_TEST) {
    smokeTimeout = setTimeout(() => {
      console.error("TaskPet smoke test timed out before renderer initialization");
      app.exit(1);
    }, 10_000);
  }
}).catch((error) => {
  console.error(`TaskPet failed to start: ${error.stack || error.message}`);
  app.exit(1);
});

app.on("activate", () => {
  if (!petWindow) createPetWindow();
  else petWindow.show();
});

app.on("window-all-closed", () => {
  // The tray owns the application lifecycle; quitting is explicit from its menu.
});

app.on("before-quit", () => {
  clearTimeout(smokeTimeout);
  saveWindowBounds();
});
