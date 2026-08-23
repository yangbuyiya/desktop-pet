const pet = document.getElementById("pet");
const stage = document.querySelector(".stage");
const sprite = document.getElementById("sprite");
const fallback = document.getElementById("fallback");
const resizeHandle = document.getElementById("resizeHandle");

const DEFAULT_FRAME = Object.freeze({ width: 192, height: 208, columns: 8, rows: 9 });
const BASE_SPRITE_SCALE = 0.86;
const BASE_WINDOW_WIDTH = 240;
const BASE_WINDOW_HEIGHT = 286;
const ALLOWED_STATES = new Set([
  "idle",
  "working",
  "done",
  "attention",
  "drag-left",
  "drag-right"
]);
const DEFAULT_ANIMATIONS = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  "drag-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  "drag-left": { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  attention: { row: 3, durations: [140, 140, 140, 280] },
  done: { row: 4, durations: [140, 140, 140, 140, 280] },
  working: { row: 7, durations: [120, 120, 120, 120, 120, 220] }
};

let animations = { ...DEFAULT_ANIMATIONS };
let frame = { ...DEFAULT_FRAME };
let currentPet = null;
let currentState = "idle";
let frameIndex = 0;
let frameTimer = null;
let dragStart = null;
let lastDragDirection = null;
let zoom = 1;
let minZoom = 0.65;
let maxZoom = 2.4;
let resizeStart = null;
let hideResizeTimer = null;

function normalizeState(state) {
  return ALLOWED_STATES.has(state) ? state : "idle";
}

function clampZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(minZoom, Math.min(maxZoom, numeric));
}

function positiveInteger(value, fallback, minimum = 1) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= minimum ? numeric : fallback;
}

function applyFrame(nextFrame = {}) {
  frame = {
    width: positiveInteger(nextFrame.width, DEFAULT_FRAME.width),
    height: positiveInteger(nextFrame.height, DEFAULT_FRAME.height),
    columns: positiveInteger(nextFrame.columns, DEFAULT_FRAME.columns, 8),
    rows: positiveInteger(nextFrame.rows, DEFAULT_FRAME.rows, 8)
  };
}

function applyAnimations(actions) {
  if (!Array.isArray(actions)) return;
  const next = { ...DEFAULT_ANIMATIONS };
  for (const action of actions) {
    if (!ALLOWED_STATES.has(action?.state)) continue;
    const row = Number(action.row);
    const durations = Array.isArray(action.durations)
      ? action.durations.map(Number).filter((duration) => Number.isFinite(duration) && duration > 0)
      : [];
    if (!Number.isInteger(row) || row < 0 || durations.length === 0) continue;
    next[action.state] = { row, durations };
  }
  animations = next;
}

function applyZoom(nextZoom) {
  zoom = clampZoom(nextZoom);
  document.documentElement.style.setProperty("--zoom", String(zoom));
  document.documentElement.style.setProperty("--pet-left", `${36 * zoom}px`);
  document.documentElement.style.setProperty("--pet-bottom", `${12 * zoom}px`);
  document.documentElement.style.setProperty("--pet-width", `${168 * zoom}px`);
  document.documentElement.style.setProperty("--pet-height", `${184 * zoom}px`);
  document.documentElement.style.setProperty("--sprite-left", `${1 * zoom}px`);
  document.documentElement.style.setProperty("--handle-right", `${34 * zoom}px`);
  document.documentElement.style.setProperty("--handle-bottom", `${52 * zoom}px`);
  updateSpriteMetrics();
  drawFrame();
}

function getAtlasScale() {
  return BASE_SPRITE_SCALE * zoom;
}

function updateSpriteMetrics() {
  const atlasScale = getAtlasScale();
  sprite.style.width = `${frame.width * atlasScale}px`;
  sprite.style.height = `${frame.height * atlasScale}px`;
  sprite.style.backgroundSize = `${frame.width * frame.columns * atlasScale}px ${frame.height * frame.rows * atlasScale}px`;
}

function drawFrame() {
  const animation = animations[currentState] || animations.idle;
  const atlasScale = getAtlasScale();
  const x = -(frameIndex * frame.width * atlasScale);
  const y = -(animation.row * frame.height * atlasScale);
  sprite.style.backgroundPosition = `${x}px ${y}px`;
}

function scheduleNextFrame() {
  clearTimeout(frameTimer);
  const animation = animations[currentState] || animations.idle;
  const duration = animation.durations[frameIndex] || 160;
  frameTimer = setTimeout(() => {
    frameIndex = (frameIndex + 1) % animation.durations.length;
    drawFrame();
    scheduleNextFrame();
  }, duration);
}

function setAnimationState(state) {
  currentState = normalizeState(state);
  frameIndex = 0;
  pet.dataset.state = currentState;
  if (currentState !== "idle" && !resizeStart) {
    stage.classList.remove("show-resize");
  }
  drawFrame();
  scheduleNextFrame();
}

function setPet(petPayload) {
  currentPet = petPayload || null;
  applyFrame(currentPet?.frame);

  if (!currentPet?.spritesheetUrl) {
    sprite.classList.remove("ready");
    fallback.classList.add("show");
    return;
  }

  sprite.style.backgroundImage = `url("${currentPet.spritesheetUrl}")`;
  updateSpriteMetrics();
  sprite.classList.add("ready");
  fallback.classList.remove("show");
  drawFrame();
}

function setPetState(payload) {
  if (payload?.activePet && payload.activePet.key !== currentPet?.key) {
    setPet(payload.activePet);
  }
  setAnimationState(payload?.state);
}

async function startDrag(event) {
  if (event.button !== 0 || event.target.closest("#resizeHandle")) return;
  const pointerId = event.pointerId;
  pet.setPointerCapture(pointerId);
  const bounds = await window.taskPet.getWindowBounds();
  if (!bounds || !pet.hasPointerCapture(pointerId)) return;

  dragStart = {
    pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    lastScreenX: event.screenX,
    windowX: bounds.x,
    windowY: bounds.y
  };
  lastDragDirection = null;
}

function moveDrag(event) {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return;
  const dx = event.screenX - dragStart.startScreenX;
  const dy = event.screenY - dragStart.startScreenY;
  const stepX = event.screenX - dragStart.lastScreenX;
  dragStart.lastScreenX = event.screenX;

  window.taskPet.moveWindow({
    x: dragStart.windowX + dx,
    y: dragStart.windowY + dy
  });

  if (Math.abs(stepX) < 1) return;
  const direction = stepX > 0 ? "drag-right" : "drag-left";
  if (direction !== lastDragDirection) {
    lastDragDirection = direction;
    window.taskPet.setDragDirection(direction);
  }
}

function endDrag(event) {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return;
  dragStart = null;
  lastDragDirection = null;
  window.taskPet.finishDrag();
}

function showResizeHandle() {
  if (currentState !== "idle" && !resizeStart) return;
  clearTimeout(hideResizeTimer);
  stage.classList.add("show-resize");
}

function hideResizeHandleSoon() {
  clearTimeout(hideResizeTimer);
  hideResizeTimer = setTimeout(() => {
    if (!resizeStart) stage.classList.remove("show-resize");
  }, 180);
}

async function startResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const pointerId = event.pointerId;
  resizeHandle.setPointerCapture(pointerId);
  const bounds = await window.taskPet.getWindowBounds();
  if (!bounds || !resizeHandle.hasPointerCapture(pointerId)) return;
  resizeStart = {
    pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    width: bounds.width,
    height: bounds.height
  };
  showResizeHandle();
}

function moveResize(event) {
  if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
  event.preventDefault();
  event.stopPropagation();

  const dx = event.screenX - resizeStart.startScreenX;
  const dy = event.screenY - resizeStart.startScreenY;
  const widthZoom = (resizeStart.width + dx) / BASE_WINDOW_WIDTH;
  const heightZoom = (resizeStart.height + dy) / BASE_WINDOW_HEIGHT;
  const nextZoom = clampZoom(Math.max(widthZoom, heightZoom));
  applyZoom(nextZoom);
  window.taskPet.resizeWindow({ zoom: nextZoom });
}

function endResize(event) {
  if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  resizeStart = null;
  hideResizeHandleSoon();
}

window.taskPet.getInitialState().then((initial) => {
  const config = initial?.config || {};
  minZoom = Number(config.minZoom) || minZoom;
  maxZoom = Number(config.maxZoom) || maxZoom;
  applyAnimations(initial?.actions);
  applyZoom(Number(config.zoom) || 1);
  setPet(initial?.activePet);
  setPetState(initial);
  window.taskPet.rendererReady();
}).catch((error) => {
  console.error(`Failed to initialize TaskPet renderer: ${error.message}`);
  fallback.classList.add("show");
});

window.taskPet.onPetChange(setPet);
window.taskPet.onStateChange(setPetState);
window.taskPet.onZoomChange((payload) => applyZoom(payload?.zoom));
pet.addEventListener("pointerdown", startDrag);
pet.addEventListener("pointermove", moveDrag);
pet.addEventListener("pointerup", endDrag);
pet.addEventListener("pointercancel", endDrag);
pet.addEventListener("pointerenter", showResizeHandle);
pet.addEventListener("pointerleave", hideResizeHandleSoon);
resizeHandle.addEventListener("pointerenter", showResizeHandle);
resizeHandle.addEventListener("pointerleave", hideResizeHandleSoon);
resizeHandle.addEventListener("pointerdown", startResize);
resizeHandle.addEventListener("pointermove", moveResize);
resizeHandle.addEventListener("pointerup", endResize);
resizeHandle.addEventListener("pointercancel", endResize);
