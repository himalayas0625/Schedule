# 屏幕日程插件 · 产品需求文档 v1.2

**文档状态**：待开发 | **最后更新**：2026-02-25

---

## 一、产品概述

### 1.1 产品定位

一款常驻桌面的悬浮日程组件（Widget），以半透明毛玻璃窗口形态叠加在桌面之上，让用户无需切换应用即可随时查看和编辑本周日程与每日重点任务。

### 1.2 核心功能

| 功能 | 描述 |
|------|------|
| 周视图网格 | 7天 × 48时段（30分钟/格）的日程表格 |
| 每日三件事 | 左侧笔记栏，记录每天最重要的三项任务 |
| 当前时间红线 | 实时指示"现在"在网格中的位置 |
| 系统级悬浮 | 毛玻璃窗口，可常驻置顶，托盘后台运行 |

### 1.3 目标平台

- **主平台**：Windows 10/11（打包为 NSIS 安装包）
- **次要平台**：macOS（打包为 DMG）
- **技术栈**：Electron + 原生 HTML/CSS/JS（无前端框架）

---

## 二、功能需求

### 2.1 周视图网格（Week Grid）

#### 2.1.1 网格结构

- **列**：7 天，从周一到周日（`startOfWeek` 可配置）
- **行**：48 行，每行代表 30 分钟，从 `00:00` 到 `23:30`
- **列宽**：等分自适应（`flex: 1`），随窗口宽度拉伸
- **行高**：固定 `40px`，不随窗口高度缩放（防止文字重叠）
- **时间标签**：位于最左侧，仅整点显示（`08:00`、`09:00`...），`sticky left` 吸附

#### 2.1.2 表头

- 显示星期简称 + 日期数字（如 `周三 / 25`）
- 今日列：标题和列背景以 `--today-accent`（琥珀色）区分
- 选中列：点击后以 `rgba(accent, 0.10)` 背景高亮，联动左侧笔记栏

#### 2.1.3 事件内联编辑

**触发**：点击任意时间格

**编辑形态**：浮动绝对定位输入框（`#floating-editor`）

- 全局唯一一个浮动框，`position: fixed; z-index: 9999`
- `min-height: 60px`，内含 `<textarea>` 随内容自动伸缩
- 定位策略：出现在目标格正下方；若靠近屏幕右/下边界则翻转方向
- 格内文字显示：`text-overflow: ellipsis` 截断，`title` 属性提供 hover 完整内容

**提交方式**：
- `Ctrl+Enter`：保存并关闭
- `Escape`：放弃修改并关闭
- 点击浮动框外部：视为确认保存并关闭

**清空**：提交空内容 → 删除该时段事件记录

**键盘导航**：`Tab` 跳转到下一个时间格，`Shift+Tab` 向上

#### 2.1.4 周导航

标题栏中间区域固定显示三个控件：

```
[‹]  [Feb 22 – Feb 28, 2026]  [›]
```

- `[‹]`：切换到上一周
- `[›]`：切换到下一周
- 中间周范围文字（可点击）：点击重置到本周 + 聚焦今日

**数据层**：`app.js` 维护 `currentWeekOffset` 整数（0 = 本周，-1 = 上周...），切换时重新计算 `weekDates` 并重渲染全部内容。

---

### 2.2 每日三件事笔记栏（Notes Panel）

- 位于网格**左侧**，固定宽度 `180px`
- **单日视图**：任意时刻只显示一天的三件事（对应当前选中列）
- 面板顶部标题：`2026-02-25（周三）的重点`
- 三个带序号的 `<input>` 输入框（序号 1 / 2 / 3），`maxLength: 80`
- `Enter` 键：跳转到下一个输入框
- 保存策略：输入后 **500ms 防抖**写入 `electron-store`
- **联动规则**：
  - 启动时默认选中今日，笔记栏显示今日数据
  - 点击网格任意列 → 笔记栏切换至该日期
  - 切换周视图时，笔记栏仍保持对当前 `selectedDate` 展示

---

### 2.3 当前时间红线（Current Time Indicator）

**视觉元素**：
- 一条横穿整个网格宽度的红色实线（`height: 2px; background: #ff4d4f`）
- 左端带一个 `10×10px` 实心圆点（`::before` 伪元素）
- `pointer-events: none`，不响应鼠标交互

**位置计算**：
```
top = (currentHour × 60 + currentMinute) / 30 × CELL_HEIGHT (40px)
```

**更新机制**：渲染进程 `setInterval`，每 **60 秒**重新计算并更新 `top` 值

**自动聚焦（Auto-Scroll）**：
- 触发时机：应用启动、从最小化恢复（托盘点击 / 全局快捷键唤起）
- 逻辑：`gridBody.scrollTop = redLineTop − gridBodyHeight / 2`
- 效果：红线始终出现在可视区域纵向大约居中位置

---

### 2.4 视觉效果（Visual Ergonomics）

#### 2.4.1 系统级毛玻璃

| 平台 | 实现方式 |
|------|---------|
| Windows 11+ | `backgroundMaterial: 'acrylic'` |
| macOS | `vibrancy: 'under-window'` + `visualEffectState: 'active'` |
| 兼容性回退（Win 10 旧版等） | 主进程检测失败后通知渲染进程添加 `.blur-fallback` class，使用 `backdrop-filter: blur(20px) saturate(1.8)` |

窗口必须设置 `transparent: true, backgroundColor: '#00000000'` 以透出磨砂效果。

#### 2.4.2 背景透明度

| 主题 | 背景色 |
|------|--------|
| 暗色（默认） | `rgba(30, 30, 30, 0.65)` |
| 亮色 | `rgba(255, 255, 255, 0.65)` |

#### 2.4.3 文字可读性

暗色模式下所有文字增加 `text-shadow: 0 1px 3px rgba(0,0,0,0.6)`，确保在任何壁纸背景下均清晰可辨。

#### 2.4.4 主题模式

- 支持 `"system"` / `"light"` / `"dark"` 三种设置
- `"system"` 时跟随操作系统深浅色切换，主进程监听 `nativeTheme.on('updated')` 并通过 IPC 推送到渲染进程

---

### 2.5 窗口行为

#### 2.5.1 窗口外观

- `frame: false`：无系统标题栏，全部用 HTML 自定义
- 自定义标题栏：左侧 App 名称、中间周导航、右侧窗口控制按钮
- 标题栏 `-webkit-app-region: drag` 可拖拽；所有按钮、输入框加 `no-drag`
- 支持圆角（`border-radius: 8px`）

#### 2.5.2 缩放

- `resizable: true, minWidth: 800, minHeight: 500`
- 右下角视觉缩放手柄（`#resize-handle`）：
  - 三角渐变图案，`cursor: se-resize`，`-webkit-app-region: no-drag`
  - 作为视觉提示；Windows 下系统边缘缩放原生可用，手柄为辅助
- 尺寸持久化：`win.on('resize')` 触发，**500ms 防抖**后调用 `store.set('settings.windowBounds', win.getBounds())`

#### 2.5.3 位置持久化与多显示器安全检查

启动时读取 `savedBounds`，执行以下安全校验：

```
获取 screen.getAllDisplays() 的所有 workArea 矩形
检查 (savedBounds.x, savedBounds.y) 是否落在任意显示器范围内
  ├─ 是 → 使用 savedBounds 恢复位置和尺寸
  └─ 否（副屏已拔出）→ 重置为主屏居中坐标，宽高使用上次保存值
```

---

### 2.6 系统托盘与生命周期

#### 2.6.1 关闭行为

- 点击自定义关闭按钮 / 系统关闭：拦截 `close` 事件 → 改为 `win.hide()`
- 窗口隐藏后不出现在任务栏
- 托盘图标始终常驻

#### 2.6.2 托盘菜单

**左键单击**：切换显示 / 隐藏（Toggle Visibility）

**右键菜单**：

| 菜单项 | 行为 |
|--------|------|
| 显示 / 隐藏 | `win.show()` / `win.hide()` |
| ✓ 始终置顶 | 切换 `win.setAlwaysOnTop()`，保存至 store，菜单勾选状态同步 |
| 开机自启 | 调用 `app.setLoginItemSettings()`，同步 `launchAtLogin` 到 store |
| 退出应用 | `app.exit(0)`（绕过 close 拦截，彻底关闭进程） |

#### 2.6.3 全局快捷键

- 默认：`Alt+Space`（可在 settings 中配置）
- 功能：快速呼出或隐藏日程窗口
- 注册：`globalShortcut.register()`，应用退出时自动注销
- 运行时修改：监听 `window:updateShortcut` IPC，`unregister` 旧键后重新 `register`

---

## 三、数据模型

### 3.1 完整 Schema

```json
{
  "weeks": {
    "YYYY-Www": {
      "notes": {
        "YYYY-MM-DD": ["任务一", "任务二", ""],
        "YYYY-MM-DD": ["", "", ""]
      },
      "events": {
        "YYYY-MM-DD": {
          "HH:MM": { "text": "事件内容" }
        }
      }
    }
  },
  "settings": {
    "alwaysOnTop": true,
    "opacity": 0.92,
    "startOfWeek": 1,
    "theme": "system",
    "backgroundBlur": true,
    "shortcut": "Alt+Space",
    "launchAtLogin": false,
    "windowBounds": { "x": 100, "y": 100, "width": 1100, "height": 700 }
  }
}
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `weeks` 键 | `YYYY-Www` | ISO 周字符串，支持跨年正确处理 |
| `events` 时间槽键 | `HH:MM` | 48 个固定值（`00:00` ～ `23:30`），O(1) 查找 |
| `notes[date]` | `string[3]` | 固定长度 3 的数组；空字符串表示未填写 |
| `theme` | `string` | `"system"` \| `"light"` \| `"dark"` |
| `backgroundBlur` | `boolean` | 关闭时禁用毛玻璃（降级到不透明背景） |
| `startOfWeek` | `0\|1` | `0` = 周日，`1` = 周一 |
| `windowBounds` | `object` | 动态写入，每次 resize 防抖 500ms 后更新 |

---

## 四、技术架构

### 4.1 进程模型

```
┌─────────────────────────────────────────────┐
│  Main Process (Node.js)                     │
│  main.js → windowManager.js                 │
│           → tray.js                         │
│           → store.js (electron-store)        │
│  IPC Handlers: store:get/set/getAll         │
│  IPC Listeners: window:* / shortcut:*       │
└──────────────┬──────────────────────────────┘
               │ contextBridge (preload.js)
               │ window.electronAPI.*
┌──────────────▼──────────────────────────────┐
│  Renderer Process (Browser)                 │
│  app.js → weekGrid.js                       │
│         → notesPanel.js                     │
│         → dataManager.js                    │
└─────────────────────────────────────────────┘
```

### 4.2 项目文件结构

```
D:/claude/屏幕日程插件/
├── package.json
├── PRD.md                     ← 本文档
├── src/
│   ├── main/
│   │   ├── main.js            # app 生命周期 + IPC handler 注册 + 全局快捷键
│   │   ├── windowManager.js   # BrowserWindow（亚克力/边界检查/缩放防抖）
│   │   ├── tray.js            # 系统托盘 + 右键菜单
│   │   └── store.js           # electron-store 封装
│   ├── preload/
│   │   └── preload.js         # contextBridge 安全桥接
│   └── renderer/
│       ├── index.html         # 页面骨架（标题栏 + 缩放手柄）
│       ├── app.js             # currentWeekOffset + selectedDate 状态管理
│       ├── weekGrid.js        # 48×7 网格 + 浮动编辑框 + 红线层
│       ├── notesPanel.js      # 单日三件事面板
│       ├── dataManager.js     # 渲染侧状态 + IPC 调用
│       └── styles/
│           ├── base.css       # CSS 变量、主题、文字增强
│           ├── layout.css     # Flex 布局、标题栏、缩放手柄
│           ├── grid.css       # 网格、选中列、红线、浮动编辑框
│           └── notes.css      # 笔记面板
└── assets/
    ├── icon.png / icon.ico / icon.icns
```

### 4.3 IPC 接口一览

| 方向 | 标识符 | 说明 |
|------|--------|------|
| 渲染→主（invoke） | `store:getAll` | 获取全部 store 数据 |
| 渲染→主（invoke） | `store:get` | 按 key 获取 |
| 渲染→主（invoke） | `store:set` | 按 key 写入 |
| 渲染→主（send） | `window:minimize` | 最小化 |
| 渲染→主（send） | `window:show` | 显示窗口 |
| 渲染→主（send） | `window:close` | 真正退出 |
| 渲染→主（send） | `window:setAlwaysOnTop` | 切换置顶（携带 boolean） |
| 渲染→主（send） | `window:setOpacity` | 设置透明度（携带 number） |
| 渲染→主（send） | `window:updateShortcut` | 运行时修改全局快捷键 |
| 主→渲染（on） | `theme:changed` | 系统主题变化推送 |
| 主→渲染（on） | `window:shown` | 窗口显示后触发自动聚焦 |

---

## 五、关键实现决策汇总

| 方面 | 决策 | 理由 |
|------|------|------|
| 网格布局 | CSS Grid，`grid-template-columns: 52px repeat(7, 1fr)` | 时间标签 sticky left；列宽等分自适应窗口宽度 |
| 时间格高度 | 固定 40px | 不随窗口高度压缩，防止文字叠在一起 |
| 单元格编辑 | 浮动绝对定位 `<textarea>`（非原地替换） | 时间格仅 40px 高，原地 input 显示不全；浮动框提供舒适空间 |
| 数据持久化 | `electron-store`（非 localStorage） | 写到 `%APPDATA%`，渲染进程重载不丢数据，支持 schema 校验 |
| IPC 安全模型 | `contextBridge` + `contextIsolation: true` | 渲染进程不直接接触 Node.js，消除注入风险 |
| 关闭行为 | 拦截为 `win.hide()` | Widget 类应用应驻留后台，不占任务栏 |
| 缩放持久化 | `resize` 事件 + 500ms 防抖 | resize 每秒触发数十次，不防抖会频繁 IPC |
| 多显示器 | 启动时校验 `savedBounds` 落在 `getAllDisplays()` 范围内 | 防止拔掉副屏后窗口消失在屏幕外 |
| 红线更新 | 渲染进程 `setInterval(60s)` | 精度足够，无需 IPC，轻量 |

---

## 六、开发命令

```bash
npm install          # 安装依赖
npm start            # 开发运行
npm run dev          # 开发运行（Node.js debugger 端口 5858）
npm run build:win    # 打包 Windows NSIS 安装包
npm run build:mac    # 打包 macOS DMG
```

**数据文件位置**：
- Windows：`%APPDATA%\screen-schedule\schedule-data.json`
- macOS：`~/Library/Application Support/screen-schedule/schedule-data.json`

---

## 七、实现顺序

| 阶段 | 涉及文件 | 验收标准 |
|------|----------|----------|
| 1. 窗口骨架 | `package.json` `main.js` `windowManager.js` | 窗口启动，毛玻璃效果，可拖拽；拔副屏后重启居中显示 |
| 2. 数据层 | `store.js` `preload.js` `dataManager.js` | 读写 store，重启后数据不丢 |
| 3. 网格与编辑 | `index.html` `weekGrid.js` `grid.css` | 48×7 网格渲染，点击格子弹出浮动编辑框，红线位置正确 |
| 4. 周导航 + 联动 | `app.js` | 上/下周切换数据正确；点击列笔记栏切换日期 |
| 5. 笔记面板 | `notesPanel.js` `notes.css` | 三件事输入与保存，防抖生效 |
| 6. 缩放手柄 | `layout.css` `windowManager.js` | 拖拽后重启窗口尺寸和位置与上次一致 |
| 7. 托盘 + 快捷键 | `tray.js` `main.js` | 关闭后托盘仍在；`Alt+Space` 呼出/隐藏；托盘菜单功能全部生效 |
| 8. 主题适配 | `base.css` `app.js` | 跟随系统深浅色自动切换 |
| 9. 打包 | `package.json` build config | `npm run build:win` 生成可安装的 `.exe` |

---

## 八、验收测试清单

- [ ] 启动后窗口呈半透明毛玻璃效果，可拖拽移动
- [ ] 点击时间格 → 浮动编辑框弹出，可输入长文字；`Ctrl+Enter` 提交，格内显示截断文字
- [ ] 重启应用 → 事件数据保留，窗口尺寸/位置与上次一致
- [ ] `[‹]` / `[›]` 切换周 → 数据正确，点击周范围文字回到本周
- [ ] 点击任意列 → 左侧笔记栏切换显示该日三件事
- [ ] 启动时红线位于当前时间，视口自动滚动使红线居中
- [ ] 手动将 `windowBounds.x` 改为 `99999` 后重启 → 窗口出现在主屏，不消失在屏幕外
- [ ] 点击自定义关闭 → 窗口隐藏，托盘图标保留；左键托盘 → 重新显示
- [ ] `Alt+Space` → 呼出/隐藏窗口
- [ ] 右键托盘「退出」→ 进程彻底退出
- [ ] 切换系统深/浅色模式 → 应用主题自动跟随（`theme: "system"` 下）
- [ ] 拖动右下角缩放手柄 → 网格列宽自适应；重启后尺寸保留
