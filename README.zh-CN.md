# TaskPet

TaskPet 是一个本地优先的桌面任务助手，以常驻桌宠作为低打扰交互入口。

当前分支只实现 P0 桌宠 Shell，明确不包含 Task CRUD、SQLite、进程监控、运行时计时、提醒、Agent Hook、本地 HTTP API 或自动更新。

## P0 已保留能力

- Electron 透明、无边框桌宠窗口
- 始终置顶，并跳过普通任务栏
- 鼠标拖拽与窗口位置保存
- 拖动缩放手柄与缩放比例保存
- tray 显示/隐藏、宠物切换、重新加载与退出
- 内置宠物和 `~/.codex/pets` 下的 Codex-compatible spritesheet
- 六个状态：`idle`、`working`、`done`、`attention`、`drag-left`、`drag-right`
- `contextIsolation: true`、`nodeIntegration: false`

## 本地开发

```bash
npm install
npm test
npm run smoke
npm run build:unpack
```

`npm run smoke` 会实际加载 Electron renderer，但不显示桌宠；加载成功后自动退出。

## 宠物包格式

TaskPet 会发现内置宠物，以及以下标准目录中的兼容宠物：

```text
~/.codex/pets/<pet-id>/
├── pet.json
└── spritesheet.webp
```

最小 manifest：

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

TaskPet 使用图集第 0、1、2、3、4、7 行分别承载六个状态。未声明 `frame` 时默认采用 Codex-compatible 的 192×208 单帧、8×9 图集。

## 当前架构

```text
Electron Main
├── 桌宠窗口与 tray
├── 本地 Shell 设置
├── 宠物资源发现
└── PetStateController  ← 后续 Task 事件接入点
          ↓
       Preload
          ↓
       Renderer
```

系统能力只存在于 Main Process。Preload 仅暴露窗口移动、缩放、初始状态和只读事件订阅，Renderer 不直接访问文件系统、子进程或本地数据库。

P1 可以在 Main Process 中加入带参数校验的 `TaskService` IPC，并把任务事件映射到 `PetStateController`；无需改动桌宠窗口壳或 spritesheet renderer。

## 来源与资源说明

TaskPet P0 Shell 基于 MIT 许可的 [yangbuyiya/desktop-pet](https://github.com/yangbuyiya/desktop-pet) 精简。继承的内置宠物美术和临时应用图标在公开发布前仍需分别确认再分发权；代码许可证不自动代表所有美术资源都可重新分发。
