const { BrowserWindow, screen, ipcMain, nativeTheme, app } = require('electron');
const path = require('path');

let mainWindow = null;

// ── 本地校验器（不依赖外部模块）───────────────────────────────────────────────
const validate = {
  opacity: (val) => typeof val === 'number' && Number.isFinite(val) && val >= 0.2 && val <= 1,
  boolean: (val) => typeof val === 'boolean'
};

function isInAnyDisplay(x, y) {
  const displays = screen.getAllDisplays();
  return displays.some(d => {
    const { bounds } = d;
    return x >= bounds.x && x < bounds.x + bounds.width &&
           y >= bounds.y && y < bounds.y + bounds.height;
  });
}

function createWindow(store) {
  const savedBounds = store.get('settings.windowBounds');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primaryDisplay.workAreaSize;

  const defaultWidth = 1100;
  const defaultHeight = 700;

  // 多显示器边界安全检查
  let x, y, width, height;
  if (savedBounds && isInAnyDisplay(savedBounds.x, savedBounds.y)) {
    x = savedBounds.x;
    y = savedBounds.y;
    width = savedBounds.width || defaultWidth;
    height = savedBounds.height || defaultHeight;
  } else {
    x = Math.round((sw - defaultWidth) / 2);
    y = Math.round((sh - defaultHeight) / 2);
    width = defaultWidth;
    height = defaultHeight;
  }

  const winOptions = {
    x, y, width, height,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'logo.png')
      : path.join(__dirname, '../../logo.png'),
    alwaysOnTop: store.get('settings.alwaysOnTop') ?? true,
    hasShadow: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };

  mainWindow = new BrowserWindow(winOptions);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // ── 安全：严格拦截导航与新窗口 ──────────────────────────────────────────────
  const allowedPage = path.resolve(__dirname, '../renderer/index.html');

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      // 使用 URL 解析 + 路径归一化（处理中文路径与 % 编码）
      const requestedPath = decodeURIComponent(new URL(url).pathname)
        .replace(/^\//, '')  // 移除开头的 /
        .replace(/\//g, path.sep);
      const resolvedRequested = path.resolve(requestedPath);
      if (resolvedRequested !== allowedPage) {
        event.preventDefault();
        console.warn('[security] Blocked navigation to:', url);
      }
    } catch {
      event.preventDefault();
      console.warn('[security] Blocked invalid URL:', url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn('[security] Blocked window.open:', url);
    return { action: 'deny' };
  });

  // 缩放防抖保存
  let resizeTimer = null;
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        store.set('settings.windowBounds', mainWindow.getBounds());
      }
    }, 500);
  });

  // 拦截关闭 → 隐藏
  mainWindow.on('close', (e) => {
    if (!mainWindow.forceQuit) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // 窗口显示时通知渲染进程（用于自动聚焦到红线）
  mainWindow.on('show', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:shown');
    }
  });

  // 系统主题变化推送
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme:changed', theme);
    }
  });

  // 最大化/还原时通知渲染进程更新按钮图标
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximizeChanged', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximizeChanged', false);
  });

  // IPC - 窗口控制
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:show', () => mainWindow?.show());
  ipcMain.on('window:close', () => {
    mainWindow.forceQuit = true;
    mainWindow?.close();
  });
  ipcMain.on('window:setAlwaysOnTop', (_e, value) => {
    mainWindow?.setAlwaysOnTop(value);
    store.set('settings.alwaysOnTop', value);
  });
  ipcMain.on('window:setOpacity', (_e, value) => {
    if (!validate.opacity(value)) {
      console.warn('[security] Invalid opacity:', value);
      return;
    }
    mainWindow?.setOpacity(value);
    store.set('settings.opacity', value);
  });

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

module.exports = { createWindow, getMainWindow };
