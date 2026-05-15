# 屏幕日程 (Screen Schedule) — 项目技术文档

> 版本：v1.1.2 | 技术栈：Electron 29 + Vanilla JS (ESM) | 平台：Windows / macOS

---

## 一、架构总览

```
Main Process (Node.js)          Renderer Process (Browser)
──────────────────────          ──────────────────────────
main.js                         index.html
  ├─ IPC handlers               app.js          ← 状态机入口
  ├─ 全局快捷键                  weekGrid.js     ← 网格渲染 + 编辑
  └─ autoUpdater                notesPanel.js   ← 侧边栏面板
                                dataManager.js  ← 数据读写中心
windowManager.js                dateUtils.js    ← 日期工具函数
  └─ BrowserWindow 生命周期
tray.js
  └─ 系统托盘 + 右键菜单
store.js
  └─ electron-store 封装

        Preload (沙盒隔离桥)
        preload.js
          └─ window.electronAPI
```

**关键设计原则：**
- Renderer 完全沙盒化，`contextIsolation: true, nodeIntegration: false, sandbox: true`
- Renderer 只能通过 `window.electronAPI`（由 preload 暴露）与 Main 通信
- 所有 IPC key 在 Main 端有白名单校验，防注入

---

## 二、文件职责速查

### Main Process

| 文件 | 职责 |
|------|------|
| `src/main/main.js` | App 生命周期、IPC handlers、全局快捷键注册、autoUpdater 配置、单实例锁 |
| `src/main/windowManager.js` | 创建 BrowserWindow（无边框透明窗）、窗口位置持久化、关闭拦截→隐藏、主题推送 |
| `src/main/tray.js` | 系统托盘图标、右键菜单（显示/隐藏、置顶、开机自启、检查更新、退出）|
| `src/main/store.js` | electron-store schema 定义，数据文件名 `schedule-data.json` |
| `src/main/license.js` | License Key 离线验证逻辑 |

### Renderer

| 文件 | 职责 |
|------|------|
| `src/renderer/app.js` | 全局状态（`currentOffset`, `selectedDate`, `currentView`, `monthOffset`）、render() 主循环、事件绑定、隐私弹窗、激活弹窗、名言编辑弹窗 |
| `src/renderer/weekGrid.js` | 周/日/月视图网格渲染、`FloatingEditor`（浮动编辑框）、`CurrentTimeLayer`（红线）、拖拽移动事件 |
| `src/renderer/notesPanel.js` | 左侧"本周重点"(`RightPanel`) + 右侧"本月重点"(`NotesPanel`) 面板渲染 |
| `src/renderer/dataManager.js` | 渲染侧唯一数据中心：内存缓存 + 异步持久化 + 旧数据格式迁移 |
| `src/renderer/dateUtils.js` | 日期字符串工具：week key 生成、周起始日计算、月历格日期数组 |
| `src/preload/preload.js` | contextBridge 安全桥，暴露 `window.electronAPI` |

### 样式

| 文件 | 负责区域 |
|------|----------|
| `styles/base.css` | CSS 变量 (--cell-height, 主题色)、reset |
| `styles/layout.css` | 整体布局：三栏 flex、toolbar、system-bar |
| `styles/grid.css` | 网格体：时间轴、单元格、event-block、浮动编辑框、红线、月视图 |
| `styles/notes.css` | 侧边栏面板样式、弹窗（激活、隐私、名言）|

---

## 三、数据存储结构

数据持久化位置：`%APPDATA%\screen-schedule\schedule-data.json`

```json
{
  "settings": {
    "alwaysOnTop": true,
    "opacity": 0.95,
    "startOfWeek": 0,         // 0=周日, 1=周一
    "theme": "system",        // "system"|"dark"|"light"
    "backgroundBlur": true,
    "shortcut": "Alt+Space",
    "launchAtLogin": false,
    "windowBounds": { "x":..., "y":..., "width":..., "height":... },
    "customQuotes": ["..."],
    "licenseKey": "...",
    "privacyAcceptedVersion": "1.1"
  },
  "weeks": {
    "2026-W20": {                       // Week Storage Key（见下方说明）
      "events": {
        "2026-05-11": {
          "09:00": [{ "text": "早会", "colorType": 0 }],
          "14:30": [
            { "text": "周报", "colorType": 0 },
            { "text": "代码审查", "colorType": 1 }   // 一个 slot 最多 2 个事件
          ]
        }
      },
      "notes": {                        // 旧版每日笔记，基本废弃
        "2026-05-11": ["", "", ""]
      },
      "weekNotes": ["本周目标", "", ""] // 左侧面板"本周重点"
    }
  },
  "months": {
    "2026-05": ["五月计划", "", ""]     // 右侧面板"本月重点"
  }
}
```

### Week Storage Key 算法

```
getWeekStorageKey(dateStr, startOfWeek)
  → 计算周起始日（周日或周一）
  → 计算该年第几周（从年初第一个完整周算起）
  → 格式：YYYY-Wnn
```

旧版使用 ISO 周（`getLegacyWeekStorageKey`），`DataManager` 在 `load()` 时自动迁移。

---

## 四、核心功能实现

### 4.1 视图系统（app.js）

```
currentView: 'week' | 'day' | 'month'
currentOffset: 数字（0=本周，-1=上周，+1=下周）
selectedDate: 'YYYY-MM-DD'
monthOffset: 数字（0=本月）
```

`render()` 是单一渲染入口，根据 `currentView` 分支：
- **周视图**：传入 7 天日期数组给 WeekGrid
- **日视图**：传入 [selectedDate] 单元素数组，相同代码路径
- **月视图**：独立分支，42 格月历，点击日期跳转日视图

导航按钮（上一周/下一周）在日视图中变为前一天/后一天，在月视图中变为前月/后月。

### 4.2 周/日网格（weekGrid.js）

**布局**：CSS Grid，`grid-template-columns: 50px repeat(7, 1fr)`
- 第 1 列：时间标签（整点行跨 2 行）
- 第 2-8 列：7 天事件格

**时间槽**：48 个固定值（00:00~23:30，每 30 分钟）

**单元格每 slot 最多 2 个事件**（`multi-event` 状态），第 3 个会被拖拽拒绝。

**FloatingEditor**（浮动编辑框）：
- 全局唯一，`position:fixed`，`id="floating-editor"`
- 在格子下方弹出，边界超出时翻转到上方
- 防抖 800ms 自动保存，失焦时强制保存
- 三色选择器（蓝/红/绿，colorType 0/1/2）
- ESC 取消，Enter 保存关闭，Shift+Enter 换行

**红线**（CurrentTimeLayer）：
- `position:absolute`，在 `#grid-body` 内
- `setInterval` 每 60s 更新 top = (hours*60+minutes)/30 * CELL_HEIGHT

**拖拽**：HTML5 原生 drag&drop，拖拽状态存储在模块级 `_dragState`，持有 `blockRef` 引用避免 index 竞态。

**事件分类标记**（前缀规则）：
- `!` 或 `！` → `event-important`（红色高亮）
- `@` → `event-personal`（个人类）

### 4.3 数据读写（dataManager.js）

所有写入均有乐观更新 + 回滚机制：
```js
const prev = cloneWeekData(...);
修改内存;
const ok = await _persistWeek(...);
if (!ok) 回滚内存;
```

写入失败弹 `window.alert` 提示，1.5 秒内去重。

**数据格式兼容**：`_getItems()` 同时处理旧格式 `{ text }` 和新格式 `[{ text, colorType }]`。

**启动修复**：`_repairOrphanedWeekEvents()` 检测并修复历史 bug 导致的事件存错 week 的情况。

### 4.4 IPC 安全（main.js）

所有 `store:get/set/delete` 调用必须通过 `isValidStoreKey()` 白名单校验：
- 显式允许列表：settings 下的具体 key
- 正则允许：`weeks.YYYY-Wnn` 和 `months.YYYY-MM` 格式
- `store:set` 额外限制 value 序列化后 ≤ 64KB

快捷键、透明度等参数有独立校验函数（`validate.shortcut`, `validate.opacity`）。

### 4.5 窗口管理（windowManager.js）

- 无边框透明窗（`frame: false, transparent: true`）
- 关闭拦截：`close` 事件 → `win.hide()`（托盘驻留）
- 真正退出：`win.forceQuit = true` 后再 `close()`（托盘退出 / 更新安装时设置）
- 多显示器安全：启动时用 `screen.getAllDisplays()` 检查 savedBounds 是否在任一显示器范围内
- 位置防抖保存：resize 后 500ms 才写入 store

### 4.6 自动更新（main.js）

- 生产环境（`app.isPackaged`）才启用
- 启动后延迟 10 秒自动检查（防干扰主窗口初始化）
- `autoDownload: true`：静默后台下载
- 下载完成弹窗询问是否立即安装，选是则强制关闭所有窗口后执行 `quitAndInstall`
- 手动检查设有 60 秒冷却

---

## 五、IPC 接口完整列表

### 渲染 → 主（invoke，有返回值）

| channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `store:getAll` | — | 全部数据对象 | 初始化加载 |
| `store:get` | key | value | 读单 key |
| `store:set` | key, value | boolean | 写单 key（含安全校验）|
| `store:delete` | key | boolean | 删单 key |
| `license:validate` | key | boolean | 验证激活码 |
| `license:getStatus` | — | boolean | 当前是否已激活 |

### 渲染 → 主（send，无返回值）

| channel | 参数 | 说明 |
|---------|------|------|
| `window:minimize` | — | 最小化 |
| `window:maximize` | — | 最大化/还原切换 |
| `window:show` | — | 显示窗口 |
| `window:close` | — | 关闭（隐藏到托盘）|
| `app:quit` | — | 完全退出 |
| `window:setAlwaysOnTop` | boolean | 设置置顶 |
| `window:setOpacity` | number | 设置透明度（0.2~1.0）|
| `window:updateShortcut` | string | 修改全局快捷键 |
| `show-editor-context-menu` | — | 弹出右键剪切/复制/粘贴/删除菜单 |

### 主 → 渲染（推送）

| channel | 参数 | 触发时机 |
|---------|------|---------|
| `theme:changed` | 'dark'\|'light' | 系统主题变化 |
| `window:shown` | — | 窗口从隐藏变为显示 |
| `window:maximizeChanged` | boolean | 最大化/还原 |
| `trigger-event-delete` | — | 右键菜单"删除日程"点击 |
| `quotes:edit` | — | 托盘菜单"我的名言"点击 |
| `update:progress` | {percent, transferred, total} | 更新下载进度 |

---

## 六、CSS 变量与关键常量

```css
/* base.css */
--cell-height: 40px;     /* 时间槽行高，JS 中 CELL_HEIGHT=40 必须与此一致 */
--sidebar-width: 220px;  /* 侧边栏默认宽度 */
```

```js
// weekGrid.js
const CELL_HEIGHT = 40;   // 与 CSS --cell-height 严格一致
const TIMES = [/*48个时间槽*/];  // '00:00'~'23:30'

// dataManager.js
MAX_VALUE_SIZE = 64 * 1024;  // 每个 IPC store:set 的 value 上限

// app.js
PRIVACY_VERSION = '1.1';     // 隐私说明版本，升级时修改此值强制弹窗
```

---

## 七、首次启动流程

```
app.whenReady()
  ├─ 数据迁移：startOfWeek 重置为 0（一次性）
  ├─ 同步开机自启到系统
  ├─ createWindow()
  ├─ createTray()
  ├─ registerShortcut()
  └─ setupAutoUpdater()

Renderer init()
  ├─ DataManager.load()         // 读取全部数据 + 修复孤立事件
  ├─ showPrivacyNoticeIfNeeded() // 隐私弹窗（首次或版本更新）
  ├─ showActivationModalIfNeeded() // 激活码弹窗（未激活时）
  ├─ WeekGrid.init()            // 初始化浮动编辑框
  ├─ render()                   // 渲染周视图
  └─ 绑定所有 UI 事件
```

---

## 八、常见修改场景指引

### 添加新设置项
1. `store.js` — schema 中加字段和默认值
2. `main.js` — `ALLOWED_STORE_KEYS` 数组中加 `'settings.xxx'`
3. `preload.js` — 若需新 IPC channel，在此暴露
4. `dataManager.js` — `saveSetting('xxx', value)` 写入

### 修改时间槽精度（当前30分钟）
1. `weekGrid.js` — 修改 `TIMES` 生成逻辑
2. CSS `--cell-height` — 同步调整行高
3. `CELL_HEIGHT` 常量同步

### 新增视图（如季度视图）
1. `index.html` — `#view-switcher` 加按钮
2. `app.js` — `currentView` 增加新值，`render()` 加分支
3. `weekGrid.js` — 加 `renderQuarter()` 方法

### 修改红线更新频率
`weekGrid.js:297` — `setInterval(updateRedLine, 60_000)` 改间隔值

### 升级隐私说明版本
`app.js:229` — `PRIVACY_VERSION = '1.1'` 改为新版本号

### 调试数据存储
数据文件：`%APPDATA%\screen-schedule\schedule-data.json`

---

## 九、构建与发布

```bash
npm start          # 开发模式
npm run dev        # 开发模式 + Node.js debugger (port 5858)
npm run build:win  # 打包 Windows NSIS 安装包 → dist/
npm run release    # 打包 + 发布到 GitHub Releases
```

发布配置（`package.json` build 字段）：
- GitHub: `himalayas0625/Schedule` repo
- 构建产物排除 `.claude/`、`test/`、`scripts/` 等开发文件
- 额外资源：`logo.png`、`assets/icon.ico` 打入 `resources/`
