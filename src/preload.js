const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("taskPet", {
  getInitialState: () => ipcRenderer.invoke("taskpet:get-initial-state"),
  getWindowBounds: () => ipcRenderer.invoke("taskpet:get-window-bounds"),
  moveWindow: (point) => ipcRenderer.invoke("taskpet:move-window", point),
  resizeWindow: (payload) => ipcRenderer.invoke("taskpet:resize-window", payload),
  finishDrag: () => ipcRenderer.invoke("taskpet:finish-drag"),
  setDragDirection: (direction) => ipcRenderer.send("taskpet:drag-direction", direction),
  rendererReady: () => ipcRenderer.send("taskpet:renderer-ready"),
  onStateChange: (callback) => subscribe("taskpet:state-changed", callback),
  onPetChange: (callback) => subscribe("taskpet:pet-changed", callback),
  onZoomChange: (callback) => subscribe("taskpet:zoom-changed", callback)
});
