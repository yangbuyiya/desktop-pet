# TaskPet

TaskPet is a local-first desktop task assistant that uses a small animated pet as its persistent entry point.

This branch contains the P0 pet shell only. It intentionally does not include task CRUD, SQLite, process monitoring, runtime tracking, reminders, Agent hooks, a local HTTP API, or automatic updates.

## P0 capabilities

- Transparent, frameless Electron pet window
- Always on top and hidden from the regular taskbar
- Pointer dragging with persisted position
- Resize handle with persisted zoom
- System tray controls for show/hide, pet selection, pet reload, and quit
- Bundled and `~/.codex/pets` Codex-compatible spritesheets
- Six TaskPet states: `idle`, `working`, `done`, `attention`, `drag-left`, and `drag-right`
- Isolated renderer with `contextIsolation: true` and `nodeIntegration: false`

## Development

```bash
npm install
npm test
npm run smoke
npm run build:unpack
```

The smoke command loads the Electron renderer without showing the pet and exits automatically after startup succeeds.

## Pet packages

TaskPet discovers bundled pets and compatible packages under:

```text
~/.codex/pets/<pet-id>/
├── pet.json
└── spritesheet.webp
```

Minimal manifest:

```json
{
  "id": "example",
  "displayName": "Example Pet",
  "spritesheetPath": "spritesheet.webp",
  "frame": {
    "width": 192,
    "height": 208,
    "columns": 8,
    "rows": 9
  }
}
```

TaskPet uses rows 0, 1, 2, 3, 4, and 7 for its six states. Missing frame metadata defaults to the Codex-compatible 192×208, 8×9 layout.

## Architecture

```text
Electron main
├── pet window and tray
├── local shell settings
├── pet resource discovery
└── PetStateController  ← P1/P2/P3 task events connect here
          ↓
       preload
          ↓
       renderer
```

System capabilities stay in the main process. The preload exposes only window movement, resizing, initial state, and read-only renderer subscriptions.

The next phase can add `TaskService` behind validated main-process IPC and map task events to `PetStateController`, without changing the spritesheet renderer or window shell.

## Origin and assets

TaskPet's P0 shell was derived from [yangbuyiya/desktop-pet](https://github.com/yangbuyiya/desktop-pet) under the MIT license. The inherited bundled pet art and placeholder application icon must be reviewed separately before a public TaskPet release; code licensing does not automatically grant redistribution rights for every artwork.
