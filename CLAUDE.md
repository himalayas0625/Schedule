# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # 安装依赖（需设置镜像：npm config set registry https://registry.npmmirror.com）
npm start            # 启动应用（开发模式）
npm run dev          # 启动应用 + Node.js debugger（端口 5858）
npm run build:win    # 打包 Windows NSIS 安装包
npm run build:mac    # 打包 macOS DMG
```

Electron 下载需配置镜像环境变量：
```bash
npm_config_ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

数据持久化位置：`%APPDATA%\screen-schedule\schedule-data.json`（Windows）

## Architecture

Electron 三进程架构，严格安全隔离：

```
Main Process (Node.js)
  main.js          — app 生命周期、IPC handlers、全局快捷键
  windowManager.js — BrowserWindow（透明/亚克力/边界检查/缩放防抖）
  tray.js          — 系统托盘、右键菜单、关闭拦截
  store.js         — electron-store 封装

Preload (contextBridge)
  preload.js       — 唯一的 Node↔Browser 安全桥接，暴露 window.electronAPI

Renderer (Browser)
  app.js           — 状态管理中心（currentWeekOffset, selectedDate）
  weekGrid.js      — 48×7 网格、浮动编辑框（FloatingEditor）、红线（CurrentTimeLayer）
  notesPanel.js    — 单日三件事面板，响应列选中联动
  dataManager.js   — 渲染侧数据读写，防止直接调用 electronAPI
```

## Key Design Decisions

- **关闭行为**：`close` 事件被拦截为 `win.hide()`；托盘"退出"才真正 `app.exit(0)`
- **时间格高度**：固定 `40px`（CSS `--cell-height`），不随窗口高度缩放
- **单元格编辑**：`#floating-editor` 全局唯一浮动框，`position:fixed`，在格子下方弹出，边界自动翻转
- **红线**：`position:absolute` 在 `#grid-body` 内，`setInterval` 每 60s 更新 top
- **数据存储键**：周用 ISO 周字符串 `YYYY-Www`，时间槽用 `HH:MM`（48个固定值）
- **多显示器安全**：`windowManager.js` 启动时校验 `savedBounds` 是否在 `getAllDisplays()` 范围内

## IPC Interface

渲染→主（invoke）：`store:getAll` / `store:get` / `store:set`
渲染→主（send）：`window:minimize|show|close|setAlwaysOnTop|setOpacity|updateShortcut`
主→渲染（on）：`theme:changed` / `window:shown`
