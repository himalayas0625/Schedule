const { app, ipcMain, globalShortcut, Menu, dialog, BrowserWindow } = require('electron');
const { createWindow, getMainWindow } = require('./windowManager');
const { createTray } = require('./tray');
const store = require('./store');
const { autoUpdater } = require('electron-updater');

// ── IPC 参数校验（显式 allowlist）─────────────────────────────────────────────
const ALLOWED_STORE_KEYS = [
  // settings
  'settings.alwaysOnTop',
  'settings.opacity',
  'settings.startOfWeek',
  'settings.theme',
  'settings.backgroundBlur',
  'settings.shortcut',
  'settings.launchAtLogin',
  'settings.windowBounds',
  'settings.customQuotes',
  'settings._migratedWeekStartV1',
  'settings.privacyAcceptedVersion'
];

function isValidStoreKey(key) {
  if (typeof key !== 'string') return false;
  // 显式 allowlist
  if (ALLOWED_STORE_KEYS.includes(key)) return true;
  // weeks 键格式：YYYY-Wnn（如 2024-W01）
  if (/^weeks\.(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.test(key)) return true;
  return false;
}

const validate = {
  // 透明度：0.2 ~ 1.0
  opacity: (val) => typeof val === 'number' && Number.isFinite(val) && val >= 0.2 && val <= 1,
  // 快捷键校验（支持 Alt+Space、Ctrl+Shift+A 等格式）
  shortcut: (val) => {
    if (typeof val !== 'string') return false;
    const specialKeys = ['Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete',
      'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'Plus', 'Minus', 'Equal',
      ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)];
    const modifiers = ['Alt', 'Ctrl', 'Shift', 'CommandOrControl', 'Super', 'Cmd', 'CmdOrCtrl', 'Command'];
    const allKeys = [...modifiers, ...specialKeys];
    const pattern = new RegExp(
      `^(${modifiers.join('|')})(\\+(${allKeys.join('|')}|[A-Z0-9]))*$`, 'i'
    );
    return pattern.test(val);
  },
  // 布尔值
  boolean: (val) => typeof val === 'boolean'
};

// ── 自动更新（仅生产环境） ────────────────────────────────────
let lastCheckTime = 0;

function setupAutoUpdater() {
  // 开发环境跳过，避免干扰调试
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;          // 静默下载，下载完再提示
  autoUpdater.autoInstallOnAppQuit = false; // 由用户决定何时安装

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow();
    dialog.showMessageBox(win, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，正在后台下载，下载完成后会提示您安装。`,
      buttons: ['好的']
    });
  });

  // 下载进度
  autoUpdater.on('download-progress', (progressObj) => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send('update:progress', {
        percent: Math.round(progressObj.percent),
        transferred: Math.round(progressObj.transferred / 1024 / 1024 * 100) / 100,
        total: Math.round(progressObj.total / 1024 / 1024 * 100) / 100
      });
    }
    // 同时在控制台输出进度
    console.log(`[updater] 下载进度: ${Math.round(progressObj.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const win = getMainWindow();
    dialog.showMessageBox(win, {
      type: 'question',
      title: '更新就绪',
      message: `新版本 ${info.version} 已下载完成，立即重启并安装？`,
      buttons: ['立即安装', '稍后']
    }).then(({ response }) => {
      if (response === 0) {
        // 设置强制退出标志，绕过关闭拦截
        BrowserWindow.getAllWindows().forEach(w => {
          w.forceQuit = true;
          w.close();
        });
        // 强制退出并安装
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] 当前已是最新版本');
  });

  autoUpdater.on('error', (err) => {
    // 自动检查失败静默处理，不打扰用户（GitHub 在国内网络下可能超时）
    console.error('[updater] 更新检查失败:', err.message);
  });

  // 启动后延迟 10s 检查，避免与主窗口初始化竞争
  // .catch() 兜底：防止 Promise 拒绝冒泡为未处理异常，触发系统错误弹窗
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] 自动检查异常:', err.message);
    });
    lastCheckTime = Date.now();
  }, 10_000);
}

// 手动检查更新（供托盘菜单调用）
async function checkForUpdates() {
  if (!app.isPackaged) {
    const win = getMainWindow();
    dialog.showMessageBox(win, {
      type: 'info',
      title: '检查更新',
      message: '开发环境不支持更新检查。\n请使用打包后的版本。',
      buttons: ['好的']
    });
    return { available: false, message: '开发环境' };
  }

  // 防止频繁检查
  const now = Date.now();
  if (now - lastCheckTime < 60_000) {
    const win = getMainWindow();
    dialog.showMessageBox(win, {
      type: 'info',
      title: '检查更新',
      message: '刚刚已经检查过了，请稍后再试。',
      buttons: ['好的']
    });
    return { available: false, message: '请求过于频繁' };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    lastCheckTime = now;

    if (!result || !result.updateInfo) {
      throw new Error('无法获取更新信息');
    }

    const { updateInfo } = result;
    const currentVersion = app.getVersion();

    // 如果没有更新
    if (updateInfo.version === currentVersion) {
      const win = getMainWindow();
      dialog.showMessageBox(win, {
        type: 'info',
        title: '检查更新',
        message: `当前已是最新版本 ${currentVersion}`,
        buttons: ['好的']
      });
      return { available: false, currentVersion };
    }

    return { available: true, currentVersion, latestVersion: updateInfo.version };
  } catch (err) {
    console.error('[updater] 手动检查失败:', err.message);
    const win = getMainWindow();
    dialog.showMessageBox(win, {
      type: 'error',
      title: '检查更新失败',
      message: `检查更新时发生错误：\n${err.message}`,
      buttons: ['好的']
    });
    return { available: false, error: err.message };
  }
}

// 防止多实例
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  const win = getMainWindow();
  if (win) { win.show(); win.focus(); }
});

// IPC - 数据存储（添加校验）
ipcMain.handle('store:getAll', () => store.store);
ipcMain.handle('store:get', (_e, key) => {
  if (!isValidStoreKey(key)) {
    console.warn('[security] Invalid store:get key:', key);
    return undefined;
  }
  return store.get(key);
});
ipcMain.handle('store:set', (_e, key, value) => {
  if (!isValidStoreKey(key)) {
    console.warn('[security] Invalid store:set key:', key);
    return false;
  }
  // 限制 value 大小（防止内存炸弹）
  const MAX_VALUE_SIZE = 64 * 1024; // 64KB
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_VALUE_SIZE) {
      console.warn('[security] Value too large for key:', key);
      return false;
    }
  } catch {
    return false;
  }
  store.set(key, value);
  return true;
});
ipcMain.handle('store:delete', (_e, key) => {
  if (!isValidStoreKey(key)) {
    console.warn('[security] Invalid store:delete key:', key);
    return false;
  }
  store.delete(key);
  return true;
});

// 全局快捷键注册
function registerShortcut(win) {
  const shortcut = store.get('settings.shortcut') || 'Alt+Space';
  globalShortcut.unregisterAll();
  try {
    globalShortcut.register(shortcut, () => {
      if (win.isVisible()) {
        win.hide();
      } else {
        // 先设置透明度为0，等窗口合成完成后再恢复，避免闪烁
        const savedOpacity = store.get('settings.opacity') ?? 0.95;
        win.setOpacity(0);
        win.show();
        win.focus();
        setTimeout(() => {
          win.setOpacity(savedOpacity);
        }, 100);
      }
    });
  } catch (e) {
    console.warn('快捷键注册失败:', shortcut, e.message);
  }
}

// IPC - 编辑器右键菜单
ipcMain.on('show-editor-context-menu', () => {
  const win = getMainWindow();
  const menu = Menu.buildFromTemplate([
    { role: 'cut',   label: '剪切' },
    { role: 'copy',  label: '复制' },
    { role: 'paste', label: '粘贴' },
    { type: 'separator' },
    {
      label: '🗑 删除日程',
      click() { win && win.webContents.send('trigger-event-delete'); }
    }
  ]);
  menu.popup({ window: win });
});

// IPC - 运行时修改快捷键（添加校验）
ipcMain.on('window:updateShortcut', (_e, newShortcut) => {
  if (!validate.shortcut(newShortcut)) {
    console.warn('[security] Invalid shortcut:', newShortcut);
    return;
  }
  store.set('settings.shortcut', newShortcut);
  const win = getMainWindow();
  if (win) registerShortcut(win);
});

app.whenReady().then(() => {
  // ── 一次性迁移：将旧版"周一起始"重置为"周日起始" ───────────────────────────
  if (!store.get('settings._migratedWeekStartV1')) {
    store.set('settings.startOfWeek', 0);
    store.set('settings._migratedWeekStartV1', true);
  }

  // 同步开机自启设置到系统（仅打包后生效，开发模式跳过）
  if (app.isPackaged) {
    const launchAtLogin = store.get('settings.launchAtLogin') ?? false;
    app.setLoginItemSettings({ openAtLogin: launchAtLogin });
  }

  const win = createWindow(store);
  createTray(win, store, checkForUpdates);
  registerShortcut(win);
  setupAutoUpdater();
});

// 隐私说明"不同意"时完整退出
ipcMain.on('app:quit', () => {
  app.exit(0);
});

app.on('before-quit', () => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.forceQuit = true;
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// macOS: 点击 Dock 图标重新显示
app.on('activate', () => {
  const win = getMainWindow();
  if (win) { win.show(); win.focus(); }
});
