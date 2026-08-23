# AGENTS.md

## 1. 项目身份

本仓库项目名：**TaskPet**

TaskPet 是一个本地运行的桌面任务助手，以桌宠作为常驻交互入口。

正式开发前，必须先阅读仓库根目录：

```text
DESIGN.md
```

`DESIGN.md` 是本项目的主要产品与架构设计依据。

如果本文件与 `DESIGN.md` 在产品需求或架构定义上出现冲突：

> **优先遵循最新版本的 `DESIGN.md`。**

不要脱离设计文档自行重构产品方向。

---

## 2. 核心产品定义

TaskPet 的核心产品定义：

> **TaskPet 不是持续记录用户电脑上运行了什么，而是只关注用户主动绑定给任务的程序；当绑定程序出现时，TaskPet 将任务自动切换为执行中；当绑定程序退出时，停止本次计时并保留累计时间；当累计运行时间达到任务设定目标后，任务自动完成并勾选。**

核心默认完成方式：

```text
duration
```

即：

```text
累计运行达到指定时长后自动完成
```

不是：

```text
打开程序即完成
```

也不是：

```text
关闭程序即完成
```

程序退出但累计时长未达到目标时：

```text
active
  ↓
pending

累计时间保留
任务不完成
```

下一次重新运行绑定程序：

```text
继续累计
```

---

## 3. 明确不实现的行为

除非 `DESIGN.md` 后续明确修改，否则不要实现：

```text
前台活跃窗口计时
键盘记录
鼠标行为记录
屏幕截图
浏览器内容读取
文档内容读取
剪贴板监控
完整系统进程历史记录
用户行为分析
```

TaskPet 只需要判断：

```text
用户主动绑定给任务的目标程序
当前是否正在运行
```

---

## 4. 当前推荐技术栈

当前设计方案：

```text
Desktop Shell:
Electron

Language:
TypeScript

Local Database:
SQLite

Task Data:
Task + TaskOccurrence

Process Monitoring:
2~3 秒低频轮询

UI Timer:
约 1 秒刷新

SQLite Session Checkpoint:
约 30~60 秒

Packaging:
electron-builder
```

除非有充分理由并先说明，不要擅自把：

```text
Electron
```

改成：

```text
Tauri
```

也不要把：

```text
SQLite
```

改成：

```text
MySQL
PostgreSQL
MongoDB
```

---

## 5. 安全规则

Electron 必须保持：

```text
contextIsolation = true
nodeIntegration = false
```

Renderer 不允许直接访问：

```text
fs
child_process
SQLite
系统进程 API
```

系统能力必须通过：

```text
Main Process
    ↓
Preload
    ↓
IPC
    ↓
Renderer
```

暴露。

IPC 输入必须进行参数校验。

推荐使用：

```text
Zod
```

不要把任意 shell command 暴露给 Renderer。

不要实现允许任务配置直接执行：

```text
cmd
PowerShell
bash
任意 shell command
```

如需启动绑定程序，只允许启动用户明确选择过的程序文件。

---

## 6. 数据与隐私规则

禁止长期保存完整系统进程快照。

可以永久保存：

```text
任务配置
用户主动选择的程序绑定规则
任务相关 Process Session
任务累计时长
任务完成记录
应用设置
```

不应永久保存：

```text
所有运行过的程序
无关进程名称
完整窗口标题历史
浏览器访问内容
用户文件内容
```

进程快照只允许用于：

```text
内存中的即时匹配
```

匹配结束后无需持久化。

---

## 7. 任务模型原则

必须保持：

```text
Task
+
TaskOccurrence
```

分离。

### Task

表示长期规则，例如：

```text
每天使用 Codex 写代码 40 分钟
```

### TaskOccurrence

表示某一次实际任务实例，例如：

```text
2026-08-23
使用 Codex 写代码
累计 40 分钟
completed
```

不要通过每天直接执行：

```text
completed = false
```

来重置每日任务。

每日任务应该生成新的 occurrence。

---

## 8. duration 核心规则

默认任务逻辑：

```text
目标程序出现
  ↓
pending → active
  ↓
开始 / 继续累计

目标程序仍运行
  ↓
继续累计

目标程序退出
  ↓
结束本次 Session
  ↓
active → pending
  ↓
保留 accumulated_sec

目标程序再次出现
  ↓
继续累计

accumulated_sec >= target_duration_sec
  ↓
completed
```

任务达到目标时长后：

```text
只允许完成一次
```

即使绑定程序仍然运行：

```text
不得继续累计
不得再次触发完成
```

---

## 9. 多进程规则

Chrome、VS Code、Codex 或其他程序可能存在多个 PID。

不能简单执行：

```text
一个 PID = 一份任务计时
```

否则会造成重复累计。

正确原则：

> **同一任务绑定程序只计算实际 wall-clock 时间，不按 PID 数量叠加。**

只要至少一个匹配进程存在：

```text
任务处于 active
```

只有全部匹配进程消失，并经过退出确认后：

```text
任务停止本次 Session
```

---

## 10. 程序退出防抖

目标程序第一次从进程快照中消失时，不要立即判定 Session 结束。

推荐：

```text
目标进程消失
  ↓
suspected_exit
  ↓
等待约 3~5 秒
  ↓
再次确认
```

如果仍然不存在：

```text
结束 Session
```

如果期间重新出现：

```text
视为同一次连续运行
```

这样可以避免：

```text
应用内部重启
自动更新
进程切换
```

造成错误完成或错误暂停。

---

## 11. 性能规则

进程监控不是高频系统。

推荐：

```text
Process Scan:
2~3 秒

UI Timer:
1 秒

SQLite Checkpoint:
30~60 秒
```

三者必须分离。

不要：

```text
每秒扫描系统进程
每秒写 SQLite
每 2 秒启动 PowerShell
每 2 秒启动 tasklist
每 2 秒启动 WMIC
```

如果不存在：

```text
未完成 + 已绑定程序
```

的任务：

```text
ProcessMonitor 应停止
```

已完成任务：

```text
应从 watchedProcesses 移除
```

---

## 12. 桌宠状态

TaskPet 首版只需要基础状态：

```text
idle
working
done
attention
drag-left
drag-right
```

不要为了保留原项目能力而继续维护与 TaskPet 无关的复杂 Agent 状态。

推荐优先级：

```text
attention
    >
done
    >
working
    >
idle
```

完成动画：

```text
播放约 2~4 秒
```

然后：

```text
仍有 active task
→ working

没有 active task
→ idle
```

---

## 13. Fork 底座精简原则

当前项目如果基于：

```text
yangbuyiya/desktop-pet
```

则优先保留：

```text
透明桌宠 BrowserWindow
always-on-top
skipTaskbar
拖拽
窗口位置保存
tray
pet library
spritesheet renderer
pet.json
基础动画
electron-builder
安全 preload 配置
```

优先删除或停用：

```text
Codex Agent Hook
Claude Code Hook
CodeBuddy Hook
Agent Session
Agent Event Runtime
Agent Hook Installer
Agent-specific Bubble
Agent-specific Reminder
本地 Agent HTTP API
与 TaskPet 无关的状态聚合
```

---

## 14. 自动更新规则

Fork 初期必须特别检查：

```text
electron-updater
GitHub Releases URL
自动更新配置
```

在 TaskPet 尚未建立自己的正式 Release 流程前：

> **优先禁用或移除原项目自动更新。**

禁止让 TaskPet 指向：

```text
原作者 desktop-pet release
```

否则可能出现：

```text
TaskPet
  ↓
自动更新
  ↓
变回原项目
```

---

## 15. Git 工作规则

不要直接在 `main` 上进行大规模开发。

推荐分支：

```text
feature/p0-pet-shell
feature/p1-task-core
feature/p2-process-monitor
feature/p3-runtime-tracking
feature/p4-polish
```

每个阶段应：

```text
独立修改
独立测试
独立 review
```

不要在一个阶段顺手实现下一个阶段。

---

## 16. Commit 原则

Commit 应保持小而清晰。

推荐形式：

```text
refactor: remove agent hook runtime
refactor: simplify pet states
feat: add sqlite task repository
feat: add daily task occurrences
feat: add task panel
feat: add process matcher
feat: add runtime tracker
feat: auto-complete duration tasks
feat: connect task state to pet animation
fix: recover stale process sessions
fix: split runtime across local midnight
```

不要把：

```text
几十个互不相关的改动
```

塞进一个 commit。

---

## 17. Codex 工作流程

每次收到开发任务时，必须先：

```text
1. 阅读 AGENTS.md
2. 阅读 DESIGN.md
3. 检查当前 Git 分支
4. 阅读相关代码
5. 判断当前开发阶段
6. 输出修改计划
7. 再开始修改
```

不要在未理解现有架构时直接大规模重写。

---

## 18. 修改前输出要求

正式修改代码前，优先输出：

```text
当前架构摘要
涉及文件
准备新增文件
准备修改文件
准备删除文件
风险点
测试方案
```

如果任务很小，可以简化，但不能省略对修改范围的判断。

---

## 19. 修改后要求

代码修改完成后必须：

```text
1. 运行相关单元测试
2. 运行现有测试
3. 能构建时执行构建检查
4. 能启动时执行 smoke test
5. 查看 git diff
6. 检查是否误改无关文件
7. 总结实际修改内容
8. 总结仍存在的问题
```

不要在测试失败的情况下声称阶段已经完成。

如果存在无法完成的测试：

```text
明确说明原因
```

---

## 20. 不允许擅自扩展范围

例如当前任务是：

```text
P0 桌宠底座精简
```

则不要顺手实现：

```text
SQLite
Task CRUD
Process Monitor
任务统计
提醒
番茄钟
AI 对话
```

当前阶段结束后：

```text
停下来
总结
等待下一条指令
```

---

## 21. 当前开发阶段

初始阶段：

```text
P0 — 桌宠底座精简
```

目标：

> **把原始桌宠仓库精简成干净、稳定、可继续接入 TaskPet 任务系统的桌宠 Shell。**

P0 只处理：

```text
桌宠窗口
基础动画
拖拽
托盘
宠物资源加载
项目身份
无关 Agent 模块移除
原 updater 处理
基础测试
```

P0 不实现：

```text
SQLite
TaskService
TaskOccurrence
任务面板
ProcessMonitor
RuntimeTracker
自动完成
```

---

## 22. P0 验收条件

P0 完成时至少满足：

```text
应用可以启动

桌宠：
透明
无边框
始终置顶
跳过任务栏
可拖拽
位置可保存

宠物：
idle 正常
基础动画正常

系统：
tray 正常
可以正常退出

代码：
Agent Hook 已移除
Agent Session 已移除
本地 Agent HTTP API 已移除
原项目自动更新不会更新回原作者版本

安全：
contextIsolation = true
nodeIntegration = false

工程：
测试通过
项目可正常构建或完成基础 smoke test
```

---

## 23. 后续阶段

### P1

```text
SQLite
Task
TaskOccurrence
Daily / One Time
Task CRUD
Manual Complete
History
任务面板
```

### P2

```text
ProcessMonitor
ProcessMatcher
程序选择
任务 active 联动
```

### P3

```text
ProcessSession
RuntimeTracker
duration 自动完成
跨 Session 累计
崩溃恢复
跨午夜
```

### P4

```text
体验完善
托盘优化
设置
开机启动
提醒
备份
安装包
```

---

## 24. 最重要的验收场景

后续整个 TaskPet 项目都应围绕此流程进行验证：

```text
创建每日任务：
“使用 Codex 写代码 40 分钟”

绑定：
Codex.exe

第一次打开 Codex：
运行 15 分钟

关闭 Codex：
任务不完成
累计 = 15 分钟

第二次打开 Codex：
继续累计

再运行 25 分钟：
累计 = 40 分钟

达到目标：
任务自动完成
自动勾选

显示：
“已完成 · 40 分钟”

桌宠：
working → done

第二天：
生成新的未完成 occurrence
昨天记录仍然保留
```

如果这个闭环稳定可靠：

> **TaskPet 的核心功能才算真正成立。**
