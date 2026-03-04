# Schedule - 桌面浮动日程

一款简洁优雅的 Electron 桌面日程管理应用，支持日/周/月视图，让你轻松规划每一天。

## 功能特性

### 📅 多视图切换

- **日视图**：专注当天，顶部显示日期、农历、天气和每日名言
- **周视图**：48×7 时间网格，纵览一周安排
- **月视图**：日历形式，快速跳转到指定日期

### ✏️ 日程管理

- 点击时间格即可添加日程
- 支持多种颜色标记（蓝/红/绿）
- 同一时间槽支持多个事件
- 无感自动保存，输入即存储
- 红线标记当前时间

### 📝 笔记面板

- **左侧**：每日"三件事"笔记，聚焦当天重点
- **右侧**：本周重点，把握一周目标
- 面板宽度可自由拖拽调整

### 🎨 个性定制

- 深色/浅色主题自动跟随系统
- 自定义每日名言（托盘菜单 → 我的名言）
- 全局快捷键快速唤起（默认 `Alt+Space`）

### 🔔 系统集成

- 系统托盘常驻，最小化到托盘
- 开机自启动
- 始终置顶选项
- 自动检测更新

## 安装

### 下载安装包

从 [Releases](https://github.com/himalayas0625/Schedule/releases) 页面下载最新版本安装包。

### 从源码运行

```bash
# 克隆仓库
git clone https://github.com/himalayas0625/Schedule.git
cd Schedule

# 安装依赖（推荐使用国内镜像）
npm config set registry https://registry.npmmirror.com
npm_config_ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install

# 启动应用
npm start
```

## 使用指南

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+Space` | 显示/隐藏窗口（可自定义） |
| `Esc` | 关闭编辑框 |
| `Ctrl/Cmd + Enter` | 保存名言编辑 |

### 托盘菜单

右键托盘图标可访问：

- 显示/隐藏窗口
- 始终置顶
- 开机自启
- 我的名言
- 检查更新
- 退出

### 数据存储

数据保存在本地：

- **Windows**: `%APPDATA%\screen-schedule\schedule-data.json`
- **macOS**: `~/Library/Application Support/screen-schedule/schedule-data.json`

## 开发

### 命令

```bash
npm start          # 启动应用
npm run dev        # 启动应用 + Node.js 调试（端口 5858）
npm run build:win  # 打包 Windows 安装包
npm run build:mac  # 打包 macOS DMG
npm run release    # 打包并发布到 GitHub Releases
```

### 技术栈

- **Electron** - 跨平台桌面应用框架
- **electron-store** - 本地数据持久化
- **electron-updater** - 自动更新

### 架构

```
src/
├── main/           # 主进程
│   ├── main.js     # 应用生命周期、IPC、全局快捷键
│   ├── windowManager.js  # 窗口管理
│   ├── tray.js     # 系统托盘
│   └── store.js    # 数据存储封装
├── preload/        # 预加载脚本
│   └── preload.js  # 安全桥接层
└── renderer/       # 渲染进程
    ├── app.js      # 状态管理
    ├── weekGrid.js # 时间网格组件
    ├── notesPanel.js # 笔记面板
    ├── dataManager.js # 数据读写
    ├── weatherWidget.js # 天气组件
    └── styles/     # 样式文件
```

## 发布新版本

使用 `/release` 命令或手动执行：

```bash
# 1. 更新 package.json 中的版本号
# 2. 提交并推送
git add . && git commit -m "v1.0.x"
git push

# 3. 发布
npm run release
```

## 许可证

MIT License

---

<p align="center">用 ❤️ 打造</p>
